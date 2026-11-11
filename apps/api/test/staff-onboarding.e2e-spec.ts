import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AppModule } from '../src/app.module';
import { SESSION_COOKIE_NAME } from '../src/auth/cookie.util';
import { AllExceptionsFilter } from '../src/common/http-exception.filter';
import { ONBOARDING_PURPOSE } from '../src/org/staff-onboarding.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { purgeAuditLogs } from './helpers/append-only';
import type { MockSmsProvider } from '../src/sms/mock-sms.provider';
import { SMS_PROVIDER } from '../src/sms/sms-provider.interface';

/**
 * Admin-initiated staff onboarding (e2e, real Postgres).
 *
 * Mirrors the throttle-aware harness of the other e2e specs: exactly TWO real
 * OTP logins (admin + one non-admin), both in `beforeAll` (4 auth calls < the
 * 5/IP cap). Onboarding endpoints are NOT under the `/auth/*` throttle, and
 * every assertion about pending/verify/scope is DB-driven, so no further auth
 * calls are needed. OTP codes are read from the mock SMS provider.
 */
describe('Staff onboarding (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let sms: MockSmsProvider;

  const runId = `onb-${Date.now()}`;
  let panchayatId: string;
  let ward1Id: string;
  let ward2Id: string;
  let inactiveWardId: string;
  let inactivePanchayatId: string;

  let admin: { cookie: string; userId: string };
  let citizen: { cookie: string; userId: string };

  let phoneCounter = 0;
  function freshPhone(): string {
    phoneCounter += 1;
    const tail = `${Date.now()}${phoneCounter}`.slice(-9).padStart(9, '0');
    return `+919${tail}`;
  }

  const api = () => request(app.getHttpServer());
  const asAdmin = (r: request.Test) => r.set('Cookie', admin.cookie);

  async function login(phone: string): Promise<{ cookie: string; userId: string }> {
    await api().post('/api/v1/auth/request-otp').send({ phone });
    const code = sms.lastCodeFor(phone);
    const verify = await api().post('/api/v1/auth/verify-otp').send({ phone, code });
    const setCookie = verify.get('Set-Cookie');
    const cookies = Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : [];
    const cookie = cookies.find((c) => c.startsWith(`${SESSION_COOKIE_NAME}=`));
    if (!cookie) throw new Error('login failed: no session cookie');
    return { cookie, userId: verify.body.id as string };
  }

  /** Initiates an onboarding as admin and returns the response. */
  function initiate(body: Record<string, unknown>) {
    return asAdmin(api().post('/api/v1/onboarding')).send(body);
  }

  const createdOnboardingIds: string[] = [];

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalFilters(new AllExceptionsFilter());
    app.use(cookieParser());
    await app.init();

    prisma = moduleFixture.get(PrismaService);
    sms = moduleFixture.get(SMS_PROVIDER);

    const panchayat = await prisma.panchayat.create({
      data: { code: `${runId}-p`, name: 'Onb Panchayat', nameMl: 'ml' },
    });
    panchayatId = panchayat.id;
    ward1Id = (await prisma.ward.create({ data: { panchayatId, number: 1, name: 'W1', nameMl: 'ml' } })).id;
    ward2Id = (await prisma.ward.create({ data: { panchayatId, number: 2, name: 'W2', nameMl: 'ml' } })).id;
    inactiveWardId = (
      await prisma.ward.create({ data: { panchayatId, number: 3, name: 'W3', nameMl: 'ml', status: 'inactive' } })
    ).id;
    const inactivePanchayat = await prisma.panchayat.create({
      data: { code: `${runId}-pi`, name: 'Inactive', nameMl: 'ml', status: 'inactive' },
    });
    inactivePanchayatId = inactivePanchayat.id;

    admin = await login(freshPhone());
    citizen = await login(freshPhone());
    await prisma.roleAssignment.create({ data: { userId: admin.userId, role: 'ADMIN' } });
  });

  afterAll(async () => {
    const userIds = [admin.userId, citizen.userId];
    // Clean onboarded users (by the phones we created) + their assignments.
    const onboardings = await prisma.staffOnboarding.findMany({
      where: { id: { in: createdOnboardingIds } },
    });
    const onboardedPhones = [...new Set(onboardings.map((o) => o.phone))];
    const onboardedUsers = await prisma.user.findMany({ where: { phone: { in: onboardedPhones } } });
    const allUserIds = [...userIds, ...onboardedUsers.map((u) => u.id)];
    await purgeAuditLogs(prisma, { actorUserId: { in: allUserIds } });
    await prisma.staffOnboarding.deleteMany({ where: { phone: { in: onboardedPhones } } });
    await prisma.roleAssignment.deleteMany({ where: { userId: { in: allUserIds } } });
    await prisma.otpChallenge.deleteMany({ where: { phone: { in: onboardedPhones } } });
    await prisma.ward.deleteMany({ where: { id: { in: [ward1Id, ward2Id, inactiveWardId] } } });
    await prisma.panchayat.deleteMany({ where: { id: { in: [panchayatId, inactivePanchayatId] } } });
    await prisma.session.deleteMany({ where: { userId: { in: allUserIds } } });
    await prisma.user.deleteMany({ where: { id: { in: allUserIds } } });
    await app.close();
  });

  function track(res: { body: { id?: string } }): string {
    const id = res.body.id as string;
    createdOnboardingIds.push(id);
    return id;
  }

  // ---- Authorization -----------------------------------------------------

  it('rejects non-admin and unauthenticated access', async () => {
    const asCitizen = await api()
      .post('/api/v1/onboarding')
      .set('Cookie', citizen.cookie)
      .send({ phone: freshPhone(), role: 'REPRESENTATIVE', wardIds: [ward1Id] });
    expect(asCitizen.status).toBe(403);

    const noSession = await api().get('/api/v1/onboarding');
    expect(noSession.status).toBe(401);

    const listCitizen = await api().get('/api/v1/onboarding').set('Cookie', citizen.cookie);
    expect(listCitizen.status).toBe(403);
  });

  // ---- Initiate + pending grants no access -------------------------------

  it('initiates onboarding for a NEW phone: pending, no user, no assignment, onboarding-purpose OTP', async () => {
    const phone = freshPhone();
    const res = await initiate({ phone, role: 'REPRESENTATIVE', wardIds: [ward1Id] });
    expect([200, 201]).toContain(res.status);
    track(res);
    expect(res.body.status).toBe('pending');
    expect(res.body.userExists).toBe(false);

    // Pending grants no access: no user account, no role assignment yet.
    expect(await prisma.user.findUnique({ where: { phone } })).toBeNull();
    expect(await prisma.roleAssignment.count({ where: { wardId: ward1Id, revokedAt: null } })).toBe(0);

    // OTP was issued under the onboarding purpose, NOT login.
    const onbChallenge = await prisma.otpChallenge.findFirst({
      where: { phone, purpose: ONBOARDING_PURPOSE },
    });
    expect(onbChallenge).not.toBeNull();
    expect(await prisma.otpChallenge.count({ where: { phone, purpose: 'login' } })).toBe(0);
  });

  it('prevents a second pending onboarding for the same phone', async () => {
    const phone = freshPhone();
    track(await initiate({ phone, role: 'REPRESENTATIVE', wardIds: [ward1Id] }));
    const dup = await initiate({ phone, role: 'REPRESENTATIVE', wardIds: [ward2Id] });
    expect(dup.status).toBe(409);
  });

  // ---- Validation --------------------------------------------------------

  it('rejects inactive ward / inactive panchayat / scope-role mismatch', async () => {
    const inactiveWard = await initiate({ phone: freshPhone(), role: 'REPRESENTATIVE', wardIds: [inactiveWardId] });
    expect(inactiveWard.status).toBe(409);

    const inactivePan = await initiate({ phone: freshPhone(), role: 'COORDINATOR', panchayatIds: [inactivePanchayatId] });
    expect(inactivePan.status).toBe(409);

    // REPRESENTATIVE must not carry panchayat scope (schema superRefine).
    const mismatch = await initiate({ phone: freshPhone(), role: 'REPRESENTATIVE', panchayatIds: [panchayatId] });
    expect(mismatch.status).toBeGreaterThanOrEqual(400);
  });

  // ---- Verify success + replay + idempotency -----------------------------

  it('verifies OTP → activates exactly the intended assignment(s), idempotent on replay', async () => {
    const phone = freshPhone();
    const init = await initiate({ phone, role: 'REPRESENTATIVE', wardIds: [ward1Id, ward2Id] });
    const id = track(init);

    const code = sms.lastCodeFor(phone);
    const verify = await asAdmin(api().post(`/api/v1/onboarding/${id}/verify`)).send({ code });
    expect(verify.status).toBe(200);
    expect(verify.body.status).toBe('verified');

    const user = await prisma.user.findUnique({ where: { phone }, include: { roleAssignments: true } });
    expect(user).not.toBeNull();
    const active = user!.roleAssignments.filter((r) => r.revokedAt === null);
    expect(active).toHaveLength(2);
    expect(active.every((r) => r.role === 'REPRESENTATIVE')).toBe(true);
    expect(new Set(active.map((r) => r.wardId))).toEqual(new Set([ward1Id, ward2Id]));
    // Only REPRESENTATIVE — no stray COORDINATOR/ADMIN.
    expect(user!.roleAssignments.some((r) => r.role !== 'REPRESENTATIVE')).toBe(false);

    // Replay the same verify → idempotent (no duplicate assignments, still verified).
    const replay = await asAdmin(api().post(`/api/v1/onboarding/${id}/verify`)).send({ code });
    expect(replay.status).toBe(200);
    expect(replay.body.status).toBe('verified');
    const after = await prisma.roleAssignment.count({ where: { userId: user!.id, revokedAt: null } });
    expect(after).toBe(2);

    // Audit events for initiate + verify.
    expect(await prisma.auditLog.count({ where: { action: 'staff.onboarding_initiated', entityId: id } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { action: 'staff.onboarding_verified', entityId: id } })).toBe(1);
  });

  it('rejects a wrong OTP and keeps the onboarding pending', async () => {
    const phone = freshPhone();
    const id = track(await initiate({ phone, role: 'COORDINATOR', panchayatIds: [panchayatId] }));
    const bad = await asAdmin(api().post(`/api/v1/onboarding/${id}/verify`)).send({ code: '000000' });
    expect(bad.status).toBe(401);
    const row = await prisma.staffOnboarding.findUnique({ where: { id } });
    expect(row?.status).toBe('pending');
    expect(await prisma.roleAssignment.count({ where: { panchayatId, role: 'COORDINATOR', revokedAt: null } })).toBe(0);
  });

  it('rejects verification after expiry', async () => {
    const phone = freshPhone();
    const id = track(await initiate({ phone, role: 'REPRESENTATIVE', wardIds: [ward1Id] }));
    // Force the onboarding window (and its OTP) into the past.
    await prisma.staffOnboarding.update({ where: { id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    const code = sms.lastCodeFor(phone);
    const res = await asAdmin(api().post(`/api/v1/onboarding/${id}/verify`)).send({ code });
    expect(res.status).toBe(409);
    const row = await prisma.staffOnboarding.findUnique({ where: { id } });
    expect(row?.status).toBe('expired');
  });

  // ---- Resend cooldown + cancel ------------------------------------------

  it('enforces the resend cooldown', async () => {
    const phone = freshPhone();
    const id = track(await initiate({ phone, role: 'REPRESENTATIVE', wardIds: [ward1Id] }));
    const resend = await asAdmin(api().post(`/api/v1/onboarding/${id}/resend`));
    expect(resend.status).toBe(429);
  });

  it('cancels a pending onboarding; verification then fails', async () => {
    const phone = freshPhone();
    const id = track(await initiate({ phone, role: 'REPRESENTATIVE', wardIds: [ward1Id] }));
    const cancel = await asAdmin(api().post(`/api/v1/onboarding/${id}/cancel`));
    expect(cancel.status).toBe(200);
    expect(cancel.body.status).toBe('cancelled');
    const code = sms.lastCodeFor(phone);
    const verify = await asAdmin(api().post(`/api/v1/onboarding/${id}/verify`)).send({ code });
    expect(verify.status).toBe(409);
    // No assignment was created.
    const user = await prisma.user.findUnique({ where: { phone } });
    expect(user).toBeNull();
  });

  it('verifying one onboarding does not touch an unrelated pending onboarding', async () => {
    const phoneA = freshPhone();
    const phoneB = freshPhone();
    const idA = track(await initiate({ phone: phoneA, role: 'COORDINATOR', panchayatIds: [panchayatId] }));
    const idB = track(await initiate({ phone: phoneB, role: 'REPRESENTATIVE', wardIds: [ward1Id] }));

    const code = sms.lastCodeFor(phoneA);
    await asAdmin(api().post(`/api/v1/onboarding/${idA}/verify`)).send({ code }).expect(200);

    // B stays pending; its phone still has no user/assignment.
    const rowB = await prisma.staffOnboarding.findUnique({ where: { id: idB } });
    expect(rowB?.status).toBe('pending');
    expect(await prisma.user.findUnique({ where: { phone: phoneB } })).toBeNull();
  });
});
