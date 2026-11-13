import type { INestApplication } from '@nestjs/common';
import request from 'supertest';

import { SESSION_COOKIE_NAME } from '../../src/auth/cookie.util';

/**
 * TEST-ONLY MSG91 access token. The dev/test build binds `MockMsg91Verifier`,
 * which trusts a `test-otp:<phone>` token and returns that phone as verified —
 * so a single `POST /auth/verify-token` mints a real session without the
 * external MSG91 widget/service. Mirrors how the old suite read a mock-SMS code.
 */
export function mockAccessToken(phone: string): string {
  return `test-otp:${phone}`;
}

/**
 * Logs `phone` in through the MSG91 verify-token endpoint (mock verifier) and
 * returns the session cookie + resolved user id. Replaces the old
 * request-otp → mock-SMS code → verify-otp dance used across the e2e suite.
 */
export async function loginAs(
  app: INestApplication,
  phone: string,
): Promise<{ cookie: string; userId: string }> {
  const res = await request(app.getHttpServer())
    .post('/api/v1/auth/verify-token')
    .send({ accessToken: mockAccessToken(phone) });

  const setCookie = res.get('Set-Cookie');
  const cookies = Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : [];
  const cookie = cookies.find((c) => c.startsWith(`${SESSION_COOKIE_NAME}=`));
  if (!cookie) {
    throw new Error(`login failed for ${phone}: no session cookie (status ${res.status})`);
  }
  return { cookie, userId: res.body.id as string };
}
