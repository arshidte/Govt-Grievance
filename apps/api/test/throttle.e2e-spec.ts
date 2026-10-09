import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AUTH_THROTTLE_LIMIT } from '../src/common/throttler.config';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/http-exception.filter';

/**
 * A fresh, schema-valid phone number per call (`/^\+91[6-9]\d{9}$/` — see
 * `phoneSchema`). Unlike `auth.e2e-spec.ts`'s `freshPhone`, this is called in
 * a tight loop, so it mixes in a per-call counter (not just `Date.now()`,
 * which can repeat within the same millisecond under a hammering loop) to
 * guarantee no two calls in this file collide.
 */
let phoneCounter = 0;
function freshPhone(): string {
  phoneCounter += 1;
  const tail = `${Date.now()}${phoneCounter}`.slice(-9).padStart(9, '0');
  return `+919${tail}`;
}

describe('Throttle (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalFilters(new AllExceptionsFilter());
    app.use(helmet());
    app.use(cookieParser());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  /**
   * Proves Review Focus #5 is pinned at the HTTP edge (this task), not at
   * `OtpService`'s per-phone hourly limit (Task 9). Both throw the SAME
   * `ApiError('rate_limited', 429, 'auth.tooMany')`, so to attribute the 429
   * to the per-IP HTTP throttle specifically, every request below uses a
   * DIFFERENT phone (same client/IP) — the per-phone counter in
   * `OtpService.request` never approaches its own limit, so if we see 429s
   * here they can only come from the global `ThrottlerGuard`'s per-IP count
   * on `/auth/*`.
   */
  it('hammering POST /auth/request-otp with varying phones trips the per-IP auth throttle -> 429 auth.tooMany', async () => {
    const attempts = AUTH_THROTTLE_LIMIT + 3;
    const responses = [];

    for (let i = 0; i < attempts; i += 1) {
      responses.push(
        // eslint-disable-next-line no-await-in-loop
        await request(app.getHttpServer())
          .post('/api/v1/auth/request-otp')
          .send({ phone: freshPhone() }),
      );
    }

    const allowed = responses.filter((r) => r.status === 202);
    const limited = responses.filter((r) => r.status === 429);

    expect(allowed.length).toBeLessThanOrEqual(AUTH_THROTTLE_LIMIT);
    expect(limited.length).toBeGreaterThan(0);

    for (const response of limited) {
      expect(response.status).toBe(429);
      expect(response.body).toEqual({
        error: { code: 'rate_limited', messageKey: 'auth.tooMany' },
      });
    }
  });
});
