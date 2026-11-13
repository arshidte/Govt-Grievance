import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AppModule } from '../src/app.module';
import { SESSION_COOKIE_NAME } from '../src/auth/cookie.util';
import { AllExceptionsFilter } from '../src/common/http-exception.filter';

import { mockAccessToken } from './helpers/login';

/**
 * Auth (e2e) — MSG91 widget login. The dev/test build binds the MOCK MSG91
 * verifier (`env.MSG91_PROVIDER !== 'live'`), which trusts a `test-otp:<phone>`
 * access token, so `POST /auth/verify-token` mints a session without the
 * external widget/service. A real/garbage token is rejected (uniform 401).
 */
function freshPhone(): string {
  const tail = `${Date.now()}${Math.floor(Math.random() * 1000)}`.slice(-9).padStart(9, '0');
  return `+919${tail}`;
}

function extractSessionCookie(response: request.Response): string | undefined {
  const setCookie = response.get('Set-Cookie');
  if (!setCookie) return undefined;
  const cookies = Array.isArray(setCookie) ? setCookie : [setCookie];
  return cookies.find((c) => c.startsWith(`${SESSION_COOKIE_NAME}=`));
}

describe('Auth (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalFilters(new AllExceptionsFilter());
    app.use(cookieParser());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('happy path: verify-token (MSG91) -> session cookie -> me; new user is citizen-only', async () => {
    const phone = freshPhone();

    const verifyResponse = await request(app.getHttpServer())
      .post('/api/v1/auth/verify-token')
      .send({ accessToken: mockAccessToken(phone) });

    expect(verifyResponse.status).toBe(200);

    const sessionCookie = extractSessionCookie(verifyResponse);
    expect(sessionCookie).toBeDefined();
    expect(verifyResponse.body).toMatchObject({ phone, roles: [] });
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

  it('verify-token with an invalid/garbage token -> uniform 401, no cookie, no session', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/verify-token')
      .send({ accessToken: 'not-a-valid-msg91-token' });

    expect(response.status).toBe(401);
    expect(extractSessionCookie(response)).toBeUndefined();
  });

  it('verify-token with an empty token -> 422 validation', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/verify-token')
      .send({ accessToken: '' });

    expect(response.status).toBe(422);
  });
});
