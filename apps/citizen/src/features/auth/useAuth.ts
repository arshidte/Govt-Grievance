'use client';

import type { MeResponse, RequestOtpInput, VerifyOtpInput } from '@pg/types';
import { useLogout, useRequestOtp, useVerifyOtp } from '@pg/api-client';
import type { UseMutationResult } from '@tanstack/react-query';
import type { OkResponse } from '@pg/api-client';

import { useApiClient } from './api-client';

export interface UseAuth {
  requestOtp: UseMutationResult<OkResponse, Error, RequestOtpInput>;
  verifyOtp: UseMutationResult<MeResponse, Error, VerifyOtpInput>;
  logout: UseMutationResult<OkResponse, Error, void>;
}

/**
 * Citizen-app auth hook: wraps `@pg/api-client`'s explicit-client hooks
 * (`useRequestOtp`/`useVerifyOtp`/`useLogout`) with the shared browser
 * client (see `./api-client.ts`), so feature components don't each have to
 * thread the client through themselves. Query invalidation (`queryKeys.me`
 * on verify/logout) is already handled inside those underlying hooks —
 * this wrapper adds no extra invalidation logic, just the client wiring.
 */
export function useAuth(): UseAuth {
  const client = useApiClient();

  return {
    requestOtp: useRequestOtp(client),
    verifyOtp: useVerifyOtp(client),
    logout: useLogout(client),
  };
}
