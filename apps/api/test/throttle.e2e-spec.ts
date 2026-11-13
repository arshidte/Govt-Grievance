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
   * Proves the per-IP HTTP throttle is pinned on the auth surface. Every
   * request below uses a DIFFERENT phone (and thus a different mock access
   * token) from the SAME client/IP, so a 429 can only come from the global
   * `ThrottlerGuard`'s per-IP count on `/auth/*` — there is no per-phone server
   * limit anymore (MSG91 owns send/verify rate limiting). Allowed verify-token
   * calls mint sessions (200); the overflow is throttled (429 auth.tooMany).
   */
  it('hammering POST /auth/verify-token with varying tokens trips the per-IP auth throttle -> 429 auth.tooMany', async () => {
    const attempts = AUTH_THROTTLE_LIMIT + 3;
    const responses = [];

    for (let i = 0; i < attempts; i += 1) {
      const phone = freshPhone();
      responses.push(
        // eslint-disable-next-line no-await-in-loop
        await request(app.getHttpServer())
          .post('/api/v1/auth/verify-token')
          .send({ accessToken: `test-otp:${phone}` }),
      );
    }

    const allowed = responses.filter((r) => r.status === 200);
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
