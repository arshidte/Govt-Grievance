import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import type { CreateIssueInput } from '@pg/types';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AppModule } from '../src/app.module';
import { SESSION_COOKIE_NAME } from '../src/auth/cookie.util';
import { AllExceptionsFilter } from '../src/common/http-exception.filter';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Collision-free phone per test run that satisfies `phoneSchema`
 * (`/^\+91[6-9]\d{9}$/`): a leading 9 then 9 more digits, so 10 total.
 * Mirrors the helper in `test/auth.e2e-spec.ts`.
 */
let phoneCounter = 0;
function freshPhone(): string {
  phoneCounter += 1;
  const tail = `${Date.now()}${phoneCounter}`.slice(-9).padStart(9, '0');
  return `+919${tail}`;
}

/**
 * IMPORTANT: `AuthController` throttles its ENTIRE surface (request-otp +
 * verify-otp together) to `AUTH_THROTTLE_LIMIT` (5) calls per IP per 60s
 * (see `src/common/throttler.config.ts`). Each login below costs 2 calls,
 * so this file deliberately logs in only TWO real users (4 calls total,
 * under the cap) and exercises the staff-scope read path by granting a
 * REPRESENTATIVE `RoleAssignment` directly via Prisma rather than logging
 * in a third (seeded) user — `AuthGuard`/`SessionService` re-read
 * `roleAssignments` fresh from the DB on every request, so this is a
 * faithful exercise of the real authorization path, not a mock.
 */
describe('Issues (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const runId = `t8-${Date.now()}`;

  let categoryId: string;
  let panchayatId: string;
  let wardId: string;

  // A SECOND panchayat/ward, outside the representative's granted scope,
  // used for the "out-of-scope staff cannot read" case.
  let otherPanchayatId: string;
  let otherWardId: string;

  let citizenA: { cookie: string; userId: string };
  let citizenB: { cookie: string; userId: string };

  const createdIssueIds: string[] = [];
  const createdUserIds: string[] = [];
  const createdRoleAssignmentIds: string[] = [];

  function validBody(): CreateIssueInput {
    return {
      title: 'Pothole outside my house',
      description: 'There is a large pothole causing traffic issues on the main road.',
      categoryId,
      panchayatId,
      wardId,
    };
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

    const otherPanchayat = await prisma.panchayat.create({
      data: { code: `${runId}-pan-other`, name: 'Other Panchayat', nameMl: 'Other Panchayat ml' },
    });
    otherPanchayatId = otherPanchayat.id;

    const otherWard = await prisma.ward.create({
      data: { panchayatId: otherPanchayat.id, number: 1, name: 'Other Ward 1', nameMl: 'Other Ward 1 ml' },
    });
    otherWardId = otherWard.id;

    // Exactly two real logins for this whole file (see throttle note above).
    citizenA = await loginCitizen(freshPhone());
    citizenB = await loginCitizen(freshPhone());
    createdUserIds.push(citizenA.userId, citizenB.userId);
  });

  afterAll(async () => {
    await prisma.roleAssignment.deleteMany({ where: { id: { in: createdRoleAssignmentIds } } });
    // Notification rows (created by IssuesService.createForCitizen as a
    // submission side effect) reference both the issue and the citizen —
    // delete them before the issue/user rows they point to.
    await prisma.notification.deleteMany({ where: { issueId: { in: createdIssueIds } } });
    await prisma.issue.deleteMany({ where: { id: { in: createdIssueIds } } });
    await prisma.ward.deleteMany({ where: { id: { in: [wardId, otherWardId] } } });
    await prisma.panchayat.deleteMany({ where: { id: { in: [panchayatId, otherPanchayatId] } } });
    await prisma.category.deleteMany({ where: { id: categoryId } });
    await prisma.session.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await app.close();
  });

  it('unauthenticated GET /issues -> 401', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/issues');
    expect(response.status).toBe(401);
  });

  it('unauthenticated POST /issues -> 401', async () => {
    const response = await request(app.getHttpServer()).post('/api/v1/issues').send(validBody());
    expect(response.status).toBe(401);
  });

  it('citizen can create an issue (201 + referenceNo) and see only their own in GET /issues', async () => {
    const createResponse = await request(app.getHttpServer())
      .post('/api/v1/issues')
      .set('Cookie', citizenA.cookie)
      .send(validBody());

    expect(createResponse.status).toBe(201);
    expect(createResponse.body.referenceNo).toMatch(/^GRV-\d{4}-\d{6,}$/);
    expect(createResponse.body.id).toBeTypeOf('string');
    expect(createResponse.body.timeline).toEqual([]);
    createdIssueIds.push(createResponse.body.id);

    const listResponse = await request(app.getHttpServer())
      .get('/api/v1/issues')
      .set('Cookie', citizenA.cookie);

    expect(listResponse.status).toBe(200);
    expect(Array.isArray(listResponse.body)).toBe(true);
    expect(listResponse.body).toHaveLength(1);
    expect(listResponse.body[0].id).toBe(createResponse.body.id);
    expect(listResponse.body[0].referenceNo).toBe(createResponse.body.referenceNo);
  });

  it("a second citizen cannot GET /issues/:id of the first citizen's issue (403/404, not 200), but the owner can", async () => {
    const created = await request(app.getHttpServer())
      .post('/api/v1/issues')
      .set('Cookie', citizenA.cookie)
      .send(validBody());
    expect(created.status).toBe(201);
    createdIssueIds.push(created.body.id);

    const res = await request(app.getHttpServer())
      .get(`/api/v1/issues/${created.body.id}`)
      .set('Cookie', citizenB.cookie);

    expect([403, 404]).toContain(res.status);

    // The OWNER can still read it (sanity check that scoping isn't globally broken).
    const ownerRead = await request(app.getHttpServer())
      .get(`/api/v1/issues/${created.body.id}`)
      .set('Cookie', citizenA.cookie);
    expect(ownerRead.status).toBe(200);
    expect(ownerRead.body.id).toBe(created.body.id);
  });

  it('GET /issues/:id for a nonexistent id -> 404 (even for an authenticated citizen)', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/issues/00000000-0000-0000-0000-000000000000')
      .set('Cookie', citizenA.cookie);

    expect(res.status).toBe(404);
  });

  describe('staff scope', () => {
    it('in-scope REPRESENTATIVE (granted on the issue\'s own ward) can GET it', async () => {
      const created = await request(app.getHttpServer())
        .post('/api/v1/issues')
        .set('Cookie', citizenA.cookie)
        .send(validBody());
      expect(created.status).toBe(201);
      createdIssueIds.push(created.body.id);

      // Promote citizenB to REPRESENTATIVE for the issue's OWN ward.
      const ra = await prisma.roleAssignment.create({
        data: { userId: citizenB.userId, role: 'REPRESENTATIVE', wardId },
      });
      createdRoleAssignmentIds.push(ra.id);

      const res = await request(app.getHttpServer())
        .get(`/api/v1/issues/${created.body.id}`)
        .set('Cookie', citizenB.cookie);

      expect(res.status).toBe(200);
      expect(res.body.id).toBe(created.body.id);

      // Revert: remove the assignment so later tests in this file see
      // citizenB as a plain citizen again (kept out of global cleanup list
      // intentionally — already removed here).
      await prisma.roleAssignment.delete({ where: { id: ra.id } });
      createdRoleAssignmentIds.splice(createdRoleAssignmentIds.indexOf(ra.id), 1);
    });

    it('out-of-scope REPRESENTATIVE (granted on a DIFFERENT ward) cannot GET an issue outside their scope', async () => {
      const created = await request(app.getHttpServer())
        .post('/api/v1/issues')
        .set('Cookie', citizenA.cookie)
        .send(validBody());
      expect(created.status).toBe(201);
      createdIssueIds.push(created.body.id);

      // Promote citizenB to REPRESENTATIVE for the OTHER ward (not the
      // issue's ward) — out of scope for this issue.
      const ra = await prisma.roleAssignment.create({
        data: { userId: citizenB.userId, role: 'REPRESENTATIVE', wardId: otherWardId },
      });
      createdRoleAssignmentIds.push(ra.id);

      const res = await request(app.getHttpServer())
        .get(`/api/v1/issues/${created.body.id}`)
        .set('Cookie', citizenB.cookie);

      expect([403, 404]).toContain(res.status);
    });
  });
});
