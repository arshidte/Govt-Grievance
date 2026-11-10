import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';
import type { InitiateOnboardingInput, StaffOnboardingDTO } from '@pg/types';

import type { ApiClient } from './client';
import { queryKeys } from './query-keys';

/**
 * Admin staff-onboarding hooks (OTP-gated). The list query refetches on a
 * short interval so the admin sees status transitions (e.g. after a staff
 * member is verified) without a manual refresh. Mutations invalidate the
 * onboarding list so pending/verified/cancelled changes surface immediately.
 */

export function useOnboardings(
  client: ApiClient,
  status?: string,
): UseQueryResult<StaffOnboardingDTO[], Error> {
  return useQuery({
    queryKey: queryKeys.adminOnboardings(status),
    queryFn: () => client.listOnboardings(status),
  });
}

function invalidateOnboardings(qc: ReturnType<typeof useQueryClient>): void {
  // Base key prefix ['admin','onboarding'] cascades to every status variant.
  void qc.invalidateQueries({ queryKey: ['admin', 'onboarding'] });
}

export function useInitiateOnboarding(
  client: ApiClient,
): UseMutationResult<StaffOnboardingDTO, Error, InitiateOnboardingInput> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: InitiateOnboardingInput) => client.initiateOnboarding(input),
    onSuccess: () => invalidateOnboardings(qc),
  });
}

export function useResendOnboarding(
  client: ApiClient,
): UseMutationResult<StaffOnboardingDTO, Error, string> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => client.resendOnboarding(id),
    onSuccess: () => invalidateOnboardings(qc),
  });
}

export interface VerifyOnboardingVariables {
  id: string;
  code: string;
}
export function useVerifyOnboarding(
  client: ApiClient,
): UseMutationResult<StaffOnboardingDTO, Error, VerifyOnboardingVariables> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, code }: VerifyOnboardingVariables) => client.verifyOnboarding(id, code),
    onSuccess: () => {
      invalidateOnboardings(qc);
      // A verified onboarding creates assignments — refresh the staff lists too.
      void qc.invalidateQueries({ queryKey: queryKeys.adminRepresentatives });
      void qc.invalidateQueries({ queryKey: queryKeys.adminCoordinators });
    },
  });
}

export function useCancelOnboarding(
  client: ApiClient,
): UseMutationResult<StaffOnboardingDTO, Error, string> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => client.cancelOnboarding(id),
    onSuccess: () => invalidateOnboardings(qc),
  });
}
