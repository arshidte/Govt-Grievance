import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { UseMutationResult, UseQueryResult } from '@tanstack/react-query';
import type { MeResponse, VerifyTokenInput } from '@pg/types';

import type { ApiClient, OkResponse } from './client';
import { queryKeys } from './query-keys';

/**
 * Mutation: `POST /auth/verify-token` (MSG91 widget login). Exchanges the
 * widget's verified access token for a session cookie. Invalidates
 * `queryKeys.me` on success.
 */
export function useVerifyToken(client: ApiClient): UseMutationResult<MeResponse, Error, VerifyTokenInput> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: VerifyTokenInput) => client.verifyToken(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.me });
    },
  });
}

/** Mutation: `POST /auth/logout`. Invalidates `queryKeys.me` on success. */
export function useLogout(client: ApiClient): UseMutationResult<OkResponse, Error, void> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => client.logout(),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.me });
    },
  });
}

/** Query: `GET /auth/me`. Caller controls `enabled` (e.g. gate on auth state). */
export function useMe(client: ApiClient, options?: { enabled?: boolean }): UseQueryResult<MeResponse, Error> {
  return useQuery({
    queryKey: queryKeys.me,
    queryFn: () => client.getMe(),
    enabled: options?.enabled,
  });
}
