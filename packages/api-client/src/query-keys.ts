/**
 * Shared TanStack Query cache keys. Centralised here so apps can invalidate
 * the same keys the hooks below use (e.g. after verify-otp or profile update).
 */
export const queryKeys = {
  me: ['me'] as const,
  categories: ['categories'] as const,
  /** List-level key; shares the `['issues']` prefix with `issue(id)` below so invalidating `issues` cascades to every per-id cache entry too. */
  issues: ['issues'] as const,
  /** Detail key for a single issue. Same `['issues']` prefix as `issues` above — see note there. */
  issue: (id: string) => ['issues', id] as const,
  notifications: ['notifications'] as const,
  /** Shares the `['notifications']` prefix with `notifications` above, so invalidating that base key cascades here too. */
  unreadCount: ['notifications', 'unread-count'] as const,
};
