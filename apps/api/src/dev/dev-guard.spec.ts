import { describe, expect, it } from 'vitest';

import { isDevEndpointEnabled } from './dev-guard';

describe('isDevEndpointEnabled', () => {
  it('is false when NODE_ENV is production', () => {
    expect(isDevEndpointEnabled('production')).toBe(false);
  });

  it('is true for development', () => {
    expect(isDevEndpointEnabled('development')).toBe(true);
  });

  it('is true for test', () => {
    expect(isDevEndpointEnabled('test')).toBe(true);
  });
});
