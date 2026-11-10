/**
 * Shared TanStack Query cache keys. Centralised here so apps can invalidate
 * the same keys the hooks below use (e.g. after verify-otp or profile update).
 */
export const queryKeys = {
  me: ['me'] as const,
  categories: ['categories'] as const,
  /** All panchayats (org read for the submission wizard's panchayat select). */
  panchayats: ['panchayats'] as const,
  /** Wards belonging to a single panchayat; keyed on the panchayat id so each parent caches separately. */
  wards: (panchayatId: string) => ['wards', panchayatId] as const,
  /** List-level key; shares the `['issues']` prefix with `issue(id)` below so invalidating `issues` cascades to every per-id cache entry too. */
  issues: ['issues'] as const,
  /** Detail key for a single issue. Same `['issues']` prefix as `issues` above — see note there. */
  issue: (id: string) => ['issues', id] as const,
  notifications: ['notifications'] as const,
  /** Shares the `['notifications']` prefix with `notifications` above, so invalidating that base key cascades here too. */
  unreadCount: ['notifications', 'unread-count'] as const,

  // ---- Admin org-management (all share the `['admin']` prefix so a broad
  //      invalidation can refresh every org list at once). ----
  /** Admin panchayat list (includes inactive). */
  adminPanchayats: ['admin', 'panchayats'] as const,
  /** Admin single-panchayat detail. Shares the `['admin','panchayats']` prefix. */
  adminPanchayat: (id: string) => ['admin', 'panchayats', id] as const,
  /** Admin ward list for a panchayat (includes inactive); keyed per parent. */
  adminWards: (panchayatId: string) => ['admin', 'wards', panchayatId] as const,
  /** Admin representative list (users with active ward assignments). */
  adminRepresentatives: ['admin', 'representatives'] as const,
  /** Admin coordinator list (users with active panchayat assignments). */
  adminCoordinators: ['admin', 'coordinators'] as const,
  /** Admin staff-onboarding list (optionally filtered by status). */
  adminOnboardings: (status?: string) =>
    status ? (['admin', 'onboarding', status] as const) : (['admin', 'onboarding'] as const),
};
