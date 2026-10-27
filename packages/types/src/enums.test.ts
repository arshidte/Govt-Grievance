import { describe, it, expect } from 'vitest';
import { IssueStatusEnum, PriorityEnum, M2_ACTIVE_STATUSES } from './enums';

describe('enums', () => {
  it('defines all 10 issue statuses and 4 priorities', () => {
    expect(IssueStatusEnum.options).toHaveLength(10);
    expect(IssueStatusEnum.options).toContain('WAITING_FOR_INFORMATION');
    expect(PriorityEnum.options).toEqual(['LOW', 'MEDIUM', 'HIGH', 'URGENT']);
    expect(M2_ACTIVE_STATUSES).toEqual(['SUBMITTED', 'ACKNOWLEDGED', 'IN_PROGRESS', 'RESOLVED']);
  });
});
