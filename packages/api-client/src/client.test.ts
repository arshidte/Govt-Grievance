import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { MeResponse } from '@pg/types';
import { createApiClient, ApiClientError } from './client';

const BASE_URL = 'https://api.example.test';

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('createApiClient', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('throws ApiClientError with code/messageKey/status on a well-formed error body', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ error: { code: 'invalid_otp', messageKey: 'auth.invalidOtp' } }, 401),
    );
    vi.stubGlobal('fetch', fetchMock);

    const client = createApiClient({ baseUrl: BASE_URL });

    await expect(client.verifyOtp({ phone: '+919876543210', code: '123456' })).rejects.toMatchObject(
      {
        code: 'invalid_otp',
        messageKey: 'auth.invalidOtp',
        status: 401,
      },
    );
    await expect(client.verifyOtp({ phone: '+919876543210', code: '123456' })).rejects.toBeInstanceOf(
      ApiClientError,
    );
  });

  it('returns parsed JSON typed as MeResponse on success', async () => {
    const me: MeResponse = {
      id: 'u1',
      phone: '+919876543210',
      fullName: 'Test User',
      email: null,
      preferredLanguage: 'en',
      status: 'active',
      roles: [],
    };
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(me, 200));
    vi.stubGlobal('fetch', fetchMock);

    const client = createApiClient({ baseUrl: BASE_URL });
    const result = await client.getMe();

    expect(result).toEqual(me);
  });

  it('sends credentials: include on every request', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ ok: true }, 202));
    vi.stubGlobal('fetch', fetchMock);

    const client = createApiClient({ baseUrl: BASE_URL });
    await client.requestOtp({ phone: '+919876543210' });

    expect(fetchMock).toHaveBeenCalledWith(
      `${BASE_URL}/api/v1/auth/request-otp`,
      expect.objectContaining({ credentials: 'include' }),
    );
  });

  it('prepends the /api/v1 prefix to the given baseUrl (origin only)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse([], 200));
    vi.stubGlobal('fetch', fetchMock);

    const client = createApiClient({ baseUrl: BASE_URL });
    await client.getCategories();

    expect(fetchMock).toHaveBeenCalledWith(
      `${BASE_URL}/api/v1/categories`,
      expect.anything(),
    );
  });

  it('sets the Cookie header from getCookieHeader when provided (server-side)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ ok: true }, 200));
    vi.stubGlobal('fetch', fetchMock);

    const getCookieHeader = vi.fn().mockResolvedValue('sid=abc123');
    const client = createApiClient({ baseUrl: BASE_URL, getCookieHeader });
    await client.getMe();

    expect(getCookieHeader).toHaveBeenCalled();
    const callArgs = fetchMock.mock.calls[0]!;
    const init = callArgs[1] as RequestInit;
    const headers = new Headers(init.headers);
    expect(headers.get('Cookie')).toBe('sid=abc123');
  });

  it('throws a sane ApiClientError when a non-OK body does not match the expected error shape', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response('<html>Internal Server Error</html>', {
        status: 500,
        headers: { 'content-type': 'text/html' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const client = createApiClient({ baseUrl: BASE_URL });

    await expect(client.getMe()).rejects.toBeInstanceOf(ApiClientError);
    await expect(client.getMe()).rejects.toMatchObject({
      status: 500,
      code: expect.any(String),
      messageKey: expect.any(String),
    });
  });

  it('throws a sane ApiClientError on a network error (fetch rejects)', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    vi.stubGlobal('fetch', fetchMock);

    const client = createApiClient({ baseUrl: BASE_URL });

    await expect(client.getMe()).rejects.toBeInstanceOf(ApiClientError);
    await expect(client.getMe()).rejects.toMatchObject({
      code: 'network_error',
      messageKey: expect.any(String),
    });
  });

  it('returns { ok: true } for logout and request-otp happy paths', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ ok: true }, 200));
    vi.stubGlobal('fetch', fetchMock);

    const client = createApiClient({ baseUrl: BASE_URL });
    const result = await client.logout();

    expect(result).toEqual({ ok: true });
  });

  it('PATCHes /users/me with the profile payload and returns MeResponse', async () => {
    const me: MeResponse = {
      id: 'u1',
      phone: '+919876543210',
      fullName: 'Updated Name',
      email: 'a@b.com',
      preferredLanguage: 'ml',
      status: 'active',
      roles: [],
    };
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(me, 200));
    vi.stubGlobal('fetch', fetchMock);

    const client = createApiClient({ baseUrl: BASE_URL });
    const result = await client.updateProfile({
      fullName: 'Updated Name',
      email: 'a@b.com',
      preferredLanguage: 'ml',
    });

    expect(result).toEqual(me);
    const callArgs = fetchMock.mock.calls[0]!;
    expect(callArgs[0]).toBe(`${BASE_URL}/api/v1/users/me`);
    expect((callArgs[1] as RequestInit).method).toBe('PATCH');
  });
});
