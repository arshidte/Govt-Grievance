import type { Role } from '@pg/types';

export const roleLabelKey = (r: Role) => `role.${r.toLowerCase()}`;

export type Priority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
export const priorityLabelKey = (p: Priority) => `priority.${p.toLowerCase()}`;

const STATUS_KEY: Record<string, string> = {
  SUBMITTED: 'status.submitted',
  ACKNOWLEDGED: 'status.acknowledged',
  UNDER_REVIEW: 'status.underReview',
  ASSIGNED: 'status.assigned',
  IN_PROGRESS: 'status.inProgress',
  WAITING_FOR_INFORMATION: 'status.waitingForInformation',
  ESCALATED: 'status.escalated',
  RESOLVED: 'status.resolved',
  CLOSED: 'status.closed',
  REOPENED: 'status.reopened',
};
export const statusLabelKey = (s: string) => STATUS_KEY[s] ?? 'status.submitted';
