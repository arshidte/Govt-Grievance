import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { GET, PATCH } from './route';

/**
 * Unit-tests the GENERAL `/api/v1/*` BFF catch-all (ruling R17, T24) — the
 * sibling of the auth-only catch-all tested in
 * `../auth/[...action]/route.test.ts`. Both routes share the same
 * `proxyToApi` relay helper (`src/lib/bff-proxy.ts`), so this suite focuses
 * on what's specific to THIS route: that arbitrary `/users/*` and
 * `/categories` paths reach the correct upstream URL, and that the shared
 * relay properties (Cookie forwarding, Set-Cookie fan-out, faithful
 * status/body passthrough) hold here too, mirroring the auth suite's
 * assertions as evidence this route is not a weaker copy.
 */
describe('BFF general proxy route handler (/api/v1/*)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('proxies PATCH /api/v1/users/me to the upstream users/me endpoint, forwarding the Cookie header and body', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ id: 'u1', fullName: 'Jane Citizen' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const payload = JSON.stringify({ fullName: 'Jane Citizen', preferredLanguage: 'en' });
    const request = new NextRequest('http://localhost:3000/api/v1/users/me', {
      method: 'PATCH',
      body: payload,
      headers: { 'content-type': 'application/json', cookie: 'pg_session=abc123' },
    });

    const response = await PATCH(request, { params: Promise.resolve({ path: ['users', 'me'] }) });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [calledUrl, calledInit] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(calledUrl).toBe(`${process.env.API_INTERNAL_URL}/api/v1/users/me`);
    expect(calledInit.method).toBe('PATCH');
    expect(calledInit.body).toBe(payload);
    const forwardedHeaders = calledInit.headers as Headers;
    expect(forwardedHeaders.get('cookie')).toBe('pg_session=abc123');

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ id: 'u1', fullName: 'Jane Citizen' });
  });

  it('proxies GET /api/v1/categories (public — no cookie required) to the upstream categories endpoint', async () => {
    const fetchMock = vi.fn(
      async () => new Response(JSON.stringify([{ id: 'c1', slug: 'roads' }]), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const request = new NextRequest('http://localhost:3000/api/v1/categories', { method: 'GET' });
    const response = await GET(request, { params: Promise.resolve({ path: ['categories'] }) });

    const [calledUrl] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(calledUrl).toBe(`${process.env.API_INTERNAL_URL}/api/v1/categories`);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual([{ id: 'c1', slug: 'roads' }]);
  });

  it('relays multiple upstream Set-Cookie headers as separate, intact cookies (not comma-folded)', async () => {
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

  it('returns 502 (not a thrown error) when the upstream is unreachable, without leaking the internal URL', async () => {
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
  });
});
