import { afterEach, describe, expect, it, vi } from 'vitest';

// Isolate the HTTP verifier from the real env parse: give it a fixed authkey +
// URL so we can exercise the success/reject/transport paths deterministically.
vi.mock('../../config/env', () => ({
  env: {
    MSG91_AUTHKEY: 'test-authkey',
    MSG91_VERIFY_URL: 'https://msg91.test/verify',
    MSG91_PROVIDER: 'live',
  },
}));

import { ApiError } from '../../common/api-error';

import { MockMsg91Verifier } from './mock-msg91.verifier';
import { Msg91HttpVerifier } from './msg91-http.verifier';
import { normalizeVerifiedPhone } from './phone';

describe('normalizeVerifiedPhone', () => {
  it('prefixes a bare country-coded mobile with +', () => {
    expect(normalizeVerifiedPhone('919876543210')).toBe('+919876543210');
  });
  it('accepts an already-+-prefixed mobile', () => {
    expect(normalizeVerifiedPhone('+919876543210')).toBe('+919876543210');
  });
  it('rejects an email identifier', () => {
    expect(() => normalizeVerifiedPhone('user@example.com')).toThrow(ApiError);
  });
  it('rejects a number without the country code', () => {
    expect(() => normalizeVerifiedPhone('9876543210')).toThrow(ApiError);
  });
});

describe('MockMsg91Verifier', () => {
  const verifier = new MockMsg91Verifier();
  it('trusts a test-otp:<phone> token (bare or +-prefixed)', async () => {
    expect(await verifier.verifyAccessToken('test-otp:919876543210')).toEqual({ phone: '+919876543210' });
    expect(await verifier.verifyAccessToken('test-otp:+919876543210')).toEqual({ phone: '+919876543210' });
  });
  it('rejects a non-mock (real-looking) token', async () => {
    await expect(verifier.verifyAccessToken('eyJ.real.jwt')).rejects.toBeInstanceOf(ApiError);
  });
});

describe('Msg91HttpVerifier', () => {
  const verifier = new Msg91HttpVerifier();
  afterEach(() => vi.restoreAllMocks());

  it('returns the verified phone on a MSG91 success response', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ json: async () => ({ type: 'success', message: '919876543210' }) });
    vi.stubGlobal('fetch', fetchMock);

    expect(await verifier.verifyAccessToken('jwt')).toEqual({ phone: '+919876543210' });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://msg91.test/verify');
    expect(JSON.parse((init as { body: string }).body)).toEqual({ authkey: 'test-authkey', 'access-token': 'jwt' });
  });

  it('rejects (401 invalid_token) on a MSG91 error response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ json: async () => ({ type: 'error', message: 'bad token' }) }));
    await expect(verifier.verifyAccessToken('jwt')).rejects.toMatchObject({ code: 'invalid_token', status: 401 });
  });

  it('is non-committal (503) when MSG91 is unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));
    await expect(verifier.verifyAccessToken('jwt')).rejects.toMatchObject({ code: 'otp_provider_unavailable', status: 503 });
  });
});
