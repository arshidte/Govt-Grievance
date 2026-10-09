import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { middleware } from './middleware';

/**
 * Locale-prefix strategy: `localePrefix: 'always'` (see src/middleware.ts).
 * Every path is served under an explicit `/en` or `/ml` segment — next-intl's
 * locale middleware redirects unprefixed paths (e.g. `/home`) to the
 * default-locale-prefixed path (e.g. `/en/home`) before our auth gate ever
 * runs. We assert against BOTH the unprefixed path (to exercise the
 * locale-redirect leg) and the already-prefixed path (to exercise the
 * auth-gate leg in isolation), per the brief's guidance to account for
 * locale prefixing explicitly.
 *
 * Auth gate: checks cookie PRESENCE ONLY (`pg_session`). Full session
 * validation is a server-side concern (handled by the backend / server
 * components), per the Global Constraint that the backend is the
 * authoritative auth layer.
 */

function makeRequest(path: string, cookie?: string): NextRequest {
  const url = `http://localhost:3000${path}`;
  const headers = new Headers();
  if (cookie) headers.set('cookie', cookie);
  return new NextRequest(url, { headers });
}

describe('middleware', () => {
  it('redirects an unauthenticated request for a protected path to /login', () => {
    const req = makeRequest('/en/home');
    const res = middleware(req);
    expect(res.status).toBe(307);
    const location = res.headers.get('location');
    expect(location).toContain('/login');
  });

  it('locale-redirects an unprefixed protected path WITHOUT jumping straight to /login', () => {
    // next-intl's locale redirect takes priority on the first hop (an
    // unprefixed path has no locale segment yet, so there's nothing for
    // the auth gate to safely redirect relative to). The auth gate then
    // runs on the follow-up request to the now-prefixed path (covered by
    // the 'redirects an unauthenticated request for a protected path'
    // case above, using `/en/home` directly).
    const req = makeRequest('/home');
    const res = middleware(req);
    expect(res.status).toBe(307);
    const location = res.headers.get('location');
    expect(location).toContain('/en/home');
    expect(location).not.toContain('/login');
  });

  it('passes through an authenticated request for a protected path', () => {
    const req = makeRequest('/en/home', 'pg_session=abc123');
    const res = middleware(req);
    // No redirect at all when the session cookie is present.
    expect(res.headers.get('location')).toBeNull();
  });

  it('passes through the landing page without a session cookie', () => {
    const req = makeRequest('/en');
    const res = middleware(req);
    expect(res.headers.get('location')).toBeNull();
  });

  it('passes through /track without a session cookie', () => {
    const req = makeRequest('/en/track');
    const res = middleware(req);
    expect(res.headers.get('location')).toBeNull();
  });

  it('passes through /verify without a session cookie (T23 — reached before the cookie is set)', () => {
    const req = makeRequest('/en/verify');
    const res = middleware(req);
    expect(res.headers.get('location')).toBeNull();
  });

  it('passes through /register without a session cookie (T23)', () => {
    const req = makeRequest('/en/register');
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

  it('passes through unprefixed /track without a session cookie (locale-redirect only)', () => {
    const req = makeRequest('/track');
    const res = middleware(req);
    const location = res.headers.get('location');
    // Only the locale-redirect should fire here, never a /login redirect.
    if (location) expect(location).not.toContain('/login');
  });
});
