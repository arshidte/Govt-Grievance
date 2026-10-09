import { NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `DevController` reads `env.NODE_ENV` from `../config/env` (a module-level
 * singleton parsed once at process start — see src/config/env.ts) to drive
 * its in-handler production guard. To prove that guard's 'production'
 * branch actually returns 404 from the REAL controller (not just the pure
 * `isDevEndpointEnabled` predicate, covered separately in
 * dev-guard.spec.ts), we mock that module per-test so we can flip
 * `NODE_ENV` without needing a second process/boot.
 */
const envState: { NODE_ENV: string } = { NODE_ENV: 'test' };

vi.mock('../config/env', () => ({
  get env() {
    return envState;
  },
}));

describe('DevController', () => {
  beforeEach(() => {
    envState.NODE_ENV = 'test';
  });

  it('returns the last code for a phone known to the mock SMS provider (non-production)', async () => {
    const { DevController } = await import('./dev.controller');
    const sms = {
      send: async () => undefined,
      lastCodeFor: (phone: string) => (phone === '+919000000001' ? '123456' : undefined),
    };
    const controller = new DevController(sms);

    expect(controller.lastOtp('+919000000001')).toEqual({ code: '123456' });
  });

  it('returns 404 when the phone has no recorded code', async () => {
    const { DevController } = await import('./dev.controller');
    const sms = { send: async () => undefined, lastCodeFor: () => undefined };
    const controller = new DevController(sms);

    expect(() => controller.lastOtp('+919999999999')).toThrow(NotFoundException);
  });

  it('returns 404 when the configured provider is not mock-capable (no lastCodeFor)', async () => {
    const { DevController } = await import('./dev.controller');
    const sms = { send: async () => undefined };
    const controller = new DevController(sms);

    expect(() => controller.lastOtp('+919000000001')).toThrow(NotFoundException);
  });

  it('returns 404 (never the code) when NODE_ENV is production, even for a phone with a real last code', async () => {
    envState.NODE_ENV = 'production';
    const { DevController } = await import('./dev.controller');
    const sms = { send: async () => undefined, lastCodeFor: () => '654321' };
    const controller = new DevController(sms);

    expect(() => controller.lastOtp('+919000000001')).toThrow(NotFoundException);
  });
});
