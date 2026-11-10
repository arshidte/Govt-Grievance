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
 * Audit Log read API (M4A, e2e, real Postgres).
 *
 * Two real OTP logins only (admin + one non-admin), in `beforeAll` (4 auth
 * calls < 5/IP cap). Test audit rows are created directly via Prisma with a
 * UNIQUE `entityType` so assertions are isolated from the DB's other audit
 * rows; every query filters by that `entityType`.
 */
describe('Audit log read API (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let sms: MockSmsProvider;

  const runId = `auditread-${Date.now()}`;
  const ET = `${runId}-ET`; // main dataset entity type
  const TIE = `${runId}-TIE`; // same-timestamp dataset
  const ACTION_X = `${runId}-actionX`;
  const ACTION_Y = `${runId}-actionY`;
  const ACTOR_1 = `${runId}-actor1`;
  const ACTOR_2 = `${runId}-actor2`;
  const N = 30;

  let admin: { cookie: string; userId: string };
  let citizen: { cookie: string; userId: string };

  const api = () => request(app.getHttpServer());
  const asAdmin = (r: request.Test) => r.set('Cookie', admin.cookie);
  /** base64url of the given JSON value — used to forge cursors in the malformed-cursor tests. */
  const b64 = (v: unknown) => Buffer.from(JSON.stringify(v), 'utf8').toString('base64url');

  let phoneCounter = 0;
  function freshPhone(): string {
    phoneCounter += 1;
    const tail = `${Date.now()}${phoneCounter}`.slice(-9).padStart(9, '0');
    return `+919${tail}`;
  }
  async function login(phone: string): Promise<{ cookie: string; userId: string }> {
    await api().post('/api/v1/auth/request-otp').send({ phone });
    const code = sms.lastCodeFor(phone);
    const verify = await api().post('/api/v1/auth/verify-otp').send({ phone, code });
    const setCookie = verify.get('Set-Cookie');
    const cookies = Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : [];
    const cookie = cookies.find((c) => c.startsWith(`${SESSION_COOKIE_NAME}=`));
    if (!cookie) throw new Error('login failed');
    return { cookie, userId: verify.body.id as string };
  }

  const base = new Date('2026-01-01T00:00:00.000Z').getTime();

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

    // Main dataset: N rows, distinct ascending timestamps (base + i minutes).
    for (let i = 0; i < N; i += 1) {
      await prisma.auditLog.create({
        data: {
          action: i < 5 ? ACTION_X : ACTION_Y,
          entityType: ET,
          entityId: `${runId}-e${i}`,
          actorUserId: i % 2 === 0 ? ACTOR_1 : ACTOR_2,
          ip: '10.1.2.3', // must NEVER appear in responses
          metadata: { n: i, note: 'as-stored' },
          createdAt: new Date(base + i * 60_000),
        },
      });
    }
    // Tie dataset: 3 rows sharing the EXACT same timestamp.
    const tieAt = new Date(base + 999 * 60_000);
    for (let k = 0; k < 3; k += 1) {
      await prisma.auditLog.create({
        data: { action: `${runId}-tie`, entityType: TIE, entityId: `${runId}-t${k}`, ip: '10.1.2.3', createdAt: tieAt },
      });
    }

    admin = await login(freshPhone());
    citizen = await login(freshPhone());
    await prisma.roleAssignment.create({ data: { userId: admin.userId, role: 'ADMIN' } });
  });

  afterAll(async () => {
    await prisma.auditLog.deleteMany({ where: { entityType: { in: [ET, TIE] } } });
    const userIds = [admin.userId, citizen.userId];
    await prisma.roleAssignment.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.session.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await app.close();
  });

  // ---- Authorization -----------------------------------------------------

  it('401 unauthenticated, 403 non-admin, 200 admin', async () => {
    expect((await api().get('/api/v1/audit-logs')).status).toBe(401);
    expect((await api().get('/api/v1/audit-logs').set('Cookie', citizen.cookie)).status).toBe(403);
    const ok = await asAdmin(api().get('/api/v1/audit-logs'));
    expect(ok.status).toBe(200);
    expect(Array.isArray(ok.body.items)).toBe(true);
  });

  // ---- Response shape + security -----------------------------------------

  it('returns only the defined fields (no ip), metadata as stored, no actor enrichment', async () => {
    const res = await asAdmin(api().get('/api/v1/audit-logs').query({ entityType: ET, limit: 1 }));
    expect(res.status).toBe(200);
    const item = res.body.items[0];
    expect(Object.keys(item).sort()).toEqual(
      ['action', 'actorUserId', 'createdAt', 'entityId', 'entityType', 'id', 'metadata'].sort(),
    );
    expect(item).not.toHaveProperty('ip');
    expect(JSON.stringify(res.body)).not.toContain('10.1.2.3'); // ip never leaks
    // metadata returned verbatim; actorUserId is the raw id (no phone/name/email).
    expect(item.metadata).toEqual({ n: N - 1, note: 'as-stored' });
    expect(typeof item.actorUserId === 'string' || item.actorUserId === null).toBe(true);
  });

  // ---- Ordering + default limit ------------------------------------------

  it('orders by createdAt DESC, id DESC and defaults limit to 25', async () => {
    const res = await asAdmin(api().get('/api/v1/audit-logs').query({ entityType: ET }));
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(25); // default
    expect(res.body.hasMore).toBe(true);
    const times = res.body.items.map((i: { createdAt: string }) => new Date(i.createdAt).getTime());
    for (let k = 1; k < times.length; k += 1) expect(times[k]).toBeLessThanOrEqual(times[k - 1]);
    // Newest first = the last-created row (i = N-1).
    expect(res.body.items[0].entityId).toBe(`${runId}-e${N - 1}`);
  });

  // ---- Limit bounds ------------------------------------------------------

  it('rejects limit > 100 and limit < 1 (422); honors a valid limit', async () => {
    expect((await asAdmin(api().get('/api/v1/audit-logs').query({ limit: 101 }))).status).toBe(422);
    expect((await asAdmin(api().get('/api/v1/audit-logs').query({ limit: 0 }))).status).toBe(422);
    const ok = await asAdmin(api().get('/api/v1/audit-logs').query({ entityType: ET, limit: 5 }));
    expect(ok.body.items).toHaveLength(5);
  });

  // ---- Filters -----------------------------------------------------------

  it('filters by action / entityId / actorUserId and combines them', async () => {
    const x = await asAdmin(api().get('/api/v1/audit-logs').query({ entityType: ET, action: ACTION_X, limit: 100 }));
    expect(x.body.items).toHaveLength(5);
    expect(x.body.items.every((i: { action: string }) => i.action === ACTION_X)).toBe(true);

    const one = await asAdmin(api().get('/api/v1/audit-logs').query({ entityId: `${runId}-e7`, limit: 100 }));
    expect(one.body.items).toHaveLength(1);
    expect(one.body.items[0].entityId).toBe(`${runId}-e7`);

    const a1 = await asAdmin(api().get('/api/v1/audit-logs').query({ entityType: ET, actorUserId: ACTOR_1, limit: 100 }));
    expect(a1.body.items).toHaveLength(15); // even indices 0..28
    expect(a1.body.items.every((i: { actorUserId: string }) => i.actorUserId === ACTOR_1)).toBe(true);

    const combined = await asAdmin(
      api().get('/api/v1/audit-logs').query({ entityType: ET, action: ACTION_Y, actorUserId: ACTOR_2, limit: 100 }),
    );
    // ACTION_Y is i>=5; ACTOR_2 is odd i → odd i in [5,29] = {5,7,...,29} = 13.
    expect(combined.body.items).toHaveLength(13);
  });

  it('applies inclusive from/to date bounds and rejects from > to and invalid dates', async () => {
    const from = new Date(base + 10 * 60_000).toISOString();
    const to = new Date(base + 12 * 60_000).toISOString();
    const res = await asAdmin(api().get('/api/v1/audit-logs').query({ entityType: ET, from, to, limit: 100 }));
    const ids = res.body.items.map((i: { entityId: string }) => i.entityId).sort();
    expect(ids).toEqual([`${runId}-e10`, `${runId}-e11`, `${runId}-e12`].sort()); // both bounds inclusive

    expect((await asAdmin(api().get('/api/v1/audit-logs').query({ from: to, to: from }))).status).toBe(422);
    expect((await asAdmin(api().get('/api/v1/audit-logs').query({ from: 'not-a-date' }))).status).toBe(422);
  });

  // ---- Cursor pagination (no dup / no skip) ------------------------------

  it('paginates deterministically with no duplicates or skipped rows', async () => {
    const truth = await prisma.auditLog.findMany({
      where: { entityType: ET },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: { id: true },
    });
    const expectedIds = truth.map((r) => r.id);

    const collected: string[] = [];
    let cursor: string | null = null;
    let guard = 0;
    do {
      const q: Record<string, string | number> = { entityType: ET, limit: 10 };
      if (cursor) q.cursor = cursor;
      const res = await asAdmin(api().get('/api/v1/audit-logs').query(q));
      expect(res.status).toBe(200);
      collected.push(...res.body.items.map((i: { id: string }) => i.id));
      cursor = res.body.nextCursor;
      expect(res.body.hasMore).toBe(cursor !== null);
      guard += 1;
    } while (cursor && guard < 10);

    expect(collected).toEqual(expectedIds); // exact order, no dups, no skips
    expect(new Set(collected).size).toBe(N);
  });

  it('keyset handles rows sharing the same timestamp (id DESC tiebreak)', async () => {
    const truth = await prisma.auditLog.findMany({
      where: { entityType: TIE },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: { id: true },
    });
    const collected: string[] = [];
    let cursor: string | null = null;
    let guard = 0;
    do {
      const q: Record<string, string | number> = { entityType: TIE, limit: 1 };
      if (cursor) q.cursor = cursor;
      const res = await asAdmin(api().get('/api/v1/audit-logs').query(q));
      collected.push(...res.body.items.map((i: { id: string }) => i.id));
      cursor = res.body.nextCursor;
      guard += 1;
    } while (cursor && guard < 10);

    expect(collected).toEqual(truth.map((r) => r.id)); // 3 rows, correct id-DESC order, no dup/skip
  });

  // ---- Malformed cursor --------------------------------------------------

  it('rejects malformed cursors (422)', async () => {
    const cases = [
      'not-base64-$$$',
      b64('hello'), // valid base64url but not an object
      b64({ c: '2026-01-01T00:00:00.000Z' }), // missing id
      b64({ c: 'not-a-date', i: 'x' }), // invalid date
    ];
    for (const cursor of cases) {
      const res = await asAdmin(api().get('/api/v1/audit-logs').query({ cursor }));
      expect(res.status).toBe(422);
    }
  });
});
