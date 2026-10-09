import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AppModule } from '../src/app.module';
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

/**
 * Covers the dev-only `GET /api/v1/dev/last-otp` endpoint end-to-end
 * through the real app (NODE_ENV='test' for this run, which is NOT
 * 'production', so `DevModule` IS imported into `AppModule` — see
 * src/app.module.ts). The in-handler production-guard branch itself
 * (`isDevEndpointEnabled` returning false) is covered by a focused unit
 * test in src/dev/dev.controller.spec.ts, which mocks `env.NODE_ENV` to
 * `'production'` and asserts the real `DevController` instance 404s
 * without ever returning a code — that's the acceptance-critical property
 * and isn't exercisable from an e2e boot without a second process, since
 * `env` is parsed once eagerly at import time.
 */
describe('Dev last-otp endpoint (e2e)', () => {
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

  it('returns the last OTP code for a phone that was just sent one (non-production)', async () => {
    const phone = freshPhone();

    await request(app.getHttpServer()).post('/api/v1/auth/request-otp').send({ phone });

    const expectedCode = sms.lastCodeFor(phone);
    expect(expectedCode).toMatch(/^\d{6}$/);

    const response = await request(app.getHttpServer())
      .get('/api/v1/dev/last-otp')
      .query({ phone });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ code: expectedCode });
  });

  it('returns 404 for a phone with no OTP on record', async () => {
    const phone = freshPhone();

    const response = await request(app.getHttpServer())
      .get('/api/v1/dev/last-otp')
      .query({ phone });

    expect(response.status).toBe(404);
  });

  it('returns 404 when the phone query param is missing', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/dev/last-otp');

    expect(response.status).toBe(404);
  });
});
