import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { UseMutationResult, UseQueryResult } from '@tanstack/react-query';
import type { MeResponse, RequestOtpInput, VerifyOtpInput } from '@pg/types';

import type { ApiClient, OkResponse } from './client';
import { queryKeys } from './query-keys';

/** Mutation: `POST /auth/request-otp`. Thin wrapper over `client.requestOtp`. */
export function useRequestOtp(client: ApiClient): UseMutationResult<OkResponse, Error, RequestOtpInput> {
  return useMutation({
    mutationFn: (input: RequestOtpInput) => client.requestOtp(input),
  });
}

/** Mutation: `POST /auth/verify-otp`. Invalidates `queryKeys.me` on success. */
export function useVerifyOtp(client: ApiClient): UseMutationResult<MeResponse, Error, VerifyOtpInput> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: VerifyOtpInput) => client.verifyOtp(input),
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
