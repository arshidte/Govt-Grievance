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
import type { MockSmsProvider } from '../src/sms/mock-sms.provider';
import { SMS_PROVIDER } from '../src/sms/sms-provider.interface';

/**
 * Task 9 (M2 spec §6.2, Review Focus #1): `IdempotencyService` must be safe
 * under two concurrent requests racing on the SAME `(userId, route, key)`
 * triple, and must treat an expired key as absent at READ time (no purge
 * job required for correctness).
 *
 * IMPORTANT — auth throttle: `AuthController` throttles its whole surface to
 * `AUTH_THROTTLE_LIMIT` (5) calls/IP/60s, and each login costs 2 calls (see
 * `test/issues.e2e-spec.ts`'s header comment). This file logs in exactly
 * ONE citizen, ONCE, in `beforeAll`, and reuses that SAME session cookie
 * across every concurrent-request test below — it deliberately never logs
 * in per test or per request. Each test uses its own `Idempotency-Key`
 * value so the three concurrency scenarios (1b/1c/1d) cannot interfere
 * with each other despite sharing one citizen.
 */
describe('Idempotency concurrency + TTL (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let sms: MockSmsProvider;

  const runId = `t9-${Date.now()}`;

  let categoryId: string;
  let panchayatId: string;
  let wardId: string;

  let cookie: string;
  let userId: string;

  const createdIssueIds: string[] = [];
  const createdUserIds: string[] = [];

  function freshPhone(): string {
    const tail = `${Date.now()}`.slice(-9).padStart(9, '0');
    return `+919${tail}`;
  }

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
    await request(app.getHttpServer()).post('/api/v1/auth/request-otp').send({ phone });
    const code = sms.lastCodeFor(phone);
    const verifyResponse = await request(app.getHttpServer())
      .post('/api/v1/auth/verify-otp')
      .send({ phone, code });

    const setCookie = verifyResponse.get('Set-Cookie');
    const cookies = Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : [];
    const loginCookie = cookies.find((c) => c.startsWith(`${SESSION_COOKIE_NAME}=`));
    if (!loginCookie) throw new Error('login failed: no session cookie set');

    return { cookie: loginCookie, userId: verifyResponse.body.id as string };
  }

  /** POSTs `/issues` with the shared citizen cookie and optional extra headers (e.g. Idempotency-Key). */
  function post(body: CreateIssueInput, headers: Record<string, string> = {}): request.Test {
    let req = request(app.getHttpServer()).post('/api/v1/issues').set('Cookie', cookie).send(body);
    for (const [name, value] of Object.entries(headers)) {
      req = req.set(name, value);
    }
    return req;
  }

  /** Current count of issues owned by the shared citizen. */
  async function countIssues(): Promise<number> {
    const res = await request(app.getHttpServer()).get('/api/v1/issues').set('Cookie', cookie);
    return (res.body as unknown[]).length;
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

    // Exactly ONE login for this whole file (see throttle note above).
    const session = await loginCitizen(freshPhone());
    cookie = session.cookie;
    userId = session.userId;
    createdUserIds.push(userId);
  });

  afterAll(async () => {
    await prisma.notification.deleteMany({ where: { issueId: { in: createdIssueIds } } });
    await prisma.idempotencyKey.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.issue.deleteMany({ where: { id: { in: createdIssueIds } } });
    await prisma.ward.deleteMany({ where: { id: wardId } });
    await prisma.panchayat.deleteMany({ where: { id: panchayatId } });
    await prisma.category.deleteMany({ where: { id: categoryId } });
    await prisma.session.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await app.close();
  });

  it('enforces DB uniqueness on (userId, route, key)', async () => {
    const row = {
      userId: 'u1-idem-unique-test',
      route: 'POST /issues',
      key: 'k',
      fingerprint: 'f',
      responseJson: {},
    };
    const created = await prisma.idempotencyKey.create({ data: row });

    await expect(
      prisma.idempotencyKey.create({ data: { ...row, fingerprint: 'f2' } }),
    ).rejects.toMatchObject({ code: 'P2002' });

    await prisma.idempotencyKey.delete({ where: { id: created.id } });
  });

  it('two concurrent same-key+same-payload submissions create exactly one issue', async () => {
    const before = await countIssues();
    const body = validBody();

    const [a, b] = await Promise.all([
      post(body, { 'Idempotency-Key': 'dup-1' }),
      post(body, { 'Idempotency-Key': 'dup-1' }),
    ]);

    expect([a.status, b.status].every((s) => s < 400)).toBe(true);
    expect(a.body.referenceNo).toBe(b.body.referenceNo);

    if (a.body.id) createdIssueIds.push(a.body.id);
    if (b.body.id && b.body.id !== a.body.id) createdIssueIds.push(b.body.id);

    const after = await countIssues();
    expect(after - before).toBe(1);
  });

  it('two concurrent same-key+different-payload submissions yield one create and one 409 (no second issue)', async () => {
    const before = await countIssues();

    const [a, b] = await Promise.all([
      post({ ...validBody(), title: 'A' }, { 'Idempotency-Key': 'dup-2' }),
      post({ ...validBody(), title: 'B' }, { 'Idempotency-Key': 'dup-2' }),
    ]);

    const statuses = [a.status, b.status].sort((x, y) => x - y);
    expect(statuses[0]).toBeLessThan(400); // one winner created
    expect(statuses[1]).toBe(409); // the other: idempotency_key_conflict

    for (const res of [a, b]) {
      if (res.status < 400 && res.body.id) createdIssueIds.push(res.body.id);
    }

    const after = await countIssues();
    expect(after - before).toBe(1); // never two
  });

  it('treats an expired key as new at read time, independent of scheduled cleanup', async () => {
    const before = await countIssues();

    const first = await post(validBody(), { 'Idempotency-Key': 'ttl-1' });
    expect(first.status).toBeLessThan(400);
    createdIssueIds.push(first.body.id);

    // Backdate the key row > 24h WITHOUT running any purge job.
    await prisma.idempotencyKey.updateMany({
      where: { key: 'ttl-1', userId },
      data: { createdAt: new Date(Date.now() - 25 * 60 * 60 * 1000) },
    });

    const second = await post(validBody(), { 'Idempotency-Key': 'ttl-1' });
    expect(second.status).toBeLessThan(400);
    createdIssueIds.push(second.body.id);

    expect(second.body.referenceNo).not.toBe(first.body.referenceNo); // new issue, not a replay

    const after = await countIssues();
    expect(after - before).toBe(2);
  });
});
