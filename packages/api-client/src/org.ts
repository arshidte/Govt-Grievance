import { useQuery } from '@tanstack/react-query';
import type { UseQueryResult } from '@tanstack/react-query';
import type { PanchayatDTO, WardDTO } from '@pg/types';

import type { ApiClient } from './client';
import { queryKeys } from './query-keys';

/**
 * Query: `GET /panchayats` (authed). The submission wizard's panchayat
 * select reads from here; mirrors `useCategories` in `catalog.ts`.
 */
export function usePanchayats(client: ApiClient): UseQueryResult<PanchayatDTO[], Error> {
  return useQuery({
    queryKey: queryKeys.panchayats,
    queryFn: () => client.getPanchayats(),
  });
}

/**
 * Query: `GET /panchayats/:id/wards` (authed). DEPENDENT on a chosen
 * panchayat — `enabled: !!panchayatId` means it stays idle (never fetches)
 * until the wizard has a panchayat selected, which is what drives the
 * dependent panchayat→ward select behavior. Keyed on the panchayat id so
 * switching panchayats fetches/caches that parent's wards independently.
 */
export function useWards(
  client: ApiClient,
  panchayatId: string,
): UseQueryResult<WardDTO[], Error> {
  return useQuery({
    queryKey: queryKeys.wards(panchayatId),
    queryFn: () => client.getWards(panchayatId),
    enabled: !!panchayatId,
  });
}
