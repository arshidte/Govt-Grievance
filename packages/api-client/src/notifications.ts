import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { UseMutationResult, UseQueryResult } from '@tanstack/react-query';
import type { NotificationDTO } from '@pg/types';

import type { ApiClient } from './client';
import { queryKeys } from './query-keys';

/** Query: `GET /notifications`. The caller's own notifications, newest-first. */
export function useNotifications(client: ApiClient): UseQueryResult<NotificationDTO[], Error> {
  return useQuery({
    queryKey: queryKeys.notifications,
    queryFn: () => client.listNotifications(),
  });
}

/** Query: `GET /notifications/unread-count`. */
export function useUnreadCount(client: ApiClient): UseQueryResult<{ count: number }, Error> {
  return useQuery({
    queryKey: queryKeys.unreadCount,
    queryFn: () => client.unreadCount(),
  });
}

/**
 * Mutation: `PATCH /notifications/:id/read`. Invalidates BOTH
 * `queryKeys.notifications` and `queryKeys.unreadCount` on success —
 * invalidating `notifications` alone would already cascade to
 * `unreadCount` via the shared `['notifications']` prefix, but both are
 * invalidated explicitly here to be safe/obvious.
 */
export function useMarkRead(
  client: ApiClient,
): UseMutationResult<NotificationDTO, Error, string> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => client.markNotificationRead(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.notifications });
      void queryClient.invalidateQueries({ queryKey: queryKeys.unreadCount });
    },
  });
}
