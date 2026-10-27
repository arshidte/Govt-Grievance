'use client';

import {
  useNotifications as apiUseNotifications,
  useUnreadCount as apiUseUnreadCount,
  useMarkRead as apiUseMarkRead,
} from '@pg/api-client';
import type { UseMutationResult, UseQueryResult } from '@tanstack/react-query';
import type { NotificationDTO } from '@pg/types';

import { useApiClient } from '../auth/api-client';

/**
 * Thin app-bound wrappers around `@pg/api-client`'s notification hooks, so
 * `NotificationsList`/`NotificationBell` don't each repeat
 * `const client = useApiClient()` before delegating. Mirrors the pattern
 * `ProfileForm`/`IssuesDashboard` use inline, just centralized here per the
 * brief's naming of this file. Import aliases (`apiUse*`) avoid name
 * collisions with the re-exported local names below.
 */
export function useNotificationsQuery(): UseQueryResult<NotificationDTO[], Error> {
  return apiUseNotifications(useApiClient());
}

export function useUnreadCountQuery(): UseQueryResult<{ count: number }, Error> {
  return apiUseUnreadCount(useApiClient());
}

export function useMarkReadMutation(): UseMutationResult<NotificationDTO, Error, string> {
  return apiUseMarkRead(useApiClient());
}
