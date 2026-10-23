import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AppModule } from '../src/app.module';
import { SESSION_COOKIE_NAME } from '../src/auth/cookie.util';
import { AllExceptionsFilter } from '../src/common/http-exception.filter';
import { PrismaService } from '../src/prisma/prisma.service';
import type { MockSmsProvider } from '../src/sms/mock-sms.provider';
import { SMS_PROVIDER } from '../src/sms/sms-provider.interface';

/**
 * Task 11 (M2 spec §5.1–5.3, §6): `PATCH /issues/:id/status` with SCOPED staff
 * authorization + chronological timeline in the detail read.
 *
 * The flagged concern is the scope gate: only IN-SCOPE staff may transition an
 * issue; a citizen (even the owner) and OUT-OF-SCOPE staff are both 403'd, and
 * a nonexistent id is 404. (The 403-vs-404 split is deliberate per §6 and the
 * brief — distinct from GET's uniform-404 non-disclosure.)
 *
 * CARRY-IN (T8): `AuthController` throttles its whole surface to 5 calls/IP/60s,
 * and each real OTP login costs 2. So this file logs in EXACTLY TWO real users
 * (the issue's owning citizen + one reusable staff actor) and grants all staff
 * roles via DIRECT Prisma `RoleAssignment` creates. `AuthGuard`/`SessionService`
 * re-read `roleAssignments` fresh from the DB on every request, so flipping a
 * role assignment between requests is a faithful exercise of the real authz
 * path — not a mock. Each actor reuses ONE cookie for all its requests.
 */
describe('Transition authz (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let sms: MockSmsProvider;

  const runId = `t11-${Date.now()}`;

  let categoryId: string;
  let panchayatId: string;
  let wardId: string;

  // A SECOND panchayat/ward, outside the staff actor's granted scope, used for
  // the out-of-scope denial cases.
  let otherPanchayatId: string;
  let otherWardId: string;

  // The issue's owning citizen (real login — they CANNOT transition).
  let citizen: { cookie: string; userId: string };
  // The reusable staff actor (real login; its RoleAssignment is swapped
  // in/out via Prisma per case to model in-scope vs out-of-scope).
  let staff: { cookie: string; userId: string };

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

  /** Creates a fresh SUBMITTED issue owned by `citizen` in the IN-SCOPE ward/panchayat. */
  async function freshIssue(): Promise<string> {
    const issue = await prisma.issue.create({
      data: {
        title: 'Pothole on main road',
        description: 'A large pothole causing traffic issues on the main road.',
        categoryId,
        panchayatId,
        wardId,
        referenceNo: `${runId}-ref-${createdIssueIds.length}`,
        status: 'SUBMITTED',
        priority: 'MEDIUM',
        onBehalfOf: false,
        citizenId: citizen.userId,
        createdById: citizen.userId,
      },
    });
    createdIssueIds.push(issue.id);
    return issue.id;
  }

  /** Grants `staff` a role assignment and tracks it for per-case/global cleanup. */
  async function grantStaffRole(data: {
    role: 'ADMIN' | 'COORDINATOR' | 'REPRESENTATIVE';
    panchayatId?: string;
    wardId?: string;
  }): Promise<string> {
    const ra = await prisma.roleAssignment.create({
      data: { userId: staff.userId, ...data },
    });
    createdRoleAssignmentIds.push(ra.id);
    return ra.id;
  }

  /** Removes a previously-granted role assignment so the actor reverts to a plain citizen. */
  async function revokeStaffRole(id: string): Promise<void> {
    await prisma.roleAssignment.delete({ where: { id } });
    const i = createdRoleAssignmentIds.indexOf(id);
    if (i >= 0) createdRoleAssignmentIds.splice(i, 1);
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

    const otherPanchayat = await prisma.panchayat.create({
      data: { code: `${runId}-pan-other`, name: 'Other Panchayat', nameMl: 'Other Panchayat ml' },
    });
    otherPanchayatId = otherPanchayat.id;

    const otherWard = await prisma.ward.create({
      data: { panchayatId: otherPanchayat.id, number: 1, name: 'Other Ward 1', nameMl: 'Other Ward 1 ml' },
    });
    otherWardId = otherWard.id;

    // Exactly two real logins for this whole file (4 OTP calls, under the 5/IP cap).
    citizen = await login(freshPhone());
    staff = await login(freshPhone());
    createdUserIds.push(citizen.userId, staff.userId);
  });

  afterAll(async () => {
    await prisma.roleAssignment.deleteMany({ where: { id: { in: createdRoleAssignmentIds } } });
    await prisma.notification.deleteMany({ where: { issueId: { in: createdIssueIds } } });
    await prisma.issueStatusHistory.deleteMany({ where: { issueId: { in: createdIssueIds } } });
    await prisma.issue.deleteMany({ where: { id: { in: createdIssueIds } } });
    await prisma.ward.deleteMany({ where: { id: { in: [wardId, otherWardId] } } });
    await prisma.panchayat.deleteMany({ where: { id: { in: [panchayatId, otherPanchayatId] } } });
    await prisma.category.deleteMany({ where: { id: categoryId } });
    await prisma.session.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await app.close();
  });

  it('in-scope COORDINATOR transitions SUBMITTED->ACKNOWLEDGED -> 200, timeline grows, status-change notification created', async () => {
    const issueId = await freshIssue();
    const raId = await grantStaffRole({ role: 'COORDINATOR', panchayatId });
    try {
      // Timeline length before the transition (should be 0 for a fresh issue).
      const before = await request(app.getHttpServer())
        .get(`/api/v1/issues/${issueId}`)
        .set('Cookie', staff.cookie);
      expect(before.status).toBe(200);
      const timelineBefore = before.body.timeline.length as number;

      const res = await request(app.getHttpServer())
        .patch(`/api/v1/issues/${issueId}/status`)
        .set('Cookie', staff.cookie)
        .send({ toStatus: 'ACKNOWLEDGED', note: 'Acknowledged by coordinator' });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ACKNOWLEDGED');
      // Timeline on the PATCH response has grown by exactly one entry.
      expect(res.body.timeline.length).toBe(timelineBefore + 1);
      const entry = res.body.timeline[res.body.timeline.length - 1];
      expect(entry.fromStatus).toBe('SUBMITTED');
      expect(entry.toStatus).toBe('ACKNOWLEDGED');
      expect(entry.note).toBe('Acknowledged by coordinator');
      // actorRoleLabel exposes the role token, never PII.
      expect(entry.actorRoleLabel).toBe('COORDINATOR');

      // A status-change notification for the issue's citizen now exists.
      const notification = await prisma.notification.findFirst({
        where: { issueId, type: 'issue.status_changed', recipientId: citizen.userId },
      });
      expect(notification).not.toBeNull();
    } finally {
      await revokeStaffRole(raId);
    }
  });

  it('out-of-scope COORDINATOR (different panchayat) -> 403', async () => {
    const issueId = await freshIssue();
    const raId = await grantStaffRole({ role: 'COORDINATOR', panchayatId: otherPanchayatId });
    try {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/issues/${issueId}/status`)
        .set('Cookie', staff.cookie)
        .send({ toStatus: 'ACKNOWLEDGED', note: 'Should be blocked' });

      expect(res.status).toBe(403);
    } finally {
      await revokeStaffRole(raId);
    }
  });

  it('out-of-scope REPRESENTATIVE (different ward) -> 403', async () => {
    const issueId = await freshIssue();
    const raId = await grantStaffRole({ role: 'REPRESENTATIVE', wardId: otherWardId });
    try {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/issues/${issueId}/status`)
        .set('Cookie', staff.cookie)
        .send({ toStatus: 'ACKNOWLEDGED', note: 'Should be blocked' });

      expect(res.status).toBe(403);
    } finally {
      await revokeStaffRole(raId);
    }
  });

  it('citizen (the issue owner, no staff role) -> 403', async () => {
    const issueId = await freshIssue();

    const res = await request(app.getHttpServer())
      .patch(`/api/v1/issues/${issueId}/status`)
      .set('Cookie', citizen.cookie)
      .send({ toStatus: 'ACKNOWLEDGED', note: 'Citizen cannot transition' });

    expect(res.status).toBe(403);
  });

  it('nonexistent issue id -> 404 (staff), locking in the 404-vs-403 distinction', async () => {
    const raId = await grantStaffRole({ role: 'COORDINATOR', panchayatId });
    try {
      const res = await request(app.getHttpServer())
        .patch('/api/v1/issues/00000000-0000-0000-0000-000000000000/status')
        .set('Cookie', staff.cookie)
        .send({ toStatus: 'ACKNOWLEDGED', note: 'No such issue' });

      expect(res.status).toBe(404);
    } finally {
      await revokeStaffRole(raId);
    }
  });

  it('GET /issues/:id returns timeline ordered ascending by createdAt', async () => {
    const issueId = await freshIssue();
    const raId = await grantStaffRole({ role: 'COORDINATOR', panchayatId });
    try {
      // Drive TWO transitions so there are >= 2 history rows to prove ordering:
      // SUBMITTED -> ACKNOWLEDGED -> IN_PROGRESS.
      const ack = await request(app.getHttpServer())
        .patch(`/api/v1/issues/${issueId}/status`)
        .set('Cookie', staff.cookie)
        .send({ toStatus: 'ACKNOWLEDGED', note: 'first' });
      expect(ack.status).toBe(200);

      const prog = await request(app.getHttpServer())
        .patch(`/api/v1/issues/${issueId}/status`)
        .set('Cookie', staff.cookie)
        .send({ toStatus: 'IN_PROGRESS', note: 'second' });
      expect(prog.status).toBe(200);

      const res = await request(app.getHttpServer())
        .get(`/api/v1/issues/${issueId}`)
        .set('Cookie', staff.cookie);

      expect(res.status).toBe(200);
      expect(res.body.timeline).toHaveLength(2);
      // Oldest first: SUBMITTED->ACKNOWLEDGED precedes ACKNOWLEDGED->IN_PROGRESS.
      expect(res.body.timeline[0].toStatus).toBe('ACKNOWLEDGED');
      expect(res.body.timeline[1].toStatus).toBe('IN_PROGRESS');
      const t0 = new Date(res.body.timeline[0].createdAt).getTime();
      const t1 = new Date(res.body.timeline[1].createdAt).getTime();
      expect(t0).toBeLessThanOrEqual(t1);
    } finally {
      await revokeStaffRole(raId);
    }
  });
});
