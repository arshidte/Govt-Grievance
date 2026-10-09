import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { UseMutationResult } from '@tanstack/react-query';
import type { MeResponse, UpdateProfileInput } from '@pg/types';

import type { ApiClient } from './client';
import { queryKeys } from './query-keys';

/** Mutation: `PATCH /users/me`. Invalidates `queryKeys.me` on success. */
export function useUpdateProfile(
  client: ApiClient,
): UseMutationResult<MeResponse, Error, UpdateProfileInput> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateProfileInput) => client.updateProfile(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.me });
    },
  });
}
