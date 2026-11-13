'use client';

import type { MeResponse, VerifyTokenInput } from '@pg/types';
import { useLogout, useVerifyToken } from '@pg/api-client';
import type { UseMutationResult } from '@tanstack/react-query';
import type { OkResponse } from '@pg/api-client';

import { useApiClient } from './api-client';

export interface UseAuth {
  verifyToken: UseMutationResult<MeResponse, Error, VerifyTokenInput>;
  logout: UseMutationResult<OkResponse, Error, void>;
}

/**
 * Citizen-app auth hook. Login is driven by the MSG91 widget (see
 * `./otpWidget.ts`): the widget sends + verifies the OTP and yields an access
 * token, which `verifyToken` exchanges for a session via
 * `POST /auth/verify-token`. `me` invalidation on verify/logout is handled
 * inside the underlying `@pg/api-client` hooks.
 */
export function useAuth(): UseAuth {
  const client = useApiClient();

  return {
    verifyToken: useVerifyToken(client),
    logout: useLogout(client),
  };
}
