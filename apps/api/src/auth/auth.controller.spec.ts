import type { Request, Response } from 'express';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AuditService } from '../audit/audit.service';
import { ApiError } from '../common/api-error';
import { PrismaService } from '../prisma/prisma.service';
import { MockSmsProvider } from '../sms/mock-sms.provider';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { SESSION_COOKIE_NAME } from './cookie.util';
import { OtpService } from './otp.service';
import { SessionService } from './session.service';

let phoneCounter = 0;

/** Generates a fresh, collision-free phone number for each test. */
function freshPhone(): string {
  phoneCounter += 1;
  const suffix = `${Date.now()}${phoneCounter}`.slice(-9).padStart(9, '0');
  return `+91${suffix}`;
}

/** Minimal fake Express Response capturing cookies set via res.cookie(). */
function fakeResponse(): Response {
  const cookies: Record<string, { value: string; options: unknown }> = {};
  return {
    cookie: vi.fn((name: string, value: string, options: unknown) => {
      cookies[name] = { value, options };
    }),
    cookies,
  } as unknown as Response;
}

/** Minimal fake Express Request with the given cookies and ip. */
function fakeRequest(cookies: Record<string, string> = {}): Request {
  return {
    cookies,
    ip: '203.0.113.9',
    get: (_header: string) => 'test-agent',
  } as unknown as Request;
}

describe('AuthController (audit wiring)', () => {
  const prisma = new PrismaService();
  const auditedIds: string[] = [];

  function makeController() {
    const sms = new MockSmsProvider();
    const otp = new OtpService(prisma, sms);
    const sessions = new SessionService(prisma);
    const auth = new AuthService(prisma);
    const audit = new AuditService(prisma);
    const controller = new AuthController(otp, sessions, auth, audit);
    return { controller, otp, sessions, auth, audit, sms };
  }

  afterEach(async () => {
    if (auditedIds.length > 0) {
      await prisma.auditLog.deleteMany({ where: { id: { in: auditedIds } } });
      auditedIds.length = 0;
    }
  });

  async function findAuditRows(action: string, phone: string) {
    const rows = await prisma.auditLog.findMany({
      where: { action, entityType: 'User' },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
    // Filter down to rows plausibly tied to this test's phone via masked
    // metadata, since entityId may not be set pre-verification.
    return rows.filter((r) => {
      const meta = r.metadata as Record<string, unknown> | null;
      const masked = meta?.phoneMasked as string | undefined;
      return masked !== undefined && phone.endsWith(masked.replace(/^\*+/, ''));
    });
  }

  it('requestOtp emits an otp.requested audit row with a masked phone, no raw phone/code', async () => {
    const { controller } = makeController();
    const phone = freshPhone();

    await controller.requestOtp({ phone });

    const rows = await findAuditRows('otp.requested', phone);
    expect(rows.length).toBeGreaterThanOrEqual(1);
    const row = rows[0];
    if (!row) throw new Error('expected an otp.requested audit row');
    auditedIds.push(row.id);

    const meta = row.metadata as Record<string, unknown>;
    expect(JSON.stringify(meta)).not.toContain(phone);
    expect(meta.phoneMasked).toMatch(/^\*+\d{2,4}$/);
  });

  it('verifyOtp success emits otp.verified and session.created audit rows', async () => {
    const { controller, otp, sms } = makeController();
    const phone = freshPhone();

    await otp.request(phone);
    const code = sms.lastCodeFor(phone) as string;

    const res = fakeResponse();
    const req = fakeRequest();

    await controller.verifyOtp({ phone, code }, req, res);

    const verifiedRows = await findAuditRows('otp.verified', phone);
    const sessionRows = await findAuditRows('session.created', phone);

    expect(verifiedRows.length).toBeGreaterThanOrEqual(1);
    expect(sessionRows.length).toBeGreaterThanOrEqual(1);
    auditedIds.push(...verifiedRows.map((r) => r.id), ...sessionRows.map((r) => r.id));

    for (const row of [...verifiedRows, ...sessionRows]) {
      expect(row.actorUserId).not.toBeNull();
      expect(JSON.stringify(row.metadata)).not.toContain(code);
      expect(JSON.stringify(row.metadata)).not.toContain(phone);
    }
  });

  it('verifyOtp failure emits an otp.failed audit row WITHOUT the raw code, and re-throws the uniform ApiError unchanged', async () => {
    const { controller, otp } = makeController();
    const phone = freshPhone();

    await otp.request(phone);
    const wrongCode = '000000';

    const res = fakeResponse();
    const req = fakeRequest();

    const attempt = controller.verifyOtp({ phone, code: wrongCode }, req, res);

    await expect(attempt).rejects.toBeInstanceOf(ApiError);
    await attempt.catch((err: ApiError) => {
      expect(err.code).toBe('invalid_otp');
      expect(err.status).toBe(401);
      expect(err.messageKey).toBe('auth.invalidCode');
    });

    const failedRows = await findAuditRows('otp.failed', phone);
    expect(failedRows.length).toBeGreaterThanOrEqual(1);
    const row = failedRows[0];
    if (!row) throw new Error('expected an otp.failed audit row');
    auditedIds.push(row.id);

    const metaStr = JSON.stringify(row.metadata);
    expect(metaStr).not.toContain(wrongCode);
    expect(metaStr).not.toContain(phone);
  });

  it('logout emits a session.revoked audit row when a token was present', async () => {
    const { controller, sessions, auth } = makeController();
    const phone = freshPhone();
    const user = await auth.findOrCreateCitizenByPhone(phone);
    const { token } = await sessions.create(user.id);

    const res = fakeResponse();
    const req = fakeRequest({ [SESSION_COOKIE_NAME]: token });

    await controller.logout(req, res);

    const rows = await prisma.auditLog.findMany({
      where: { action: 'session.revoked', actorUserId: user.id },
      orderBy: { createdAt: 'desc' },
      take: 5,
    });
    expect(rows.length).toBeGreaterThanOrEqual(1);
    auditedIds.push(...rows.map((r) => r.id));
  });

  it('logout does NOT emit session.revoked when no token was present', async () => {
    const { controller } = makeController();

    const res = fakeResponse();
    const req = fakeRequest();

    const before = await prisma.auditLog.count({ where: { action: 'session.revoked' } });
    await controller.logout(req, res);
    const after = await prisma.auditLog.count({ where: { action: 'session.revoked' } });

    expect(after).toBe(before);
  });
});
