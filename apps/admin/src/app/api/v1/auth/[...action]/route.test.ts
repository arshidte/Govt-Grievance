import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { GET, POST } from './route';

/**
 * Unit-tests the BFF proxy's two acceptance-critical behaviors in
 * isolation (mocking `global.fetch` as the "upstream NestJS API" — no real
 * server needed). Mirrors the citizen app's
 * `apps/citizen/src/app/api/v1/auth/[...action]/route.test.ts` exactly
 * (same assertions), since this route is a byte-for-byte behavioral copy —
 * see `src/lib/bff-proxy.ts`'s header comment.
 *
 *  1. Set-Cookie relay: the upstream may emit MULTIPLE `Set-Cookie`
 *     headers on one response. We assert the proxy uses `getSetCookie()`
 *     and relays each cookie as its own separate `set-cookie` response
 *     header, unmangled.
 *  2. Faithful forwarding: method, JSON body, `content-type`, the
 *     incoming `Cookie` header, and the query string all reach the
 *     upstream call untouched; the upstream's status/body come back
 *     through unchanged.
 */
describe('BFF auth proxy route handler', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
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
        new Response(JSON.stringify({ id: 'u1' }), { status: 200, headers: upstreamHeaders }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const request = new NextRequest('http://localhost:3001/api/v1/auth/verify-otp', {
      method: 'POST',
      body: JSON.stringify({ phone: '+919876543210', code: '123456' }),
      headers: { 'content-type': 'application/json' },
    });

    const response = await POST(request, { params: Promise.resolve({ action: ['verify-otp'] }) });

    const relayed = response.headers.getSetCookie();
    expect(relayed).toHaveLength(2);
    expect(relayed).toContain(cookieA);
    expect(relayed).toContain(cookieB);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ id: 'u1' });
  });

  it('forwards method, body, content-type, Cookie header, and query string to the upstream URL', async () => {
    const fetchMock = vi.fn(
      async () => new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const request = new NextRequest(
      'http://localhost:3001/api/v1/auth/last-otp?phone=%2B919876543210',
      {
        method: 'GET',
        headers: { cookie: 'pg_session=abc123' },
      },
    );

    await GET(request, { params: Promise.resolve({ action: ['last-otp'] }) });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [calledUrl, calledInit] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(calledUrl).toBe(
      `${process.env.API_INTERNAL_URL}/api/v1/auth/last-otp?phone=%2B919876543210`,
    );
    expect(calledInit.method).toBe('GET');
    const forwardedHeaders = calledInit.headers as Headers;
    expect(forwardedHeaders.get('cookie')).toBe('pg_session=abc123');
  });

  it('forwards a POST body and content-type to the upstream call', async () => {
    const fetchMock = vi.fn(
      async () => new Response(JSON.stringify({ ok: true }), { status: 202 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const payload = JSON.stringify({ phone: '+919876543210' });
    const request = new NextRequest('http://localhost:3001/api/v1/auth/request-otp', {
      method: 'POST',
      body: payload,
      headers: { 'content-type': 'application/json' },
    });

    const response = await POST(request, {
      params: Promise.resolve({ action: ['request-otp'] }),
    });

    expect(response.status).toBe(202);
    const [, calledInit] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(calledInit.body).toBe(payload);
    const forwardedHeaders = calledInit.headers as Headers;
    expect(forwardedHeaders.get('content-type')).toBe('application/json');
  });

  it('returns a faithful 401 passthrough for an unauthenticated /me (no cookie forwarded)', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ error: { code: 'unauthenticated', messageKey: 'auth.required' } }), {
          status: 401,
        }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const request = new NextRequest('http://localhost:3001/api/v1/auth/me', { method: 'GET' });

    const response = await GET(request, { params: Promise.resolve({ action: ['me'] }) });

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: { code: 'unauthenticated', messageKey: 'auth.required' },
    });
  });

  it('returns 502 (not a thrown error) when the upstream is unreachable, without leaking the internal URL', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('ECONNREFUSED 127.0.0.1:4000');
      }),
    );

    const request = new NextRequest('http://localhost:3001/api/v1/auth/me', { method: 'GET' });
    const response = await GET(request, { params: Promise.resolve({ action: ['me'] }) });

    expect(response.status).toBe(502);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe('upstream_unreachable');
    expect(JSON.stringify(body)).not.toContain('4000');
    expect(JSON.stringify(body)).not.toContain(process.env.API_INTERNAL_URL);
  });
});
