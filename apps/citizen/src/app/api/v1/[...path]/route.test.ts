import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { isAllowed } from '../../../../lib/bff-allowlist';

import { DELETE, GET, PATCH, POST } from './route';

/**
 * Unit-tests the GENERAL `/api/v1/*` BFF catch-all (ruling R17, T24),
 * HARDENED in Task 18 from a forward-everything relay into a STRICT
 * path+method ALLOWLIST with traversal / absolute-URL rejection and a
 * fixed internal origin. The sibling auth-only catch-all is tested in
 * `../auth/[...action]/route.test.ts`; both routes share the same
 * `proxyToApi` relay helper (`src/lib/bff-proxy.ts`) and now the same
 * `isPathSafe` guard (`src/lib/bff-allowlist.ts`).
 *
 * The suite implements the full BFF Security Test Matrix (rows 1–9) against
 * the citizen allowlist, plus citizen-specific negatives. Every negative
 * row asserts `fetch` was NEVER called (the request must be rejected BEFORE
 * any upstream contact).
 */
describe('BFF general proxy route handler (/api/v1/*) — hardened allowlist', () => {
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
    it('allows the exact citizen (method, path) pairs', () => {
      expect(isAllowed('POST', ['issues'])).toBe(true);
      expect(isAllowed('GET', ['issues'])).toBe(true);
      expect(isAllowed('GET', ['issues', 'abc-123'])).toBe(true);
      expect(isAllowed('POST', ['issues', 'abc-123', 'attachment'])).toBe(true);
      expect(isAllowed('GET', ['attachments', 'att-1'])).toBe(true);
      expect(isAllowed('GET', ['notifications'])).toBe(true);
      expect(isAllowed('GET', ['notifications', 'unread-count'])).toBe(true);
      expect(isAllowed('PATCH', ['notifications', 'n1', 'read'])).toBe(true);
      expect(isAllowed('GET', ['categories'])).toBe(true);
      expect(isAllowed('GET', ['panchayats'])).toBe(true);
      expect(isAllowed('GET', ['panchayats', 'p1', 'wards'])).toBe(true);
      expect(isAllowed('PATCH', ['users', 'me'])).toBe(true);
      expect(isAllowed('GET', ['users', 'me'])).toBe(true);
    });

    it('matches method case-insensitively but exactly (GET ≠ PATCH)', () => {
      expect(isAllowed('get', ['issues'])).toBe(true);
      expect(isAllowed('Post', ['issues'])).toBe(true);
      expect(isAllowed('PATCH', ['issues'])).toBe(false); // PATCH not allowed on `issues`
      expect(isAllowed('DELETE', ['issues', 'x'])).toBe(false);
    });

    it('rejects wrong segment counts and unlisted paths', () => {
      expect(isAllowed('GET', ['issues', 'x', 'extra'])).toBe(false);
      expect(isAllowed('PATCH', ['issues', 'x', 'status'])).toBe(false); // staff-only
      expect(isAllowed('POST', ['issues', 'on-behalf'])).toBe(false); // staff-only
      expect(isAllowed('GET', ['dev', 'last-otp'])).toBe(false);
      expect(isAllowed('GET', ['users', 'x'])).toBe(false);
      expect(isAllowed('GET', ['users'])).toBe(false);
    });

    it('rejects `:param` segments that are traversal tokens or empty', () => {
      expect(isAllowed('GET', ['issues', '..'])).toBe(false);
      expect(isAllowed('GET', ['issues', '.'])).toBe(false);
      expect(isAllowed('GET', ['issues', ''])).toBe(false);
    });

    it('allows notifications/panchayats prefix wildcard only with clean sub-segments', () => {
      expect(isAllowed('GET', ['notifications', 'a', 'b', 'c'])).toBe(true);
      expect(isAllowed('GET', ['panchayats', 'p1', '..'])).toBe(false);
    });
  });

  // ──────────────────────────────────────────────────────────────────────
  // Row 1 — allowlisted (method, path) forwards with body/query + Cookie.
  // ──────────────────────────────────────────────────────────────────────
  it('Row 1: forwards an allowlisted GET issues/:id to API_INTERNAL_URL with query + inbound Cookie intact', async () => {
    const fetchMock = okFetch({ id: 'abc-123' });
    vi.stubGlobal('fetch', fetchMock);

    const request = new NextRequest('http://localhost:3000/api/v1/issues/abc-123?foo=bar', {
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

  it('Row 1b: forwards an allowlisted POST issues with body + content-type', async () => {
    const fetchMock = okFetch({ id: 'new-issue' });
    vi.stubGlobal('fetch', fetchMock);

    const payload = JSON.stringify({ title: 'Pothole', categoryId: 'c1' });
    const request = new NextRequest('http://localhost:3000/api/v1/issues', {
      method: 'POST',
      body: payload,
      headers: { 'content-type': 'application/json', cookie: 'pg_session=abc123' },
    });
    const response = await POST(request, { params: Promise.resolve({ path: ['issues'] }) });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [calledUrl, calledInit] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(calledUrl).toBe(`${process.env.API_INTERNAL_URL}/api/v1/issues`);
    // The relay forwards raw bytes (binary-safe); compare decoded content.
    expect(await new Response(calledInit.body ?? null).text()).toBe(payload);
    expect((calledInit.headers as Headers).get('content-type')).toBe('application/json');
    expect(response.status).toBe(200);
  });

  // ──────────────────────────────────────────────────────────────────────
  // Row 2 — non-allowlisted path → 404, upstream never called.
  // ──────────────────────────────────────────────────────────────────────
  it('Row 2: non-allowlisted path (GET dev/last-otp) → 404, upstream never called', async () => {
    const fetchMock = okFetch();
    vi.stubGlobal('fetch', fetchMock);

    const request = new NextRequest('http://localhost:3000/api/v1/dev/last-otp', { method: 'GET' });
    const response = await GET(request, { params: Promise.resolve({ path: ['dev', 'last-otp'] }) });

    expect(response.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('Row 2b: non-allowlisted path (GET users/x) → 404, upstream never called', async () => {
    const fetchMock = okFetch();
    vi.stubGlobal('fetch', fetchMock);

    const request = new NextRequest('http://localhost:3000/api/v1/users/x', { method: 'GET' });
    const response = await GET(request, { params: Promise.resolve({ path: ['users', 'x'] }) });

    expect(response.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  // ──────────────────────────────────────────────────────────────────────
  // Row 3 — non-allowlisted method on an allowlisted path → 404.
  // ──────────────────────────────────────────────────────────────────────
  it('Row 3: non-allowlisted method (DELETE issues/x) → 404, upstream never called', async () => {
    const fetchMock = okFetch();
    vi.stubGlobal('fetch', fetchMock);

    const request = new NextRequest('http://localhost:3000/api/v1/issues/x', { method: 'DELETE' });
    const response = await DELETE(request, { params: Promise.resolve({ path: ['issues', 'x'] }) });

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
    const request = new NextRequest('http://localhost:3000/api/v1/issues/x', { method: 'GET' });
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
    const request = new NextRequest('http://localhost:3000/api/v1/issues/x', { method: 'GET' });
    const response = await GET(request, {
      params: Promise.resolve({ path: ['issues', '%2e%2e', 'secret'] }),
    });

    expect(response.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  // ──────────────────────────────────────────────────────────────────────
  // Row 5 — absolute-URL / host override rejected; origin is ONLY API_INTERNAL_URL.
  // ──────────────────────────────────────────────────────────────────────
  it('Row 5: host-override segment (//evil.test) → 404, upstream never called', async () => {
    const fetchMock = okFetch();
    vi.stubGlobal('fetch', fetchMock);

    const request = new NextRequest('http://localhost:3000/api/v1/issues/x', { method: 'GET' });
    const response = await GET(request, {
      params: Promise.resolve({ path: ['issues', '//evil.test', 'x'] }),
    });

    expect(response.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('Row 5b: absolute-URL segment (http://evil.test) → 404; if fetch runs, origin is only API_INTERNAL_URL', async () => {
    const fetchMock = okFetch();
    vi.stubGlobal('fetch', fetchMock);

    const request = new NextRequest('http://localhost:3000/api/v1/issues/x', { method: 'GET' });
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

    const request = new NextRequest('http://localhost:3000/api/v1/issues', {
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

    const request = new NextRequest('http://localhost:3000/api/v1/users/me', {
      method: 'PATCH',
      body: JSON.stringify({ fullName: 'Jane' }),
      headers: { 'content-type': 'application/json' },
    });
    const response = await PATCH(request, { params: Promise.resolve({ path: ['users', 'me'] }) });

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

    const request = new NextRequest('http://localhost:3000/api/v1/categories', { method: 'GET' });
    const response = await GET(request, { params: Promise.resolve({ path: ['categories'] }) });

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
    const fetchMock = okFetch({ id: 'u1' });
    vi.stubGlobal('fetch', fetchMock);

    const request = new NextRequest('http://localhost:3000/api/v1/users/me', {
      method: 'PATCH',
      body: JSON.stringify({ fullName: 'Jane Citizen' }),
      headers: { 'content-type': 'application/json', cookie: 'pg_session=abc123' },
    });
    await PATCH(request, { params: Promise.resolve({ path: ['users', 'me'] }) });

    const [, calledInit] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect((calledInit.headers as Headers).get('cookie')).toBe('pg_session=abc123');
  });

  // ──────────────────────────────────────────────────────────────────────
  // Row 10/11 — binary bodies survive the relay byte-for-byte (attachments).
  // A text round-trip (`request.text()` / `response.text()`) replaces every
  // invalid-UTF-8 byte with U+FFFD, corrupting JPEG/PNG uploads and
  // downloads — the API then rejects the upload's magic bytes.
  // ──────────────────────────────────────────────────────────────────────
  // JPEG SOI/APP0 marker + bytes that are NOT valid UTF-8 on their own.
  const BINARY = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x80, 0x81, 0xfe, 0xc3, 0x28]);

  async function bytesOf(body: BodyInit | null | undefined): Promise<Uint8Array> {
    return new Uint8Array(await new Response(body ?? null).arrayBuffer());
  }

  it('Row 10: relays a binary multipart upload body to upstream byte-for-byte', async () => {
    const fetchMock = okFetch({ id: 'att-1' });
    vi.stubGlobal('fetch', fetchMock);

    const contentType = 'multipart/form-data; boundary=pgtest';
    const request = new NextRequest('http://localhost:3000/api/v1/issues/abc-123/attachment', {
      method: 'POST',
      body: BINARY,
      headers: { 'content-type': contentType, cookie: 'pg_session=abc123' },
    });
    await POST(request, { params: Promise.resolve({ path: ['issues', 'abc-123', 'attachment'] }) });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, calledInit] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(await bytesOf(calledInit.body)).toEqual(BINARY);
    expect((calledInit.headers as Headers).get('content-type')).toBe(contentType);
  });

  it('Row 11: relays a binary download byte-for-byte with Content-Disposition and Cache-Control', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(BINARY, {
            status: 200,
            headers: {
              'content-type': 'image/jpeg',
              'content-disposition': 'inline',
              'cache-control': 'private, no-store',
            },
          }),
      ),
    );

    const request = new NextRequest('http://localhost:3000/api/v1/attachments/att-1', {
      method: 'GET',
      headers: { cookie: 'pg_session=abc123' },
    });
    const response = await GET(request, { params: Promise.resolve({ path: ['attachments', 'att-1'] }) });

    expect(response.status).toBe(200);
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(BINARY);
    expect(response.headers.get('content-type')).toBe('image/jpeg');
    expect(response.headers.get('content-disposition')).toBe('inline');
    expect(response.headers.get('cache-control')).toBe('private, no-store');
  });

  // ──────────────────────────────────────────────────────────────────────
  // Row 12/13 — end-user context. Behind the BFF the API's socket ip is the
  // platform proxy for everyone; the BFF asserts the real client (from the
  // Vercel-set X-Forwarded-For) + user-agent, authenticated by the shared
  // secret, so per-IP throttling and audit IPs are per citizen.
  // ──────────────────────────────────────────────────────────────────────
  it('Row 12: with BFF_SHARED_SECRET set, forwards the citizen ip + user-agent + secret to upstream', async () => {
    vi.stubEnv('BFF_SHARED_SECRET', 'k'.repeat(48));
    const fetchMock = okFetch();
    vi.stubGlobal('fetch', fetchMock);

    const request = new NextRequest('http://localhost:3000/api/v1/issues', {
      method: 'GET',
      headers: {
        cookie: 'pg_session=abc123',
        'x-forwarded-for': '203.0.113.7, 10.0.0.1',
        'user-agent': 'Mozilla/5.0 (citizen)',
      },
    });
    await GET(request, { params: Promise.resolve({ path: ['issues'] }) });

    const [, calledInit] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const forwarded = calledInit.headers as Headers;
    expect(forwarded.get('x-pg-client-ip')).toBe('203.0.113.7');
    expect(forwarded.get('x-pg-client-ua')).toBe('Mozilla/5.0 (citizen)');
    expect(forwarded.get('x-pg-bff-auth')).toBe('k'.repeat(48));
    vi.unstubAllEnvs();
  });

  it('Row 13: without BFF_SHARED_SECRET, forwards no client context — and never relays browser-sent x-pg-* headers', async () => {
    vi.stubEnv('BFF_SHARED_SECRET', '');
    const fetchMock = okFetch();
    vi.stubGlobal('fetch', fetchMock);

    const request = new NextRequest('http://localhost:3000/api/v1/issues', {
      method: 'GET',
      headers: {
        'x-forwarded-for': '203.0.113.7',
        'x-pg-client-ip': '198.51.100.66',
        'x-pg-bff-auth': 'guessed',
      },
    });
    await GET(request, { params: Promise.resolve({ path: ['issues'] }) });

    const [, calledInit] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const forwarded = calledInit.headers as Headers;
    expect(forwarded.get('x-pg-client-ip')).toBeNull();
    expect(forwarded.get('x-pg-bff-auth')).toBeNull();
    vi.unstubAllEnvs();
  });

  // ──────────────────────────────────────────────────────────────────────
  // Citizen-specific negatives (explicit): staff-only + dev routes 404.
  // ──────────────────────────────────────────────────────────────────────
  it('negative: PATCH /api/v1/issues/x/status (staff-only) → 404, upstream never called', async () => {
    const fetchMock = okFetch();
    vi.stubGlobal('fetch', fetchMock);

    const request = new NextRequest('http://localhost:3000/api/v1/issues/x/status', {
      method: 'PATCH',
      body: JSON.stringify({ status: 'TRIAGED' }),
      headers: { 'content-type': 'application/json' },
    });
    const response = await PATCH(request, {
      params: Promise.resolve({ path: ['issues', 'x', 'status'] }),
    });

    expect(response.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('negative: POST /api/v1/issues/on-behalf (staff-only) → 404, upstream never called', async () => {
    const fetchMock = okFetch();
    vi.stubGlobal('fetch', fetchMock);

    const request = new NextRequest('http://localhost:3000/api/v1/issues/on-behalf', {
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

    const request = new NextRequest('http://localhost:3000/api/v1/dev/last-otp', { method: 'GET' });
    const response = await GET(request, { params: Promise.resolve({ path: ['dev', 'last-otp'] }) });

    expect(response.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
