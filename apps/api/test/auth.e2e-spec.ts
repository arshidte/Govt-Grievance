import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AppModule } from '../src/app.module';
import { SESSION_COOKIE_NAME } from '../src/auth/cookie.util';
import { AllExceptionsFilter } from '../src/common/http-exception.filter';
import { SMS_PROVIDER } from '../src/sms/sms-provider.interface';
import type { MockSmsProvider } from '../src/sms/mock-sms.provider';

/**
 * Collision-free phone per test run that satisfies `phoneSchema`
 * (`/^\+91[6-9]\d{9}$/`): a leading 9 then 9 more digits, so 10 total.
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

describe('Auth (e2e)', () => {
  let app: INestApplication;
  let sms: MockSmsProvider;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalFilters(new AllExceptionsFilter());
    app.use(cookieParser());
    await app.init();

    sms = moduleFixture.get(SMS_PROVIDER);
  });

  afterAll(async () => {
    await app.close();
  });

  it('full happy path: request-otp -> verify-otp -> me, new user is citizen-only', async () => {
    const phone = freshPhone();

    const requestResponse = await request(app.getHttpServer())
      .post('/api/v1/auth/request-otp')
      .send({ phone });

    expect([200, 202]).toContain(requestResponse.status);

    const code = sms.lastCodeFor(phone);
    expect(code).toMatch(/^\d{6}$/);

    const verifyResponse = await request(app.getHttpServer())
      .post('/api/v1/auth/verify-otp')
      .send({ phone, code });

    expect(verifyResponse.status).toBe(200);

    const sessionCookie = extractSessionCookie(verifyResponse);
    expect(sessionCookie).toBeDefined();

    expect(verifyResponse.body).toMatchObject({
      phone,
      roles: [],
    });
    expect(verifyResponse.body.id).toBeTypeOf('string');

    const meResponse = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Cookie', sessionCookie as string);

    expect(meResponse.status).toBe(200);
    expect(meResponse.body).toEqual(verifyResponse.body);
  });

  it('GET me without a session cookie -> 401', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/auth/me');

    expect(response.status).toBe(401);
  });

  it('verify-otp with a wrong code -> uniform failure, no cookie, no session', async () => {
    const phone = freshPhone();

    await request(app.getHttpServer()).post('/api/v1/auth/request-otp').send({ phone });

    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/verify-otp')
      .send({ phone, code: '000000' });

    expect([401, 422]).toContain(response.status);
    expect(extractSessionCookie(response)).toBeUndefined();
  });
});
