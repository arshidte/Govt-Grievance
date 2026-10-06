import { describe, it, expect } from 'vitest';
import { roleLabelKey, priorityLabelKey } from './enumLabels';
import en from '../messages/en.json';

describe('enum label keys', () => {
  it('maps a role to an existing en message key', () => {
    const key = roleLabelKey('REPRESENTATIVE'); // e.g. "role.representative"
    const [ns, k] = key.split('.');
    expect((en as any)[ns!][k!]).toBeTypeOf('string');
  });
  it('maps every priority to a present key', () => {
    for (const p of ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const) {
      const [ns, k] = priorityLabelKey(p).split('.');
      expect((en as any)[ns!][k!]).toBeDefined();
    }
  });
});
