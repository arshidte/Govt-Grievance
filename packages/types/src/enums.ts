import { z } from 'zod';
export const RoleEnum = z.enum(['ADMIN', 'COORDINATOR', 'REPRESENTATIVE', 'CITIZEN']);
export type Role = z.infer<typeof RoleEnum>;
export const STAFF_ROLES: Role[] = ['ADMIN', 'COORDINATOR', 'REPRESENTATIVE'];
export const LanguageEnum = z.enum(['en', 'ml']);
export type Language = z.infer<typeof LanguageEnum>;
export const UserStatusEnum = z.enum(['active', 'disabled']);
export type UserStatus = z.infer<typeof UserStatusEnum>;

/**
 * Canonical grievance/issue lifecycle statuses. This is the single source
 * of truth for the status union — @pg/ui (StatusBadge) and @pg/i18n
 * (statusLabelKey) consume this type rather than re-declaring it.
 */
export const IssueStatusEnum = z.enum([
  'SUBMITTED',
  'ACKNOWLEDGED',
  'UNDER_REVIEW',
  'ASSIGNED',
  'IN_PROGRESS',
  'WAITING_FOR_INFORMATION',
  'ESCALATED',
  'RESOLVED',
  'CLOSED',
  'REOPENED',
]);
export type IssueStatus = z.infer<typeof IssueStatusEnum>;
/** Readonly tuple of all 10 statuses, for iteration (e.g. building UI pickers). */
export const ISSUE_STATUSES = IssueStatusEnum.options;
/** The only statuses/transitions M2 activates; the remaining 6 are defined but dormant until a later milestone. */
export const M2_ACTIVE_STATUSES = ['SUBMITTED', 'ACKNOWLEDGED', 'IN_PROGRESS', 'RESOLVED'] as const;

/** Canonical grievance priority levels — single source of truth, consumed by @pg/i18n (priorityLabelKey). */
export const PriorityEnum = z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']);
export type Priority = z.infer<typeof PriorityEnum>;
/** Readonly tuple of all 4 priorities, for iteration. */
export const PRIORITIES = PriorityEnum.options;
