import { describe, expect, it } from 'vitest';

import { loadEnv } from './env';

describe('loadEnv', () => {
  it('throws when DATABASE_URL is missing', () => {
    expect(() => loadEnv({})).toThrow();
  });

  it('parses required keys and applies defaults for optional ones', () => {
    const result = loadEnv({
      DATABASE_URL: 'postgresql://postgres:postgres@localhost:5433/panchayat?schema=public',
    });

    expect(result.DATABASE_URL).toBe(
      'postgresql://postgres:postgres@localhost:5433/panchayat?schema=public',
    );
    expect(result.API_PORT).toBe(4000);
    expect(result.CORS_ORIGIN_CITIZEN).toBe('http://localhost:3000');
    expect(result.CORS_ORIGIN_ADMIN).toBe('http://localhost:3001');
  });

  it('coerces API_PORT from a string env var', () => {
    const result = loadEnv({
      DATABASE_URL: 'postgresql://postgres:postgres@localhost:5433/panchayat?schema=public',
      API_PORT: '5000',
    });

    expect(result.API_PORT).toBe(5000);
  });

  const DB = 'postgresql://postgres:postgres@localhost:5433/panchayat?schema=public';

  it('fails closed: rejects SMS_PROVIDER=mock in production', () => {
    expect(() => loadEnv({ DATABASE_URL: DB, NODE_ENV: 'production', SMS_PROVIDER: 'mock' })).toThrow(
      /SMS_PROVIDER must not be/,
    );
  });

  it('fails closed: rejects the default (mock) provider in production when SMS_PROVIDER is unset', () => {
    expect(() => loadEnv({ DATABASE_URL: DB, NODE_ENV: 'production' })).toThrow(
      /SMS_PROVIDER must not be/,
    );
  });

  it('allows a real SMS provider in production', () => {
    const result = loadEnv({ DATABASE_URL: DB, NODE_ENV: 'production', SMS_PROVIDER: 'twilio' });
    expect(result.SMS_PROVIDER).toBe('twilio');
  });

  it('still allows the mock provider in development', () => {
    const result = loadEnv({ DATABASE_URL: DB, NODE_ENV: 'development', SMS_PROVIDER: 'mock' });
    expect(result.SMS_PROVIDER).toBe('mock');
  });

  describe('AUTH_THROTTLE_LIMIT', () => {
    it('defaults to 5 when omitted', () => {
      expect(loadEnv({ DATABASE_URL: DB }).AUTH_THROTTLE_LIMIT).toBe(5);
    });

    it('accepts a positive-integer override outside production (coerced from string)', () => {
      const result = loadEnv({ DATABASE_URL: DB, NODE_ENV: 'development', AUTH_THROTTLE_LIMIT: '1000' });
      expect(result.AUTH_THROTTLE_LIMIT).toBe(1000);
    });

    it.each(['0', '-1', '1.5', 'abc', ''])('rejects invalid value %p', (value) => {
      expect(() => loadEnv({ DATABASE_URL: DB, AUTH_THROTTLE_LIMIT: value })).toThrow();
    });

    it('fails closed: rejects a non-default override in production', () => {
      // SMS_PROVIDER set to a real value so this isolates the throttle guard
      // (production independently rejects the default mock provider).
      expect(() =>
        loadEnv({ DATABASE_URL: DB, NODE_ENV: 'production', SMS_PROVIDER: 'twilio', AUTH_THROTTLE_LIMIT: '1000' }),
      ).toThrow(/AUTH_THROTTLE_LIMIT must not be overridden/);
    });

    it('allows the default (5) in production whether omitted or set explicitly', () => {
      expect(
        loadEnv({ DATABASE_URL: DB, NODE_ENV: 'production', SMS_PROVIDER: 'twilio' }).AUTH_THROTTLE_LIMIT,
      ).toBe(5);
      expect(
        loadEnv({
          DATABASE_URL: DB,
          NODE_ENV: 'production',
          SMS_PROVIDER: 'twilio',
          AUTH_THROTTLE_LIMIT: '5',
        }).AUTH_THROTTLE_LIMIT,
      ).toBe(5);
    });
  });
});
