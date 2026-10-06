import { describe, it, expect } from 'vitest';
import en from '../messages/en.json';
import ml from '../messages/ml.json';

/**
 * Recursively collects the "key path" of every leaf (non-object) value in a
 * nested message catalog, e.g. { status: { submitted: 'x' } } -> ['status.submitted'].
 * Comparing these sorted path lists is a stronger guarantee than comparing
 * Object.keys at the top level only: it catches missing/extra keys at any
 * depth of nesting.
 */
function collectKeyPaths(obj: unknown, prefix = ''): string[] {
  if (obj === null || typeof obj !== 'object') {
    return [prefix];
  }
  const entries = Object.entries(obj as Record<string, unknown>);
  return entries.flatMap(([key, value]) =>
    collectKeyPaths(value, prefix ? `${prefix}.${key}` : key)
  );
}

describe('en/ml message catalog key parity', () => {
  it('has an identical set of namespace keys at the top level', () => {
    expect(Object.keys(ml).sort()).toEqual(Object.keys(en).sort());
  });

  it('has an identical set of fully-qualified leaf keys at every nesting level', () => {
    const enKeys = collectKeyPaths(en).sort();
    const mlKeys = collectKeyPaths(ml).sort();
    expect(mlKeys).toEqual(enKeys);
  });

  it('has no empty string values in either catalog', () => {
    const isNonEmptyString = (v: unknown): boolean =>
      typeof v !== 'string' || v.trim().length > 0;

    function checkAllLeaves(obj: unknown): boolean {
      if (obj === null || typeof obj !== 'object') return isNonEmptyString(obj);
      return Object.values(obj as Record<string, unknown>).every(checkAllLeaves);
    }

    expect(checkAllLeaves(en)).toBe(true);
    expect(checkAllLeaves(ml)).toBe(true);
  });
});
