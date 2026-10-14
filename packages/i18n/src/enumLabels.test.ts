import { describe, it, expect } from 'vitest';
import { roleLabelKey, priorityLabelKey } from './enumLabels';
import en from '../messages/en.json';

/** `en.json`'s shape is an arbitrarily-nested message catalog; these tests only need keyed lookup, not its full structure. */
type MessageCatalog = Record<string, Record<string, unknown>>;
const messages = en as MessageCatalog;

describe('enum label keys', () => {
  it('maps a role to an existing en message key', () => {
    const key = roleLabelKey('REPRESENTATIVE'); // e.g. "role.representative"
    const [ns, k] = key.split('.');
    expect(messages[ns!]?.[k!]).toBeTypeOf('string');
  });
  it('maps every priority to a present key', () => {
    for (const p of ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const) {
      const [ns, k] = priorityLabelKey(p).split('.');
      expect(messages[ns!]?.[k!]).toBeDefined();
    }
  });
});
