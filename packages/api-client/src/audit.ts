import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import type { AuditLogListParams, AuditLogPageDTO } from '@pg/types';

import type { ApiClient } from './client';
import { queryKeys } from './query-keys';

/**
 * Admin audit-log viewer query (M4B). The `params` (all active filters +
 * cursor + limit) are part of the query key, so changing a filter or paging
 * fetches a fresh page. `placeholderData` keeps the previous page visible
 * while the next loads (smoother pagination); `staleTime: 0` + the admin-
 * prefixed key avoid serving one admin's data to another across sessions.
 */
export function useAuditLogs(
  client: ApiClient,
  params: AuditLogListParams,
): UseQueryResult<AuditLogPageDTO, Error> {
  return useQuery({
    queryKey: queryKeys.adminAuditLogs(params),
    queryFn: () => client.listAuditLogs(params),
  });
}
