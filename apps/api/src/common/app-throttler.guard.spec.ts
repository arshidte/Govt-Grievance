import { Reflector } from '@nestjs/core';
import { ThrottlerStorageService } from '@nestjs/throttler';
import { describe, expect, it, vi } from 'vitest';

// `vi.mock` is hoisted above imports, so the secret must be hoisted with it.
const { SECRET } = vi.hoisted(() => ({ SECRET: 's'.repeat(48) }));

vi.mock('../config/env', () => ({ env: { BFF_SHARED_SECRET: SECRET } }));

import { AppThrottlerGuard } from './app-throttler.guard';
import { BFF_AUTH_HEADER, CLIENT_IP_HEADER } from './client-context';

/** Express-like request: socket `ip` (the platform proxy) + header reader. */
function fakeRequest(headers: Record<string, string>, ip = '::1') {
  return { ip, get: (name: string) => headers[name.toLowerCase()] };
}

/** Calls the guard's (protected) tracker — the value the rate-limit bucket is keyed on. */
async function trackerFor(req: ReturnType<typeof fakeRequest>): Promise<string> {
  const guard = new AppThrottlerGuard([], new ThrottlerStorageService(), new Reflector());
  return (guard as unknown as { getTracker(r: unknown): Promise<string> }).getTracker(req);
}

describe('AppThrottlerGuard tracker (rate-limit bucket key)', () => {
  it('keys on the BFF-asserted client ip, so two citizens behind the same proxy get separate buckets', async () => {
    const a = await trackerFor(fakeRequest({ [BFF_AUTH_HEADER]: SECRET, [CLIENT_IP_HEADER]: '203.0.113.7' }));
    const b = await trackerFor(fakeRequest({ [BFF_AUTH_HEADER]: SECRET, [CLIENT_IP_HEADER]: '198.51.100.9' }));

    expect(a).toBe('203.0.113.7');
    expect(b).toBe('198.51.100.9');
  });

  it('keys on the socket ip when the asserted ip is not authenticated by the shared secret', async () => {
    const spoofed = await trackerFor(
      fakeRequest({ [BFF_AUTH_HEADER]: 'wrong', [CLIENT_IP_HEADER]: '203.0.113.7' }, '::1'),
    );
    expect(spoofed).toBe('::1');
  });
});
