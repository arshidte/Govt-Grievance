import { PrismaClient, IssueStatus, Priority } from '@prisma/client';
import { describe, expect, it } from 'vitest';

describe('M2 Prisma schema — enums + Issue-domain fields', () => {
  it('exposes M2 enums and Issue.status default typing', () => {
    expect(IssueStatus.SUBMITTED).toBe('SUBMITTED');
    expect(Priority.MEDIUM).toBe('MEDIUM');
    // type-level: Issue create requires title/description
    const _c: Parameters<PrismaClient['issue']['create']>[0]['data'] = {
      title: 't',
      description: 'd',
      referenceNo: 'x',
      citizen: { connect: { id: 'u' } },
      createdBy: { connect: { id: 'u' } },
      panchayat: { connect: { id: 'p' } },
      ward: { connect: { id: 'w' } },
      category: { connect: { id: 'c' } },
    };
    expect(_c.title).toBe('t');
  });
});
