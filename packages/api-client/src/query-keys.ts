/**
 * Shared TanStack Query cache keys. Centralised here so apps can invalidate
 * the same keys the hooks below use (e.g. after verify-otp or profile update).
 */
export const queryKeys = {
  me: ['me'] as const,
  categories: ['categories'] as const,
};
