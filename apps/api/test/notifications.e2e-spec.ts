import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AppModule } from '../src/app.module';
import { SESSION_COOKIE_NAME } from '../src/auth/cookie.util';
import { AllExceptionsFilter } from '../src/common/http-exception.filter';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Task 17 (M2 spec §11 + §6 contract rows) — real HTTP e2e for the
 * recipient-scoped notifications read endpoints.
 *
 * CARRY-IN (same throttle-avoidance pattern as `issues.e2e-spec.ts`):
 * `AuthController` throttles its whole surface to 5 calls/IP/60s. Each real
 * login costs 2 calls, so this file logs in exactly TWO real users (4 calls
 * total) and seeds notifications for both DIRECTLY via Prisma rather than
 * driving a full issue-submission + transition flow through HTTP — the
 * endpoints under test are the read/mark-read ones, not creation (already
 * covered by T7/T10).
 */
describe('Notifications (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const runId = `t17-${Date.now()}`;

  let categoryId: string;
  let panchayatId: string;
  let wardId: string;
  let issueId: string;

  let citizenA: { cookie: string; userId: string };
  let citizenB: { cookie: string; userId: string };

  const createdNotificationIds: string[] = [];
  const createdIssueIds: string[] = [];
  const createdUserIds: string[] = [];

  let phoneCounter = 0;
  function freshPhone(): string {
    phoneCounter += 1;
    const tail = `${Date.now()}${phoneCounter}`.slice(-9).padStart(9, '0');
    return `+919${tail}`;
  }

  /** Logs a brand-new citizen phone in via the real OTP flow and returns its session cookie + user id. */
  async function loginCitizen(phone: string): Promise<{ cookie: string; userId: string }> {
    const verifyResponse = await request(app.getHttpServer())
      .post('/api/v1/auth/verify-token')
      .send({ accessToken: `test-otp:${phone}` });

    const setCookie = verifyResponse.get('Set-Cookie');
    const cookies = Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : [];
    const cookie = cookies.find((c) => c.startsWith(`${SESSION_COOKIE_NAME}=`));
    if (!cookie) throw new Error('login failed: no session cookie set');

    return { cookie, userId: verifyResponse.body.id as string };
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

    // Exactly two real logins for this whole file (see throttle note above).
    citizenA = await loginCitizen(freshPhone());
    citizenB = await loginCitizen(freshPhone());
    createdUserIds.push(citizenA.userId, citizenB.userId);

    // A single Issue row for FK targets (Notification.issueId), owned by
    // citizenA. Created directly via Prisma, not through the submission
    // endpoint — this file is testing notification reads, not creation.
    const issue = await prisma.issue.create({
      data: {
        title: 'Pothole on main road',
        description: 'A large pothole causing traffic issues on the main road.',
        categoryId,
        panchayatId,
        wardId,
        referenceNo: `${runId}-ref-1`,
        status: 'SUBMITTED',
        priority: 'MEDIUM',
        onBehalfOf: false,
        citizenId: citizenA.userId,
        createdById: citizenA.userId,
      },
    });
    issueId = issue.id;
    createdIssueIds.push(issue.id);

    // Two notifications owned by citizenA (the user under test for the
    // read/mark-read assertions below), seeded directly rather than via the
    // submission/transition HTTP flow (T7/T10 already cover creation).
    const n1 = await prisma.notification.create({
      data: { type: 'issue.submitted', recipientId: citizenA.userId, issueId },
    });
    // Ensure a distinct, strictly later `createdAt` so newest-first
    // ordering is unambiguous regardless of DB clock resolution.
    await new Promise((resolve) => setTimeout(resolve, 10));
    const n2 = await prisma.notification.create({
      data: { type: 'issue.status_changed', recipientId: citizenA.userId, issueId },
    });
    createdNotificationIds.push(n1.id, n2.id);

    // One notification owned by a DIFFERENT user (citizenB), to prove
    // recipient-scoping: citizenA must never see it, and citizenB's own
    // endpoints must not expose citizenA's rows. Uses type
    // 'issue.status_changed' (not 'issue.submitted') because the DB-level
    // partial unique index `notification_one_submitted_per_issue` allows at
    // most ONE 'issue.submitted' notification per issue, and `issueId`
    // already has one (n1, above).
    const nOther = await prisma.notification.create({
      data: { type: 'issue.status_changed', recipientId: citizenB.userId, issueId },
    });
    createdNotificationIds.push(nOther.id);
  });

  afterAll(async () => {
    await prisma.notification.deleteMany({ where: { id: { in: createdNotificationIds } } });
    await prisma.issue.deleteMany({ where: { id: { in: createdIssueIds } } });
    await prisma.ward.deleteMany({ where: { id: wardId } });
    await prisma.panchayat.deleteMany({ where: { id: panchayatId } });
    await prisma.category.deleteMany({ where: { id: categoryId } });
    await prisma.session.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await app.close();
  });

  it('unauthenticated GET /notifications -> 401', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/notifications');
    expect(res.status).toBe(401);
  });

  it("GET /notifications returns exactly the caller's own rows, newest-first, as clean NotificationDTOs", async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/notifications')
      .set('Cookie', citizenA.cookie);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toHaveLength(2);

    // Newest-first: the status-changed notification (created second) comes
    // before the submitted one.
    expect(res.body[0].type).toBe('issue.status_changed');
    expect(res.body[1].type).toBe('issue.submitted');

    // Only citizenA's ids are present — never citizenB's.
    const ids = res.body.map((n: { id: string }) => n.id);
    expect(ids).toEqual(expect.arrayContaining([createdNotificationIds[0], createdNotificationIds[1]]));
    expect(ids).not.toContain(createdNotificationIds[2]);

    // Exact DTO shape: id, type, issueId, readAt, createdAt — no
    // recipientId/statusHistoryId leakage.
    for (const row of res.body) {
      expect(Object.keys(row).sort()).toEqual(['createdAt', 'id', 'issueId', 'readAt', 'type']);
      expect(row.issueId).toBe(issueId);
      expect(row.readAt).toBeNull();
      expect(typeof row.createdAt).toBe('string');
    }
  });

  it('GET /notifications/unread-count -> { count: 2 } for citizenA', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/notifications/unread-count')
      .set('Cookie', citizenA.cookie);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ count: 2 });
  });

  it('PATCH /notifications/:id/read marks one of citizenA\'s rows read, dropping unread-count to 1', async () => {
    const targetId = createdNotificationIds[0];

    const patchRes = await request(app.getHttpServer())
      .patch(`/api/v1/notifications/${targetId}/read`)
      .set('Cookie', citizenA.cookie)
      .send();

    expect(patchRes.status).toBe(200);
    expect(patchRes.body.id).toBe(targetId);
    expect(patchRes.body.readAt).not.toBeNull();
    expect(typeof patchRes.body.readAt).toBe('string');
    expect(Object.keys(patchRes.body).sort()).toEqual(['createdAt', 'id', 'issueId', 'readAt', 'type']);

    const countRes = await request(app.getHttpServer())
      .get('/api/v1/notifications/unread-count')
      .set('Cookie', citizenA.cookie);
    expect(countRes.body).toEqual({ count: 1 });
  });

  it("a different user cannot see citizenA's rows via GET /notifications (recipient-scoped)", async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/notifications')
      .set('Cookie', citizenB.cookie);

    expect(res.status).toBe(200);
    const ids = res.body.map((n: { id: string }) => n.id);
    expect(ids).not.toContain(createdNotificationIds[0]);
    expect(ids).not.toContain(createdNotificationIds[1]);
  });

  it("a different user PATCHing one of citizenA's notification ids -> 404 (non-disclosing, not 403)", async () => {
    const res = await request(app.getHttpServer())
      .patch(`/api/v1/notifications/${createdNotificationIds[1]}/read`)
      .set('Cookie', citizenB.cookie)
      .send();

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('notification_not_found');
  });

  it('PATCH on a wholly nonexistent notification id -> 404', async () => {
    const res = await request(app.getHttpServer())
      .patch('/api/v1/notifications/00000000-0000-0000-0000-000000000000/read')
      .set('Cookie', citizenA.cookie)
      .send();

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('notification_not_found');
  });
});
