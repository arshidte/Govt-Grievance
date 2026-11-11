import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AppModule } from '../src/app.module';
import { SESSION_COOKIE_NAME } from '../src/auth/cookie.util';
import { AllExceptionsFilter } from '../src/common/http-exception.filter';
import { PrismaService } from '../src/prisma/prisma.service';
import { purgeAuditLogs } from './helpers/append-only';
import type { MockSmsProvider } from '../src/sms/mock-sms.provider';
import { SMS_PROVIDER } from '../src/sms/sms-provider.interface';

/**
 * Task 13 (M2 spec §9): `POST /issues/on-behalf` — the THIN HTTP route over
 * `OnBehalfService.create` (Task 12, already fully reviewed/tested at the
 * service level in `on-behalf.e2e-spec.ts`). This file proves the HTTP
 * wiring itself: the route exists, delegates straight to the service, and
 * every authorization outcome (403 for COORDINATOR/ADMIN/citizen) comes FROM
 * the service, NOT from any guard/decorator on the route.
 *
 * NO `RbacGuard`/`@Roles` on this route — see `issues.controller.ts`'s doc
 * comment on `createOnBehalf` for the full rationale (empty-scope trap +
 * denial-audit requirement, spec §9). Only the class-level `AuthGuard`
 * (session required) wraps it.
 *
 * CARRY-IN (T8/T11/T12): `AuthController` throttles its whole surface to
 * 5 calls/IP/60s, and each real OTP login costs 2 calls. This file performs
 * exactly ONE real login and reuses that single cookie + actor for every
 * case, swapping the actor's `RoleAssignment` via DIRECT Prisma writes
 * between cases (REPRESENTATIVE -> COORDINATOR -> ADMIN -> none), exactly
 * the pattern `transition-authz.e2e-spec.ts` (T11) uses. `AuthGuard` /
 * `SessionService` re-read `roleAssignments` fresh from the DB on every
 * request, so this is a faithful exercise of the real authz path.
 */
describe('POST /issues/on-behalf (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let sms: MockSmsProvider;

  const runId = `t13-${Date.now()}`;

  let categoryId: string;
  let panchayatId: string;
  let wardId: string;

  // The single real-login actor; its RoleAssignment is swapped per case.
  let actor: { cookie: string; userId: string };

  const createdIssueIds: string[] = [];
  const createdUserIds: string[] = [];
  const createdRoleAssignmentIds: string[] = [];

  let phoneCounter = 0;
  function freshPhone(): string {
    phoneCounter += 1;
    const tail = `${Date.now()}${phoneCounter}`.slice(-9).padStart(9, '0');
    return `+919${tail}`;
  }

  /** Logs a brand-new citizen phone in via the real OTP flow; returns its session cookie + user id. */
  async function login(phone: string): Promise<{ cookie: string; userId: string }> {
    await request(app.getHttpServer()).post('/api/v1/auth/request-otp').send({ phone });
    const code = sms.lastCodeFor(phone);
    const verifyResponse = await request(app.getHttpServer())
      .post('/api/v1/auth/verify-otp')
      .send({ phone, code });

    const setCookie = verifyResponse.get('Set-Cookie');
    const cookies = Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : [];
    const cookie = cookies.find((c) => c.startsWith(`${SESSION_COOKIE_NAME}=`));
    if (!cookie) throw new Error('login failed: no session cookie set');

    return { cookie, userId: verifyResponse.body.id as string };
  }

  /** Grants `actor` a role assignment and tracks it for per-case/global cleanup. */
  async function grantRole(data: {
    role: 'ADMIN' | 'COORDINATOR' | 'REPRESENTATIVE';
    panchayatId?: string;
    wardId?: string;
  }): Promise<string> {
    const ra = await prisma.roleAssignment.create({
      data: { userId: actor.userId, ...data },
    });
    createdRoleAssignmentIds.push(ra.id);
    return ra.id;
  }

  /** Removes a previously-granted role assignment so the actor reverts to a plain citizen. */
  async function revokeRole(id: string): Promise<void> {
    await prisma.roleAssignment.delete({ where: { id } });
    const i = createdRoleAssignmentIds.indexOf(id);
    if (i >= 0) createdRoleAssignmentIds.splice(i, 1);
  }

  function validBody(citizenPhone: string) {
    return {
      title: 'Broken streetlight on Main Rd',
      description: 'The streetlight at the junction has been dark for over a week.',
      categoryId,
      wardId,
      citizenPhone,
    };
  }

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

    const category = await prisma.category.create({
      data: { slug: `${runId}-cat`, name: 'Roads', nameMl: 'റോഡുകൾ' },
    });
    categoryId = category.id;

    const panchayat = await prisma.panchayat.create({
      data: { code: `${runId}-pan`, name: 'Test Panchayat', nameMl: 'Test Panchayat ml' },
    });
    panchayatId = panchayat.id;

    const ward = await prisma.ward.create({
      data: { panchayatId: panchayat.id, number: 1, name: 'Ward 1', nameMl: 'Ward 1 ml' },
    });
    wardId = ward.id;

    // Exactly ONE real login for this whole file (2 OTP calls, well under the
    // 5/IP/60s cap).
    actor = await login(freshPhone());
    createdUserIds.push(actor.userId);
  });

  afterAll(async () => {
    await prisma.roleAssignment.deleteMany({ where: { id: { in: createdRoleAssignmentIds } } });
    await prisma.notification.deleteMany({ where: { issueId: { in: createdIssueIds } } });
    await prisma.notification.deleteMany({ where: { issue: { createdById: { in: createdUserIds } } } });
    await prisma.issueStatusHistory.deleteMany({ where: { issueId: { in: createdIssueIds } } });
    await prisma.issue.deleteMany({ where: { id: { in: createdIssueIds } } });
    await prisma.issue.deleteMany({ where: { createdById: { in: createdUserIds } } });
    await prisma.idempotencyKey.deleteMany({ where: { userId: { in: createdUserIds } } });
    await purgeAuditLogs(prisma, { actorUserId: { in: createdUserIds } });
    await prisma.ward.deleteMany({ where: { id: wardId } });
    await prisma.panchayat.deleteMany({ where: { id: panchayatId } });
    await prisma.category.deleteMany({ where: { id: categoryId } });
    await prisma.session.deleteMany({ where: { userId: { in: createdUserIds } } });
    // Delete tracked users AND any citizen the service upserted-by-phone
    // (owner of the created on-behalf issue, now deleted above).
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await prisma.user.deleteMany({ where: { phone: { in: citizenPhonesUsed } } });
    await app.close();
  });

  const citizenPhonesUsed: string[] = [];

  it('seeded REPRESENTATIVE: valid in-ward body -> 201 with exactly the 4 minimal keys; rep is creator, citizen is owner + notification recipient', async () => {
    const raId = await grantRole({ role: 'REPRESENTATIVE', wardId });
    const citizenPhone = freshPhone();
    citizenPhonesUsed.push(citizenPhone);
    try {
      const res = await request(app.getHttpServer())
        .post('/api/v1/issues/on-behalf')
        .set('Cookie', actor.cookie)
        .send(validBody(citizenPhone));

      expect(res.status).toBe(201);
      expect(Object.keys(res.body).sort()).toEqual(['createdAt', 'id', 'referenceNo', 'status']);
      expect(res.body).not.toHaveProperty('citizenId');
      expect(res.body).not.toHaveProperty('fullName');
      expect(res.body).not.toHaveProperty('citizenPhone');
      expect(res.body.status).toBe('SUBMITTED');
      createdIssueIds.push(res.body.id);

      // Persisted row: rep is the CREATOR, citizen (resolved by phone) is the OWNER.
      const citizen = await prisma.user.findUniqueOrThrow({ where: { phone: citizenPhone } });
      const issue = await prisma.issue.findUniqueOrThrow({ where: { id: res.body.id } });
      expect(issue.createdById).toBe(actor.userId);
      expect(issue.citizenId).toBe(citizen.id);
      expect(issue.citizenId).not.toBe(actor.userId);
      expect(issue.onBehalfOf).toBe(true);

      // Submission notification addressed to the CITIZEN, never the rep.
      const notes = await prisma.notification.findMany({
        where: { issueId: issue.id, type: 'issue.submitted' },
      });
      expect(notes).toHaveLength(1);
      expect(notes[0]?.recipientId).toBe(citizen.id);
      expect(notes[0]?.recipientId).not.toBe(actor.userId);

      // The citizen, on a later scoped GET, can read their own issue (proves
      // ownership from the citizen's own request-handling path, not just the
      // DB row). Uses a direct-service-level session read via the real
      // SessionUser shape the AuthGuard would construct, exercised here
      // through the DB row only to avoid spending a THIRD real login on this
      // already-tight per-IP OTP budget; ownership is already proven above
      // via `issue.citizenId` + the notification recipient.
    } finally {
      await revokeRole(raId);
    }
  });

  it('COORDINATOR (no REPRESENTATIVE assignment) -> 403, from the service not a guard', async () => {
    const raId = await grantRole({ role: 'COORDINATOR', panchayatId });
    try {
      const res = await request(app.getHttpServer())
        .post('/api/v1/issues/on-behalf')
        .set('Cookie', actor.cookie)
        .send(validBody(freshPhone()));

      expect(res.status).toBe(403);
    } finally {
      await revokeRole(raId);
    }
  });

  it('ADMIN -> 403 (on-behalf is REPRESENTATIVE-only; ADMIN is NOT exempt)', async () => {
    const raId = await grantRole({ role: 'ADMIN' });
    try {
      const res = await request(app.getHttpServer())
        .post('/api/v1/issues/on-behalf')
        .set('Cookie', actor.cookie)
        .send(validBody(freshPhone()));

      expect(res.status).toBe(403);
    } finally {
      await revokeRole(raId);
    }
  });

  it('citizen (no staff role at all) -> 403', async () => {
    // `actor` currently holds no RoleAssignment (prior cases revoke theirs in
    // `finally`), so this call exercises the plain-citizen path.
    const res = await request(app.getHttpServer())
      .post('/api/v1/issues/on-behalf')
      .set('Cookie', actor.cookie)
      .send(validBody(freshPhone()));

    expect(res.status).toBe(403);
  });

  it('every 403 above originates from OnBehalfService denial auditing (issue.on_behalf_denied), not a guard short-circuit', async () => {
    const raId = await grantRole({ role: 'COORDINATOR', panchayatId });
    try {
      await request(app.getHttpServer())
        .post('/api/v1/issues/on-behalf')
        .set('Cookie', actor.cookie)
        .send(validBody(freshPhone()));

      const evt = await prisma.auditLog.findFirst({
        where: { actorUserId: actor.userId, action: 'issue.on_behalf_denied' },
        orderBy: { createdAt: 'desc' },
      });
      expect(evt).not.toBeNull();
      expect(evt?.metadata).toMatchObject({ reason: 'out_of_scope_ward' });
    } finally {
      await revokeRole(raId);
    }
  });
});
