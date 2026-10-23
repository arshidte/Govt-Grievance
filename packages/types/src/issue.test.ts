import { describe, it, expect } from 'vitest';
import { createIssueSchema, createOnBehalfSchema, transitionSchema } from './index';

describe('createIssueSchema', () => {
  const valid = {
    title: 'Streetlight broken',
    description: 'The streetlight near the junction has been out for a week.',
    categoryId: 'cat_1',
    panchayatId: 'pan_1',
    wardId: 'ward_1',
  };

  it('accepts a valid payload', () => {
    expect(createIssueSchema.safeParse(valid).success).toBe(true);
  });

  it('accepts a valid payload with optional subcategoryId', () => {
    expect(createIssueSchema.safeParse({ ...valid, subcategoryId: 'sub_1' }).success).toBe(true);
  });

  it('rejects empty title', () => {
    expect(
      createIssueSchema.safeParse({ title: '', description: 'd', categoryId: 'c', panchayatId: 'p', wardId: 'w' })
        .success,
    ).toBe(false);
  });

  it('rejects title over 200 chars', () => {
    expect(createIssueSchema.safeParse({ ...valid, title: 'a'.repeat(201) }).success).toBe(false);
  });

  it('rejects empty description', () => {
    expect(createIssueSchema.safeParse({ ...valid, description: '' }).success).toBe(false);
  });

  it('rejects description over 5000 chars', () => {
    expect(createIssueSchema.safeParse({ ...valid, description: 'a'.repeat(5001) }).success).toBe(false);
  });

  it('rejects missing categoryId', () => {
    const { categoryId, ...rest } = valid;
    expect(createIssueSchema.safeParse(rest).success).toBe(false);
  });

  it('rejects missing panchayatId', () => {
    const { panchayatId, ...rest } = valid;
    expect(createIssueSchema.safeParse(rest).success).toBe(false);
  });

  it('rejects missing wardId', () => {
    const { wardId, ...rest } = valid;
    expect(createIssueSchema.safeParse(rest).success).toBe(false);
  });
});

describe('createOnBehalfSchema', () => {
  const valid = {
    title: 'Streetlight broken',
    description: 'The streetlight near the junction has been out for a week.',
    categoryId: 'cat_1',
    wardId: 'ward_1',
    citizenPhone: '+919876543210',
  };

  it('accepts a valid payload with citizenPhone', () => {
    expect(createOnBehalfSchema.safeParse(valid).success).toBe(true);
  });

  it('requires a valid citizenPhone (reuses phoneSchema regex)', () => {
    expect(createOnBehalfSchema.safeParse({ ...valid, citizenPhone: '9876543210' }).success).toBe(false);
  });

  it('rejects missing citizenPhone', () => {
    const { citizenPhone, ...rest } = valid;
    expect(createOnBehalfSchema.safeParse(rest).success).toBe(false);
  });

  it('does NOT accept panchayatId (ward implies panchayat)', () => {
    const withPanchayat = { ...valid, panchayatId: 'pan_1' };
    const parsed = createOnBehalfSchema.safeParse(withPanchayat);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect((parsed.data as Record<string, unknown>).panchayatId).toBeUndefined();
    }
  });

  it('rejects empty title', () => {
    expect(createOnBehalfSchema.safeParse({ ...valid, title: '' }).success).toBe(false);
  });
});

describe('transitionSchema', () => {
  it('accepts a valid payload', () => {
    expect(transitionSchema.safeParse({ toStatus: 'ACKNOWLEDGED', note: 'Acknowledged by staff' }).success).toBe(
      true,
    );
  });

  it('requires a non-empty note', () => {
    expect(transitionSchema.safeParse({ toStatus: 'ACKNOWLEDGED', note: '' }).success).toBe(false);
  });

  it('rejects a note over 1000 chars', () => {
    expect(transitionSchema.safeParse({ toStatus: 'ACKNOWLEDGED', note: 'a'.repeat(1001) }).success).toBe(false);
  });

  it('rejects an invalid toStatus', () => {
    expect(transitionSchema.safeParse({ toStatus: 'NOT_A_STATUS', note: 'valid note' }).success).toBe(false);
  });

  it('rejects missing note', () => {
    expect(transitionSchema.safeParse({ toStatus: 'ACKNOWLEDGED' }).success).toBe(false);
  });
});
