import { afterEach, describe, expect, it, vi } from 'vitest';

// Server-component context: the incoming browser request as Next exposes it.
vi.mock('next/headers', () => ({
  cookies: async () => ({ toString: () => 'pg_session=abc123' }),
  headers: async () =>
    new Headers({ 'x-forwarded-for': '203.0.113.9, 10.0.0.1', 'user-agent': 'Mozilla/5.0 (citizen)' }),
}));

import { api } from './api';

function okMe() {
  return vi.fn(
    async () =>
      new Response(JSON.stringify({ id: 'u1', roles: ['CITIZEN'] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
  );
}

describe('server-side api client (citizen)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('sends the citizen ip + user-agent + BFF secret on server-component calls (e.g. the layout getMe)', async () => {
    vi.stubEnv('BFF_SHARED_SECRET', 'k'.repeat(48));
    const fetchMock = okMe();
    vi.stubGlobal('fetch', fetchMock);

    await api.getMe();

    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const sent = init.headers as Headers;
    expect(sent.get('cookie')).toBe('pg_session=abc123');
    expect(sent.get('x-pg-client-ip')).toBe('203.0.113.9');
    expect(sent.get('x-pg-client-ua')).toBe('Mozilla/5.0 (citizen)');
    expect(sent.get('x-pg-bff-auth')).toBe('k'.repeat(48));
  });

  it('sends no client-context headers when BFF_SHARED_SECRET is not configured', async () => {
    vi.stubEnv('BFF_SHARED_SECRET', '');
    const fetchMock = okMe();
    vi.stubGlobal('fetch', fetchMock);

    await api.getMe();

    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect((init.headers as Headers).get('x-pg-client-ip')).toBeNull();
    expect((init.headers as Headers).get('x-pg-bff-auth')).toBeNull();
  });
});
