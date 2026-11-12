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

/**
 * Organization-management milestone (e2e, real Postgres).
 *
 * Exercises the Global-Admin-only panchayat/ward/representative/coordinator
 * management surface against the real authz stack. Mirrors the throttle-aware
 * pattern of `transition-authz.e2e-spec.ts`: EXACTLY TWO real OTP logins for
 * the whole file (admin + one non-admin actor, 4 auth calls < 5/IP cap); the
 * admin's ADMIN role is granted via a DIRECT Prisma `RoleAssignment` (the same
 * faithful-authz technique used across the e2e suite — `SessionService`
 * re-reads active assignments per request).
 */
describe('Organization management (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const runId = `org-${Date.now()}`;

  let categoryId: string;
  let admin: { cookie: string; userId: string };
  let actor: { cookie: string; userId: string }; // non-admin; later assigned as rep/coordinator

  // Tracked for cleanup.
  const panchayatIds: string[] = [];
  const wardIds: string[] = [];
  const issueIds: string[] = [];

  let phoneCounter = 0;
  function freshPhone(): string {
    phoneCounter += 1;
    const tail = `${Date.now()}${phoneCounter}`.slice(-9).padStart(9, '0');
    return `+919${tail}`;
  }

  async function login(phone: string): Promise<{ cookie: string; userId: string }> {
    const verify = await request(app.getHttpServer())
      .post('/api/v1/auth/verify-token')
      .send({ accessToken: `test-otp:${phone}` });
    const setCookie = verify.get('Set-Cookie');
    const cookies = Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : [];
    const cookie = cookies.find((c) => c.startsWith(`${SESSION_COOKIE_NAME}=`));
    if (!cookie) throw new Error('login failed: no session cookie set');
    return { cookie, userId: verify.body.id as string };
  }

  const api = () => request(app.getHttpServer());
  const asAdmin = (r: request.Test) => r.set('Cookie', admin.cookie);

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

    admin = await login(freshPhone());
    actor = await login(freshPhone());
    // Grant ADMIN to `admin` directly (faithful authz: read fresh per request).
    await prisma.roleAssignment.create({ data: { userId: admin.userId, role: 'ADMIN' } });
  });

  afterAll(async () => {
    const userIds = [admin.userId, actor.userId];
    await purgeAuditLogs(prisma, { actorUserId: { in: userIds } });
    await prisma.notification.deleteMany({ where: { issueId: { in: issueIds } } });
    await prisma.issue.deleteMany({ where: { id: { in: issueIds } } });
    await prisma.roleAssignment.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.ward.deleteMany({ where: { id: { in: wardIds } } });
    await prisma.panchayat.deleteMany({ where: { id: { in: panchayatIds } } });
    await prisma.category.deleteMany({ where: { id: categoryId } });
    await prisma.session.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await app.close();
  });

  /** Creates a panchayat via the admin API and tracks it. Returns its id. */
  async function createPanchayat(code: string, name = 'Panchayat'): Promise<string> {
    const res = await asAdmin(api().post('/api/v1/panchayats')).send({
      code,
      name,
      nameMl: `${name} ml`,
    });
    expect([200, 201]).toContain(res.status);
    panchayatIds.push(res.body.id);
    return res.body.id as string;
  }

  /** Creates a ward via the admin API and tracks it. Returns its id. */
  async function createWard(panchayatId: string, number: number): Promise<string> {
    const res = await asAdmin(api().post(`/api/v1/panchayats/${panchayatId}/wards`)).send({
      number,
      name: `Ward ${number}`,
      nameMl: `Ward ${number} ml`,
    });
    expect([200, 201]).toContain(res.status);
    wardIds.push(res.body.id);
    return res.body.id as string;
  }

  // ---- Authorization: non-admin denial ----------------------------------

  it('non-admin cannot perform administrative mutations (403)', async () => {
    const create = await api()
      .post('/api/v1/panchayats')
      .set('Cookie', actor.cookie)
      .send({ code: `${runId}-nope`, name: 'X', nameMl: 'X' });
    expect(create.status).toBe(403);

    const assignRep = await api()
      .post('/api/v1/representatives')
      .set('Cookie', actor.cookie)
      .send({ userId: actor.userId, wardId: 'whatever' });
    expect(assignRep.status).toBe(403);

    const listCoord = await api().get('/api/v1/coordinators').set('Cookie', actor.cookie);
    expect(listCoord.status).toBe(403);

    // No panchayat was created by the forbidden call.
    expect(await prisma.panchayat.findFirst({ where: { code: `${runId}-nope` } })).toBeNull();
  });

  // ---- Panchayat management ----------------------------------------------

  it('creates a panchayat, rejects duplicate code, and keeps code immutable on update', async () => {
    const id = await createPanchayat(`${runId}-P1`, 'Alpha');

    const dup = await asAdmin(api().post('/api/v1/panchayats')).send({
      code: `${runId}-P1`,
      name: 'Dup',
      nameMl: 'Dup ml',
    });
    expect(dup.status).toBe(409);

    // Update: body carries no `code`; an attempt to smuggle one is ignored.
    const updated = await asAdmin(api().patch(`/api/v1/panchayats/${id}`)).send({
      name: 'Alpha Renamed',
      nameMl: 'Alpha Renamed ml',
      code: `${runId}-HACKED`,
    });
    expect(updated.status).toBe(200);
    expect(updated.body.name).toBe('Alpha Renamed');
    expect(updated.body.code).toBe(`${runId}-P1`); // immutable
  });

  it('deactivation hides a panchayat from citizens but admins can see + reactivate it', async () => {
    const id = await createPanchayat(`${runId}-P2`, 'Beta');

    // Visible to a non-admin while active.
    const activeList = await api().get('/api/v1/panchayats').set('Cookie', actor.cookie);
    expect(activeList.body.some((p: { id: string }) => p.id === id)).toBe(true);

    const deact = await asAdmin(api().post(`/api/v1/panchayats/${id}/deactivate`));
    expect(deact.status).toBe(200);
    expect(deact.body.status).toBe('inactive');

    // Hidden from a non-admin (not selectable); and a non-admin cannot force it.
    const afterList = await api().get('/api/v1/panchayats').set('Cookie', actor.cookie);
    expect(afterList.body.some((p: { id: string }) => p.id === id)).toBe(false);
    const forced = await api()
      .get('/api/v1/panchayats?includeInactive=true')
      .set('Cookie', actor.cookie);
    expect(forced.body.some((p: { id: string }) => p.id === id)).toBe(false);

    // Admin sees it with includeInactive, and can reactivate.
    const adminList = await asAdmin(api().get('/api/v1/panchayats?includeInactive=true'));
    expect(adminList.body.some((p: { id: string }) => p.id === id)).toBe(true);
    const react = await asAdmin(api().post(`/api/v1/panchayats/${id}/reactivate`));
    expect(react.status).toBe(200);
    expect(react.body.status).toBe('active');
  });

  // ---- Ward management ----------------------------------------------------

  it('enforces ward-number uniqueness within a panchayat (but not across panchayats)', async () => {
    const pA = await createPanchayat(`${runId}-WA`);
    const pB = await createPanchayat(`${runId}-WB`);
    await createWard(pA, 1);

    const dup = await asAdmin(api().post(`/api/v1/panchayats/${pA}/wards`)).send({
      number: 1,
      name: 'Dup',
      nameMl: 'Dup ml',
    });
    expect(dup.status).toBe(409);

    // Same number in a DIFFERENT panchayat is fine.
    await createWard(pB, 1);
  });

  it('audits a ward number change and (de/re)activation; inactive wards are hidden from citizens', async () => {
    const p = await createPanchayat(`${runId}-WC`);
    const w = await createWard(p, 5);

    const upd = await asAdmin(api().patch(`/api/v1/wards/${w}`)).send({
      number: 6,
      name: 'Ward 6',
      nameMl: 'Ward 6 ml',
    });
    expect(upd.status).toBe(200);
    expect(upd.body.number).toBe(6);
    const numberAudit = await prisma.auditLog.findFirst({
      where: { action: 'ward.updated', entityId: w },
    });
    expect(numberAudit).not.toBeNull();

    await asAdmin(api().post(`/api/v1/wards/${w}/deactivate`)).expect(200);
    const citizenWards = await api()
      .get(`/api/v1/panchayats/${p}/wards`)
      .set('Cookie', actor.cookie);
    expect(citizenWards.body.some((x: { id: string }) => x.id === w)).toBe(false);
    const adminWards = await asAdmin(
      api().get(`/api/v1/panchayats/${p}/wards?includeInactive=true`),
    );
    expect(adminWards.body.some((x: { id: string }) => x.id === w)).toBe(true);
    await asAdmin(api().post(`/api/v1/wards/${w}/reactivate`)).expect(200);
  });

  // ---- Representative assignment -----------------------------------------

  it('assigns a representative to multiple wards, prevents duplicates, and lists them', async () => {
    const p = await createPanchayat(`${runId}-RP`);
    const w1 = await createWard(p, 1);
    const w2 = await createWard(p, 2);

    const a1 = await asAdmin(api().post('/api/v1/representatives')).send({
      userId: actor.userId,
      wardId: w1,
    });
    expect([200, 201]).toContain(a1.status);

    // Duplicate ACTIVE assignment to the same ward -> 409.
    const dup = await asAdmin(api().post('/api/v1/representatives')).send({
      userId: actor.userId,
      wardId: w1,
    });
    expect(dup.status).toBe(409);

    // A SECOND ward for the same user is allowed (multiple assignments).
    const a2 = await asAdmin(api().post('/api/v1/representatives')).send({
      userId: actor.userId,
      wardId: w2,
    });
    expect([200, 201]).toContain(a2.status);

    const list = await asAdmin(api().get('/api/v1/representatives'));
    const rep = list.body.find((r: { userId: string }) => r.userId === actor.userId);
    expect(rep).toBeDefined();
    expect(rep.wards.length).toBeGreaterThanOrEqual(2);
  });

  it('rejects assigning a representative to an inactive ward (422/409)', async () => {
    const p = await createPanchayat(`${runId}-RI`);
    const w = await createWard(p, 1);
    await asAdmin(api().post(`/api/v1/wards/${w}/deactivate`)).expect(200);

    const res = await asAdmin(api().post('/api/v1/representatives')).send({
      userId: actor.userId,
      wardId: w,
    });
    expect(res.status).toBe(409);
  });

  it('soft-revokes a representative assignment: history preserved, access removed, unrelated kept', async () => {
    const p = await createPanchayat(`${runId}-REV`);
    const wRevoked = await createWard(p, 1);
    const wKept = await createWard(p, 2);

    const aRevoked = await asAdmin(api().post('/api/v1/representatives')).send({
      userId: actor.userId,
      wardId: wRevoked,
    });
    const aKept = await asAdmin(api().post('/api/v1/representatives')).send({
      userId: actor.userId,
      wardId: wKept,
    });
    const revokedAssignmentId = aRevoked.body.assignmentId as string;

    // While assigned, the actor (a representative) can file on-behalf in wRevoked.
    const okSubmit = await api()
      .post('/api/v1/issues/on-behalf')
      .set('Cookie', actor.cookie)
      .send({
        title: 'Streetlight out',
        description: 'The light has been out for days near the junction.',
        categoryId,
        wardId: wRevoked,
        citizenPhone: freshPhone(),
      });
    expect([200, 201]).toContain(okSubmit.status);
    if (okSubmit.body.id) issueIds.push(okSubmit.body.id);

    // Revoke the wRevoked assignment.
    const revoke = await asAdmin(
      api().post(`/api/v1/representatives/${revokedAssignmentId}/revoke`),
    );
    expect(revoke.status).toBe(200);

    // Soft: the row still exists with revokedAt stamped (history preserved).
    const row = await prisma.roleAssignment.findUnique({ where: { id: revokedAssignmentId } });
    expect(row).not.toBeNull();
    expect(row?.revokedAt).not.toBeNull();

    // Revoked assignment no longer grants access: on-behalf in wRevoked -> 403.
    const deniedSubmit = await api()
      .post('/api/v1/issues/on-behalf')
      .set('Cookie', actor.cookie)
      .send({
        title: 'Should be blocked',
        description: 'This submission must be denied after revocation.',
        categoryId,
        wardId: wRevoked,
        citizenPhone: freshPhone(),
      });
    expect(deniedSubmit.status).toBe(403);

    // Unrelated assignment (wKept) is untouched — still grants access.
    expect(aKept.body.assignmentId).toBeTruthy();
    const keptSubmit = await api()
      .post('/api/v1/issues/on-behalf')
      .set('Cookie', actor.cookie)
      .send({
        title: 'Still allowed',
        description: 'The kept ward assignment still authorizes this submission.',
        categoryId,
        wardId: wKept,
        citizenPhone: freshPhone(),
      });
    expect([200, 201]).toContain(keptSubmit.status);
    if (keptSubmit.body.id) issueIds.push(keptSubmit.body.id);

    // Re-assigning the previously-revoked ward is allowed (unique on active only).
    const reassign = await asAdmin(api().post('/api/v1/representatives')).send({
      userId: actor.userId,
      wardId: wRevoked,
    });
    expect([200, 201]).toContain(reassign.status);

    // A revocation audit row was written by the admin.
    const revokeAudit = await prisma.auditLog.findFirst({
      where: { action: 'representative.revoked', entityId: revokedAssignmentId },
    });
    expect(revokeAudit?.actorUserId).toBe(admin.userId);
  });

  it('a representative cannot reach organization-management endpoints (403)', async () => {
    // `actor` currently holds representative assignments (from prior tests).
    const res = await api()
      .post('/api/v1/panchayats')
      .set('Cookie', actor.cookie)
      .send({ code: `${runId}-rep-nope`, name: 'X', nameMl: 'X' });
    expect(res.status).toBe(403);
  });

  // ---- Coordinator assignment --------------------------------------------

  it('assigns a coordinator to multiple panchayats, prevents duplicates, soft-revokes', async () => {
    const pc1 = await createPanchayat(`${runId}-CC1`);
    const pc2 = await createPanchayat(`${runId}-CC2`);

    const a1 = await asAdmin(api().post('/api/v1/coordinators')).send({
      userId: actor.userId,
      panchayatId: pc1,
    });
    expect([200, 201]).toContain(a1.status);

    const dup = await asAdmin(api().post('/api/v1/coordinators')).send({
      userId: actor.userId,
      panchayatId: pc1,
    });
    expect(dup.status).toBe(409);

    const a2 = await asAdmin(api().post('/api/v1/coordinators')).send({
      userId: actor.userId,
      panchayatId: pc2,
    });
    expect([200, 201]).toContain(a2.status);

    const list = await asAdmin(api().get('/api/v1/coordinators'));
    const coord = list.body.find((c: { userId: string }) => c.userId === actor.userId);
    expect(coord.panchayats.length).toBeGreaterThanOrEqual(2);

    const revoke = await asAdmin(
      api().post(`/api/v1/coordinators/${a1.body.assignmentId}/revoke`),
    );
    expect(revoke.status).toBe(200);
    const row = await prisma.roleAssignment.findUnique({
      where: { id: a1.body.assignmentId },
    });
    expect(row?.revokedAt).not.toBeNull();
  });

  // ---- Phone search + audit ----------------------------------------------

  it('searches an existing user by phone and writes audit events for mutations', async () => {
    const found = await asAdmin(
      api().get(`/api/v1/staff/search`).query({ phone: (await currentActorPhone()) }),
    );
    expect(found.status).toBe(200);
    expect(found.body?.id).toBe(actor.userId);

    const createAudit = await prisma.auditLog.findFirst({
      where: { action: 'panchayat.created', actorUserId: admin.userId },
    });
    expect(createAudit).not.toBeNull();
  });

  /** Reads the actor's phone from the DB (not retained from login). */
  async function currentActorPhone(): Promise<string> {
    const u = await prisma.user.findUnique({ where: { id: actor.userId } });
    return u?.phone ?? '';
  }
});
