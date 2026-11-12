import type { Request, Response } from 'express';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AuditService } from '../audit/audit.service';
import { ApiError } from '../common/api-error';
import { PrismaService } from '../prisma/prisma.service';

import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { SESSION_COOKIE_NAME } from './cookie.util';
import { MockMsg91Verifier } from './msg91/mock-msg91.verifier';
import { SessionService } from './session.service';

let phoneCounter = 0;

/** Fresh phone that satisfies `phoneSchema` (`/^\+91[6-9]\d{9}$/`). */
function freshPhone(): string {
  phoneCounter += 1;
  const tail = `${Date.now()}${phoneCounter}`.slice(-9).padStart(9, '0');
  return `+919${tail}`;
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
    const verifier = new MockMsg91Verifier();
    const sessions = new SessionService(prisma);
    const auth = new AuthService(prisma);
    const audit = new AuditService(prisma);
    const controller = new AuthController(verifier, sessions, auth, audit);
    return { controller, verifier, sessions, auth, audit };
  }

  afterEach(async () => {
    if (auditedIds.length > 0) {
      // AuditLog is append-only (M4C trigger); purge test rows via the
      // documented superuser escape hatch (disable triggers for this tx).
      await prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(`SET LOCAL session_replication_role = 'replica'`);
        await tx.auditLog.deleteMany({ where: { id: { in: auditedIds } } });
      });
      auditedIds.length = 0;
    }
  });

  async function findAuditRows(action: string, phone: string) {
    const rows = await prisma.auditLog.findMany({
      where: { action, entityType: 'User' },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
    return rows.filter((r) => {
      const meta = r.metadata as Record<string, unknown> | null;
      const masked = meta?.phoneMasked as string | undefined;
      return masked !== undefined && phone.endsWith(masked.replace(/^\*+/, ''));
    });
  }

  it('verify-token success emits otp.verified + session.created rows (masked, no raw phone/token)', async () => {
    const { controller } = makeController();
    const phone = freshPhone();
    const token = `test-otp:${phone}`;

    await controller.verifyToken({ accessToken: token }, fakeRequest(), fakeResponse());

    const verifiedRows = await findAuditRows('otp.verified', phone);
    const sessionRows = await findAuditRows('session.created', phone);

    expect(verifiedRows.length).toBeGreaterThanOrEqual(1);
    expect(sessionRows.length).toBeGreaterThanOrEqual(1);
    auditedIds.push(...verifiedRows.map((r) => r.id), ...sessionRows.map((r) => r.id));

    for (const row of [...verifiedRows, ...sessionRows]) {
      expect(row.actorUserId).not.toBeNull();
      expect(JSON.stringify(row.metadata)).not.toContain(token);
      expect(JSON.stringify(row.metadata)).not.toContain(phone);
    }
  });

  it('verify-token failure emits otp.failed (no raw token) and re-throws the uniform ApiError', async () => {
    const { controller } = makeController();
    const badToken = 'garbage-not-a-msg91-token';

    const before = await prisma.auditLog.count({ where: { action: 'otp.failed' } });
    const attempt = controller.verifyToken({ accessToken: badToken }, fakeRequest(), fakeResponse());

    await expect(attempt).rejects.toBeInstanceOf(ApiError);
    await attempt.catch((err: ApiError) => {
      expect(err.code).toBe('invalid_token');
      expect(err.status).toBe(401);
    });

    const after = await prisma.auditLog.count({ where: { action: 'otp.failed' } });
    expect(after).toBe(before + 1);
    const newest = await prisma.auditLog.findFirst({
      where: { action: 'otp.failed' },
      orderBy: { createdAt: 'desc' },
    });
    if (!newest) throw new Error('expected an otp.failed audit row');
    auditedIds.push(newest.id);
    expect(JSON.stringify(newest.metadata)).not.toContain(badToken);
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

    const before = await prisma.auditLog.count({ where: { action: 'session.revoked' } });
    await controller.logout(fakeRequest(), fakeResponse());
    const after = await prisma.auditLog.count({ where: { action: 'session.revoked' } });

    expect(after).toBe(before);
  });
});
