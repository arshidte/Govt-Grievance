import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { middleware } from './middleware';

/**
 * Locale-prefix strategy: `localePrefix: 'always'` (see src/middleware.ts).
 * Every path is served under an explicit `/en` or `/ml` segment — next-intl's
 * locale middleware redirects unprefixed paths (e.g. `/dashboard`) to the
 * default-locale-prefixed path (e.g. `/en/dashboard`) before our auth gate
 * ever runs. We assert against BOTH the unprefixed path (to exercise the
 * locale-redirect leg) and the already-prefixed path (to exercise the
 * auth-gate leg in isolation), mirroring the citizen app's
 * middleware.test.ts.
 *
 * Auth gate: checks cookie PRESENCE ONLY (`pg_session`). It does NOT (and
 * cannot) check roles — that is the authed layout's job, server-side, via
 * `requireStaff` (see requireStaff.test.ts). Full session validation is
 * also a server-side concern.
 */

function makeRequest(path: string, cookie?: string): NextRequest {
  const url = `http://localhost:3001${path}`;
  const headers = new Headers();
  if (cookie) headers.set('cookie', cookie);
  return new NextRequest(url, { headers });
}

describe('middleware', () => {
  it('redirects an unauthenticated request for a protected path to /login', () => {
    const req = makeRequest('/en/dashboard');
    const res = middleware(req);
    expect(res.status).toBe(307);
    const location = res.headers.get('location');
    expect(location).toContain('/login');
  });

  it('locale-redirects an unprefixed protected path WITHOUT jumping straight to /login', () => {
    const req = makeRequest('/dashboard');
    const res = middleware(req);
    expect(res.status).toBe(307);
    const location = res.headers.get('location');
    expect(location).toContain('/en/dashboard');
    expect(location).not.toContain('/login');
  });

  it('passes through an authenticated request for a protected path', () => {
    const req = makeRequest('/en/dashboard', 'pg_session=abc123');
    const res = middleware(req);
    // No redirect at all when the session cookie is present. The
    // middleware cannot tell staff from citizen here — that's enforced
    // server-side by the authed layout via requireStaff.
    expect(res.headers.get('location')).toBeNull();
  });

  it('passes through /login without a session cookie', () => {
    const req = makeRequest('/en/login');
    const res = middleware(req);
    expect(res.headers.get('location')).toBeNull();
  });

  it('GATES a /login-prefixed sibling route (segment match, not bare prefix)', () => {
    // `/login-help` must NOT be treated as public just because it starts
    // with `/login` — an unauthenticated request should be gated to /login.
    const req = makeRequest('/en/login-help');
    const res = middleware(req);
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toContain('/login');
  });

  it('GATES the root path without a session cookie (no public landing page in admin)', () => {
    const req = makeRequest('/en');
    const res = middleware(req);
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toContain('/login');
  });
});
