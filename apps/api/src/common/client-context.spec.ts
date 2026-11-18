import type { Request } from 'express';
import { describe, expect, it } from 'vitest';

import {
  BFF_AUTH_HEADER,
  CLIENT_IP_HEADER,
  CLIENT_UA_HEADER,
  resolveClientContext,
} from './client-context';

const SECRET = 'a'.repeat(48);

/** Minimal Express-like request: socket-derived `ip` + case-insensitive `get`. */
function fakeRequest(headers: Record<string, string>, ip = '::1'): Request {
  const lower = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
  return { ip, get: (name: string) => lower[name.toLowerCase()] } as unknown as Request;
}

describe('resolveClientContext', () => {
  it('uses the BFF-asserted client ip + user-agent when the shared secret matches', () => {
    const req = fakeRequest({
      [BFF_AUTH_HEADER]: SECRET,
      [CLIENT_IP_HEADER]: '203.0.113.7',
      [CLIENT_UA_HEADER]: 'Mozilla/5.0 (citizen phone)',
      'user-agent': 'node',
    });

    expect(resolveClientContext(req, SECRET)).toEqual({
      ip: '203.0.113.7',
      userAgent: 'Mozilla/5.0 (citizen phone)',
    });
  });

  it('accepts an IPv6 client ip', () => {
    const req = fakeRequest({ [BFF_AUTH_HEADER]: SECRET, [CLIENT_IP_HEADER]: '2001:db8::42' });
    expect(resolveClientContext(req, SECRET).ip).toBe('2001:db8::42');
  });

  it('ignores the asserted headers when the shared secret is wrong (direct callers cannot spoof)', () => {
    const req = fakeRequest(
      {
        [BFF_AUTH_HEADER]: 'b'.repeat(48),
        [CLIENT_IP_HEADER]: '198.51.100.1',
        [CLIENT_UA_HEADER]: 'spoofed',
        'user-agent': 'curl/8',
      },
      '::1',
    );
    expect(resolveClientContext(req, SECRET)).toEqual({ ip: '::1', userAgent: 'curl/8' });
  });

  it('ignores the asserted headers when no shared secret is configured', () => {
    const req = fakeRequest({ [BFF_AUTH_HEADER]: SECRET, [CLIENT_IP_HEADER]: '203.0.113.7' }, '::1');
    expect(resolveClientContext(req, undefined).ip).toBe('::1');
  });

  it('ignores the asserted headers when the auth header is missing', () => {
    const req = fakeRequest({ [CLIENT_IP_HEADER]: '203.0.113.7' }, '10.0.0.5');
    expect(resolveClientContext(req, SECRET).ip).toBe('10.0.0.5');
  });

  it('falls back to the socket ip when the asserted ip is not a valid IP literal', () => {
    const req = fakeRequest(
      { [BFF_AUTH_HEADER]: SECRET, [CLIENT_IP_HEADER]: '203.0.113.7, 10.0.0.1' },
      '::1',
    );
    expect(resolveClientContext(req, SECRET).ip).toBe('::1');
  });

  it('keeps the request user-agent when the BFF sends none, and caps a long user-agent at 512 chars', () => {
    const noUa = fakeRequest({ [BFF_AUTH_HEADER]: SECRET, [CLIENT_IP_HEADER]: '203.0.113.7', 'user-agent': 'node' });
    expect(resolveClientContext(noUa, SECRET).userAgent).toBe('node');

    const longUa = fakeRequest({
      [BFF_AUTH_HEADER]: SECRET,
      [CLIENT_IP_HEADER]: '203.0.113.7',
      [CLIENT_UA_HEADER]: 'x'.repeat(2000),
    });
    expect(resolveClientContext(longUa, SECRET).userAgent).toHaveLength(512);
  });
});
