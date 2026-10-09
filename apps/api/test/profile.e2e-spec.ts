import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/http-exception.filter';
import { SESSION_COOKIE_NAME } from '../src/auth/cookie.util';
import { PrismaService } from '../src/prisma/prisma.service';
import { SMS_PROVIDER } from '../src/sms/sms-provider.interface';
import type { MockSmsProvider } from '../src/sms/mock-sms.provider';

/**
 * Collision-free phone per test run that satisfies `phoneSchema`
 * (`/^\+91[6-9]\d{9}$/`) — copied from auth.e2e-spec.ts's helper.
 */
function freshPhone(): string {
  const tail = `${Date.now()}${Math.floor(Math.random() * 1000)}`.slice(-9).padStart(9, '0');
  return `+919${tail}`;
}

/** Extracts the session cookie's raw value from a supertest response, if set. */
function extractSessionCookie(response: request.Response): string | undefined {
  const setCookie = response.get('Set-Cookie');
  if (!setCookie) return undefined;
  const cookies = Array.isArray(setCookie) ? setCookie : [setCookie];
  const match = cookies.find((c) => c.startsWith(`${SESSION_COOKIE_NAME}=`));
  return match;
}

/**
 * Auth setup for this spec follows the real OTP flow exactly as
 * `auth.e2e-spec.ts` does (request-otp -> mock SMS `lastCodeFor` -> verify-otp
 * to get a session cookie), rather than inserting a user/session row
 * directly — this exercises the real session-issuance path and keeps the
 * e2e-auth pattern consistent across specs.
 */
describe('Profile (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let sms: MockSmsProvider;

  const panchayatIds: string[] = [];
  const wardIds: string[] = [];
  const userIds: string[] = [];
  const runId = `t14-${Date.now()}`;

  async function createSession(): Promise<{ cookie: string; userId: string; phone: string }> {
    const phone = freshPhone();

    await request(app.getHttpServer()).post('/api/v1/auth/request-otp').send({ phone });
    const code = sms.lastCodeFor(phone);

    const verifyResponse = await request(app.getHttpServer())
      .post('/api/v1/auth/verify-otp')
      .send({ phone, code });

    const cookie = extractSessionCookie(verifyResponse) as string;
    const userId = verifyResponse.body.id as string;
    userIds.push(userId);

    return { cookie, userId, phone };
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

    const panchayat = await prisma.panchayat.create({
      data: {
        code: `${runId}-PNC`,
        name: 'Test Panchayat',
        nameMl: 'ടെസ്റ്റ് പഞ്ചായത്ത്',
        wards: {
          create: [
            { number: 1, name: 'Ward One', nameMl: 'വാർഡ് ഒന്ന്' },
            { number: 2, name: 'Ward Two', nameMl: 'വാർഡ് രണ്ട്' },
          ],
        },
      },
      include: { wards: true },
    });
    panchayatIds.push(panchayat.id);
    wardIds.push(...panchayat.wards.map((w) => w.id));
  });

  afterAll(async () => {
    await prisma.session.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.ward.deleteMany({ where: { id: { in: wardIds } } });
    await prisma.panchayat.deleteMany({ where: { id: { in: panchayatIds } } });
    await app.close();
  });

  it('PATCH /users/me updates fullName and preferredLanguage for the session user', async () => {
    const { cookie, userId } = await createSession();

    const response = await request(app.getHttpServer())
      .patch('/api/v1/users/me')
      .set('Cookie', cookie)
      .send({ fullName: 'Jane Citizen', preferredLanguage: 'ml' });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      id: userId,
      fullName: 'Jane Citizen',
      preferredLanguage: 'ml',
    });

    const persisted = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(persisted.fullName).toBe('Jane Citizen');
    expect(persisted.preferredLanguage).toBe('ml');
  });

  it('PATCH /users/me without a session -> 401', async () => {
    const response = await request(app.getHttpServer())
      .patch('/api/v1/users/me')
      .send({ fullName: 'Nobody', preferredLanguage: 'en' });

    expect(response.status).toBe(401);
  });

  it('PATCH /users/me with an invalid body -> 422, row unchanged', async () => {
    const { cookie, userId } = await createSession();

    const response = await request(app.getHttpServer())
      .patch('/api/v1/users/me')
      .set('Cookie', cookie)
      .send({ fullName: '', preferredLanguage: 'ml' });

    expect(response.status).toBe(422);

    const persisted = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(persisted.fullName).toBeNull();
  });

  it('GET /panchayats with a session returns the seeded panchayat', async () => {
    const { cookie } = await createSession();

    const response = await request(app.getHttpServer())
      .get('/api/v1/panchayats')
      .set('Cookie', cookie);

    expect(response.status).toBe(200);
    const seeded = response.body.find((p: { id: string }) => p.id === panchayatIds[0]);
    expect(seeded).toMatchObject({
      code: `${runId}-PNC`,
      name: 'Test Panchayat',
      nameMl: 'ടെസ്റ്റ് പഞ്ചായത്ത്',
      status: 'active',
    });
  });

  it("GET /panchayats/:id/wards with a session returns the panchayat's wards", async () => {
    const { cookie } = await createSession();

    const response = await request(app.getHttpServer())
      .get(`/api/v1/panchayats/${panchayatIds[0]}/wards`)
      .set('Cookie', cookie);

    expect(response.status).toBe(200);
    expect(response.body).toHaveLength(2);
    expect(response.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ number: 1, name: 'Ward One', panchayatId: panchayatIds[0] }),
        expect.objectContaining({ number: 2, name: 'Ward Two', panchayatId: panchayatIds[0] }),
      ]),
    );
  });
});
