import { useIssues } from '@pg/api-client';
import type { UseQueryResult } from '@tanstack/react-query';
import type { IssueSummaryDTO } from '@pg/types';

import { useApiClient } from '../auth/api-client';

/**
 * Staff-scoped issue list for the Task 24 triage screen (spec §12). Calls
 * `useIssues(client)` with NO params — exactly like the citizen dashboard's
 * `useIssues(client)` call — because the API scopes the returned list
 * SERVER-SIDE to whatever the signed-in staff member's role/ward/panchayat
 * is allowed to see; there is no client-side status filter here and no
 * risk of this screen ever requesting another scope's issues.
 *
 * A thin wrapper (rather than calling `useIssues` directly from
 * `StaffIssueList`) exists so `StaffIssueList`'s test can mock ONE staff-
 * specific hook instead of reaching into `@pg/api-client` + `useApiClient`
 * together, mirroring how `useAuth` wraps the auth hooks for `LoginForm`.
 */
export function useStaffIssues(): UseQueryResult<IssueSummaryDTO[], Error> {
  const client = useApiClient();
  return useIssues(client);
}
