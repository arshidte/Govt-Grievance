import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { isAllowed } from '../../../../lib/bff-allowlist';

import { DELETE, GET, PATCH, POST } from './route';

/**
 * Unit-tests the GENERAL `/api/v1/*` ADMIN BFF catch-all (Task 19, parallel
 * to citizen's Task 18) — a STRICT path+method ALLOWLIST with traversal /
 * absolute-URL rejection and a fixed internal origin. The sibling auth-only
 * catch-all is tested in `../auth/[...action]/route.test.ts`; both routes
 * share the same `proxyToApi` relay helper (`src/lib/bff-proxy.ts`) and the
 * same `isPathSafe` guard (`src/lib/bff-allowlist.ts`).
 *
 * The suite implements the full BFF Security Test Matrix (rows 1–9, shared
 * by Tasks 18 & 19) against the ADMIN allowlist, plus admin-specific
 * negatives. Every negative row asserts `fetch` was NEVER called (the
 * request must be rejected BEFORE any upstream contact).
 */
describe('BFF general proxy route handler (/api/v1/*) — admin hardened allowlist', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // Small helper: a fetch mock that returns a benign 200 JSON response.
  function okFetch(body: unknown = { ok: true }) {
    return vi.fn(
      async () =>
        new Response(JSON.stringify(body), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    );
  }

  // ──────────────────────────────────────────────────────────────────────
  // `isAllowed` unit coverage (the allowlist logic in isolation).
  // ──────────────────────────────────────────────────────────────────────
  describe('isAllowed()', () => {
    it('allows the exact admin (method, path) pairs', () => {
      expect(isAllowed('GET', ['issues'])).toBe(true);
      expect(isAllowed('GET', ['issues', 'abc-123'])).toBe(true);
      expect(isAllowed('PATCH', ['issues', 'abc-123', 'status'])).toBe(true);
      expect(isAllowed('GET', ['attachments', 'att-1'])).toBe(true);
    });

    it('ADMIN-SPECIFIC: PATCH issues/:id/status is ALLOWED here (unlike citizen, which blocks it)', () => {
      expect(isAllowed('PATCH', ['issues', 'x', 'status'])).toBe(true);
    });

    it('allows the org-management (method, path) pairs (admin modules)', () => {
      expect(isAllowed('GET', ['panchayats'])).toBe(true);
      expect(isAllowed('POST', ['panchayats'])).toBe(true);
      expect(isAllowed('GET', ['panchayats', 'p1'])).toBe(true);
      expect(isAllowed('PATCH', ['panchayats', 'p1'])).toBe(true);
      expect(isAllowed('POST', ['panchayats', 'p1', 'deactivate'])).toBe(true);
      expect(isAllowed('POST', ['panchayats', 'p1', 'reactivate'])).toBe(true);
      expect(isAllowed('GET', ['panchayats', 'p1', 'wards'])).toBe(true);
      expect(isAllowed('POST', ['panchayats', 'p1', 'wards'])).toBe(true);
      expect(isAllowed('GET', ['wards', 'w1'])).toBe(true);
      expect(isAllowed('PATCH', ['wards', 'w1'])).toBe(true);
      expect(isAllowed('POST', ['wards', 'w1', 'deactivate'])).toBe(true);
      expect(isAllowed('POST', ['wards', 'w1', 'reactivate'])).toBe(true);
      expect(isAllowed('GET', ['staff', 'search'])).toBe(true);
      expect(isAllowed('GET', ['representatives'])).toBe(true);
      expect(isAllowed('POST', ['representatives'])).toBe(true);
      expect(isAllowed('POST', ['representatives', 'a1', 'revoke'])).toBe(true);
      expect(isAllowed('GET', ['coordinators'])).toBe(true);
      expect(isAllowed('POST', ['coordinators'])).toBe(true);
      expect(isAllowed('POST', ['coordinators', 'a1', 'revoke'])).toBe(true);
    });

    it('still blocks non-surface org verbs/shapes', () => {
      expect(isAllowed('DELETE', ['panchayats', 'p1'])).toBe(false);
      expect(isAllowed('PATCH', ['panchayats'])).toBe(false);
      expect(isAllowed('GET', ['representatives', 'a1', 'revoke'])).toBe(false); // revoke is POST-only
      expect(isAllowed('POST', ['staff', 'search'])).toBe(false); // search is GET-only
    });

    it('matches method case-insensitively but exactly (GET ≠ PATCH)', () => {
      expect(isAllowed('get', ['issues'])).toBe(true);
      expect(isAllowed('patch', ['issues', 'x', 'status'])).toBe(true);
      expect(isAllowed('PATCH', ['issues'])).toBe(false); // PATCH not allowed on bare `issues`
      expect(isAllowed('DELETE', ['issues', 'x'])).toBe(false);
    });

    it('rejects wrong segment counts and unlisted paths', () => {
      expect(isAllowed('GET', ['issues', 'x', 'extra'])).toBe(false);
      expect(isAllowed('POST', ['issues'])).toBe(false); // citizen-only create
      expect(isAllowed('POST', ['issues', 'on-behalf'])).toBe(false); // not in admin surface
      expect(isAllowed('POST', ['issues', 'x', 'attachment'])).toBe(false); // citizen-only upload
      expect(isAllowed('GET', ['notifications'])).toBe(false);
      expect(isAllowed('PATCH', ['notifications', 'n1', 'read'])).toBe(false);
      expect(isAllowed('GET', ['categories'])).toBe(false);
      expect(isAllowed('GET', ['users', 'me'])).toBe(false);
      expect(isAllowed('PATCH', ['users', 'me'])).toBe(false);
      expect(isAllowed('GET', ['dev', 'last-otp'])).toBe(false);
    });

    it('rejects `:param` segments that are traversal tokens or empty', () => {
      expect(isAllowed('GET', ['issues', '..'])).toBe(false);
      expect(isAllowed('GET', ['issues', '.'])).toBe(false);
      expect(isAllowed('GET', ['issues', ''])).toBe(false);
      expect(isAllowed('PATCH', ['issues', '..', 'status'])).toBe(false);
    });
  });

  // ──────────────────────────────────────────────────────────────────────
  // Row 1 — allowlisted (method, path) forwards with body/query + Cookie.
  // ──────────────────────────────────────────────────────────────────────
  it('Row 1: forwards an allowlisted GET issues/:id to API_INTERNAL_URL with query + inbound Cookie intact', async () => {
    const fetchMock = okFetch({ id: 'abc-123' });
    vi.stubGlobal('fetch', fetchMock);

    const request = new NextRequest('http://localhost:3001/api/v1/issues/abc-123?foo=bar', {
      method: 'GET',
      headers: { cookie: 'pg_session=abc123' },
    });
    const response = await GET(request, {
      params: Promise.resolve({ path: ['issues', 'abc-123'] }),
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [calledUrl, calledInit] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(calledUrl).toBe(`${process.env.API_INTERNAL_URL}/api/v1/issues/abc-123?foo=bar`);
    expect(calledInit.method).toBe('GET');
    expect((calledInit.headers as Headers).get('cookie')).toBe('pg_session=abc123');
    expect(response.status).toBe(200);
  });

  it('Row 1b: forwards the admin-specific PATCH issues/:id/status with body + content-type + Cookie intact', async () => {
    const fetchMock = okFetch({ id: 'abc-123', status: 'TRIAGED' });
    vi.stubGlobal('fetch', fetchMock);

    const payload = JSON.stringify({ toStatus: 'TRIAGED', note: 'Reviewed' });
    const request = new NextRequest('http://localhost:3001/api/v1/issues/abc-123/status', {
      method: 'PATCH',
      body: payload,
      headers: { 'content-type': 'application/json', cookie: 'pg_session=staff123' },
    });
    const response = await PATCH(request, {
      params: Promise.resolve({ path: ['issues', 'abc-123', 'status'] }),
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [calledUrl, calledInit] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(calledUrl).toBe(`${process.env.API_INTERNAL_URL}/api/v1/issues/abc-123/status`);
    expect(calledInit.method).toBe('PATCH');
    expect(calledInit.body).toBe(payload);
    expect((calledInit.headers as Headers).get('content-type')).toBe('application/json');
    expect((calledInit.headers as Headers).get('cookie')).toBe('pg_session=staff123');
    expect(response.status).toBe(200);
  });

  // ──────────────────────────────────────────────────────────────────────
  // Row 2 — non-allowlisted path → 404, upstream never called.
  // ──────────────────────────────────────────────────────────────────────
  it('Row 2: non-allowlisted path (GET users/me) → 404, upstream never called', async () => {
    const fetchMock = okFetch();
    vi.stubGlobal('fetch', fetchMock);

    const request = new NextRequest('http://localhost:3001/api/v1/users/me', { method: 'GET' });
    const response = await GET(request, { params: Promise.resolve({ path: ['users', 'me'] }) });

    expect(response.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('Row 2b: non-allowlisted path (GET notifications) → 404, upstream never called', async () => {
    const fetchMock = okFetch();
    vi.stubGlobal('fetch', fetchMock);

    const request = new NextRequest('http://localhost:3001/api/v1/notifications', { method: 'GET' });
    const response = await GET(request, { params: Promise.resolve({ path: ['notifications'] }) });

    expect(response.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('Row 2c: non-allowlisted path (GET categories) → 404, upstream never called', async () => {
    const fetchMock = okFetch();
    vi.stubGlobal('fetch', fetchMock);

    const request = new NextRequest('http://localhost:3001/api/v1/categories', { method: 'GET' });
    const response = await GET(request, { params: Promise.resolve({ path: ['categories'] }) });

    expect(response.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  // ──────────────────────────────────────────────────────────────────────
  // Row 3 — non-allowlisted method on an allowlisted path → 404.
  // ──────────────────────────────────────────────────────────────────────
  it('Row 3: non-allowlisted method (DELETE issues/x) → 404, upstream never called', async () => {
    const fetchMock = okFetch();
    vi.stubGlobal('fetch', fetchMock);

    const request = new NextRequest('http://localhost:3001/api/v1/issues/x', { method: 'DELETE' });
    const response = await DELETE(request, { params: Promise.resolve({ path: ['issues', 'x'] }) });

    expect(response.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('Row 3b: non-allowlisted method (POST issues) → 404, upstream never called', async () => {
    const fetchMock = okFetch();
    vi.stubGlobal('fetch', fetchMock);

    const request = new NextRequest('http://localhost:3001/api/v1/issues', {
      method: 'POST',
      body: JSON.stringify({ title: 'x' }),
      headers: { 'content-type': 'application/json' },
    });
    const response = await POST(request, { params: Promise.resolve({ path: ['issues'] }) });

    expect(response.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  // ──────────────────────────────────────────────────────────────────────
  // Row 4 — path traversal rejected (decode-then-reject), upstream never called.
  // ──────────────────────────────────────────────────────────────────────
  it('Row 4: path traversal (issues/../secret) → 404, upstream never called', async () => {
    const fetchMock = okFetch();
    vi.stubGlobal('fetch', fetchMock);

    // Next delivers the already-decoded catch-all segments; a crafted
    // `/api/v1/issues/%2e%2e/secret` arrives as ['issues', '..', 'secret'].
    const request = new NextRequest('http://localhost:3001/api/v1/issues/x', { method: 'GET' });
    const response = await GET(request, {
      params: Promise.resolve({ path: ['issues', '..', 'secret'] }),
    });

    expect(response.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('Row 4b: encoded traversal segment (%2e%2e) normalizes-then-rejects → 404, upstream never called', async () => {
    const fetchMock = okFetch();
    vi.stubGlobal('fetch', fetchMock);

    // Even if a segment somehow arrives still-encoded, isPathSafe decodes
    // it to `..` and rejects — the fetch-normalization vector is closed.
    const request = new NextRequest('http://localhost:3001/api/v1/issues/x', { method: 'GET' });
    const response = await GET(request, {
      params: Promise.resolve({ path: ['issues', '%2e%2e', 'secret'] }),
    });

    expect(response.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('Row 4c: slash-smuggling segment (%2f) → 404, upstream never called', async () => {
    const fetchMock = okFetch();
    vi.stubGlobal('fetch', fetchMock);

    const request = new NextRequest('http://localhost:3001/api/v1/issues/x', { method: 'GET' });
    const response = await GET(request, {
      params: Promise.resolve({ path: ['issues', 'a%2fb'] }),
    });

    expect(response.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('Row 4d: double-encoded traversal (%252e%252e) → 404, upstream never called', async () => {
    const fetchMock = okFetch();
    vi.stubGlobal('fetch', fetchMock);

    // Single decode of `%252e%252e` yields `%2e%2e` (still not literal `..`),
    // but it must still be rejected, not forwarded.
    const request = new NextRequest('http://localhost:3001/api/v1/issues/x', { method: 'GET' });
    const response = await GET(request, {
      params: Promise.resolve({ path: ['issues', '%252e%252e', 'secret'] }),
    });

    // This value decodes (once) to the literal string `%2e%2e`, which is a
    // CLEAN segment (not `.`/`..`, no `/`, no scheme) — isPathSafe allows it
    // through as an opaque id-like segment, and isAllowed then rejects it on
    // shape (3 segments doesn't match `issues/:id` (2) or
    // `issues/:id/status` literal `status`). Assert the net effect: 404,
    // upstream never called.
    expect(response.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  // ──────────────────────────────────────────────────────────────────────
  // Row 5 — absolute-URL / host override rejected; origin is ONLY API_INTERNAL_URL.
  // ──────────────────────────────────────────────────────────────────────
  it('Row 5: host-override segment (//evil.test) → 404, upstream never called', async () => {
    const fetchMock = okFetch();
    vi.stubGlobal('fetch', fetchMock);

    const request = new NextRequest('http://localhost:3001/api/v1/issues/x', { method: 'GET' });
    const response = await GET(request, {
      params: Promise.resolve({ path: ['issues', '//evil.test', 'x'] }),
    });

    expect(response.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('Row 5b: absolute-URL segment (http://evil.test) → 404; if fetch runs, origin is only API_INTERNAL_URL', async () => {
    const fetchMock = okFetch();
    vi.stubGlobal('fetch', fetchMock);

    const request = new NextRequest('http://localhost:3001/api/v1/issues/x', { method: 'GET' });
    const response = await GET(request, {
      params: Promise.resolve({ path: ['issues', 'http://evil.test/x'] }),
    });

    expect(response.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
    // Defense-in-depth: nothing ever addressed evil.test. (The mock's
    // zero-arg signature types `calls` as `[][]`, so read the URL via the
    // dynamic `unknown[]` view.)
    for (const call of fetchMock.mock.calls as unknown as unknown[][]) {
      expect(String(call[0])).not.toContain('evil.test');
    }
  });

  // ──────────────────────────────────────────────────────────────────────
  // Row 6 — Authorization from client NOT forwarded (only Cookie + content-type).
  // ──────────────────────────────────────────────────────────────────────
  it('Row 6: inbound Authorization header is NOT forwarded to upstream', async () => {
    const fetchMock = okFetch();
    vi.stubGlobal('fetch', fetchMock);

    const request = new NextRequest('http://localhost:3001/api/v1/issues', {
      method: 'GET',
      headers: {
        authorization: 'Bearer leaked-token',
        cookie: 'pg_session=abc123',
        'content-type': 'application/json',
      },
    });
    await GET(request, { params: Promise.resolve({ path: ['issues'] }) });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, calledInit] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const forwarded = calledInit.headers as Headers;
    expect(forwarded.get('authorization')).toBeNull();
    expect(forwarded.get('cookie')).toBe('pg_session=abc123');
    expect(forwarded.get('content-type')).toBe('application/json');
  });

  // ──────────────────────────────────────────────────────────────────────
  // Row 7 — Set-Cookie relayed via getSetCookie() (multiples survive intact).
  // ──────────────────────────────────────────────────────────────────────
  it('Row 7: relays multiple upstream Set-Cookie headers as separate, intact cookies (comma-in-Expires safe)', async () => {
    const cookieA = 'pg_session=abc123; Path=/; HttpOnly; Expires=Fri, 09 Oct 2026 00:00:00 GMT';
    const cookieB = 'other=xyz; Path=/; HttpOnly';

    const upstreamHeaders = new Headers();
    upstreamHeaders.append('set-cookie', cookieA);
    upstreamHeaders.append('set-cookie', cookieB);
    upstreamHeaders.set('content-type', 'application/json');

    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ ok: true }), { status: 200, headers: upstreamHeaders }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const request = new NextRequest('http://localhost:3001/api/v1/issues/x/status', {
      method: 'PATCH',
      body: JSON.stringify({ toStatus: 'TRIAGED', note: 'n' }),
      headers: { 'content-type': 'application/json' },
    });
    const response = await PATCH(request, {
      params: Promise.resolve({ path: ['issues', 'x', 'status'] }),
    });

    const relayed = response.headers.getSetCookie();
    expect(relayed).toHaveLength(2);
    expect(relayed).toContain(cookieA);
    expect(relayed).toContain(cookieB);
  });

  // ──────────────────────────────────────────────────────────────────────
  // Row 8 — internal origin never leaked in a 502.
  // ──────────────────────────────────────────────────────────────────────
  it('Row 8: upstream failure → 502 whose body/headers contain NO API_INTERNAL_URL substring', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('ECONNREFUSED 127.0.0.1:4000');
      }),
    );

    const request = new NextRequest('http://localhost:3001/api/v1/issues', { method: 'GET' });
    const response = await GET(request, { params: Promise.resolve({ path: ['issues'] }) });

    expect(response.status).toBe(502);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe('upstream_unreachable');
    expect(JSON.stringify(body)).not.toContain(process.env.API_INTERNAL_URL);
    const headerDump = JSON.stringify([...response.headers.entries()]);
    expect(headerDump).not.toContain(process.env.API_INTERNAL_URL);
  });

  // ──────────────────────────────────────────────────────────────────────
  // Row 9 — Cookie forwarded for authed calls (pg_session reaches upstream unchanged).
  // ──────────────────────────────────────────────────────────────────────
  it('Row 9: inbound pg_session cookie reaches upstream unchanged on an authed call', async () => {
    const fetchMock = okFetch({ id: 'abc-123', status: 'TRIAGED' });
    vi.stubGlobal('fetch', fetchMock);

    const request = new NextRequest('http://localhost:3001/api/v1/issues/abc-123/status', {
      method: 'PATCH',
      body: JSON.stringify({ toStatus: 'TRIAGED', note: 'n' }),
      headers: { 'content-type': 'application/json', cookie: 'pg_session=abc123' },
    });
    await PATCH(request, { params: Promise.resolve({ path: ['issues', 'abc-123', 'status'] }) });

    const [, calledInit] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect((calledInit.headers as Headers).get('cookie')).toBe('pg_session=abc123');
  });

  // ──────────────────────────────────────────────────────────────────────
  // Admin-specific negatives (explicit): citizen/rep-only + dev + other-app
  // routes 404 on the admin allowlist.
  // ──────────────────────────────────────────────────────────────────────
  it('negative: POST /api/v1/issues/on-behalf → 404, upstream never called', async () => {
    const fetchMock = okFetch();
    vi.stubGlobal('fetch', fetchMock);

    const request = new NextRequest('http://localhost:3001/api/v1/issues/on-behalf', {
      method: 'POST',
      body: JSON.stringify({}),
      headers: { 'content-type': 'application/json' },
    });
    const response = await POST(request, {
      params: Promise.resolve({ path: ['issues', 'on-behalf'] }),
    });

    expect(response.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('negative: GET /api/v1/dev/last-otp (dev-only) → 404, upstream never called', async () => {
    const fetchMock = okFetch();
    vi.stubGlobal('fetch', fetchMock);

    const request = new NextRequest('http://localhost:3001/api/v1/dev/last-otp', { method: 'GET' });
    const response = await GET(request, { params: Promise.resolve({ path: ['dev', 'last-otp'] }) });

    expect(response.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('negative: GET /api/v1/notifications → 404, upstream never called', async () => {
    const fetchMock = okFetch();
    vi.stubGlobal('fetch', fetchMock);

    const request = new NextRequest('http://localhost:3001/api/v1/notifications', { method: 'GET' });
    const response = await GET(request, { params: Promise.resolve({ path: ['notifications'] }) });

    expect(response.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('negative: GET /api/v1/users/me → 404, upstream never called', async () => {
    const fetchMock = okFetch();
    vi.stubGlobal('fetch', fetchMock);

    const request = new NextRequest('http://localhost:3001/api/v1/users/me', { method: 'GET' });
    const response = await GET(request, { params: Promise.resolve({ path: ['users', 'me'] }) });

    expect(response.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
