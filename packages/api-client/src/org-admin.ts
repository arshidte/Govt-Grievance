import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';
import type {
  AssignCoordinatorInput,
  AssignRepresentativeInput,
  CoordinatorAssignmentDTO,
  CoordinatorDTO,
  CreatePanchayatInput,
  CreateWardInput,
  PanchayatDetailDTO,
  PanchayatDTO,
  RepresentativeAssignmentDTO,
  RepresentativeDTO,
  StaffUserDTO,
  UpdatePanchayatInput,
  UpdateWardInput,
  WardDTO,
} from '@pg/types';

import type { ApiClient } from './client';
import { queryKeys } from './query-keys';

/**
 * Admin organization-management hooks (panchayats, wards, representatives,
 * coordinators). All read `includeInactive` so the admin lists show
 * deactivated rows (the server honors that only for ADMIN). Mutations
 * invalidate the matching `['admin', ...]` query keys so lists refresh.
 *
 * These call Global-Admin-only endpoints; the server is the sole authority
 * (a non-admin session gets 403 regardless of what the UI renders).
 */

// ---- Queries -------------------------------------------------------------

export function useAdminPanchayats(client: ApiClient): UseQueryResult<PanchayatDTO[], Error> {
  return useQuery({
    queryKey: queryKeys.adminPanchayats,
    queryFn: () => client.getPanchayats(true),
  });
}

export function useAdminPanchayat(
  client: ApiClient,
  id: string,
): UseQueryResult<PanchayatDetailDTO, Error> {
  return useQuery({
    queryKey: queryKeys.adminPanchayat(id),
    queryFn: () => client.getPanchayat(id),
    enabled: !!id,
  });
}

export function useAdminWards(
  client: ApiClient,
  panchayatId: string,
): UseQueryResult<WardDTO[], Error> {
  return useQuery({
    queryKey: queryKeys.adminWards(panchayatId),
    queryFn: () => client.getWards(panchayatId, true),
    enabled: !!panchayatId,
  });
}

export function useRepresentatives(client: ApiClient): UseQueryResult<RepresentativeDTO[], Error> {
  return useQuery({
    queryKey: queryKeys.adminRepresentatives,
    queryFn: () => client.listRepresentatives(),
  });
}

export function useCoordinators(client: ApiClient): UseQueryResult<CoordinatorDTO[], Error> {
  return useQuery({
    queryKey: queryKeys.adminCoordinators,
    queryFn: () => client.listCoordinators(),
  });
}

// ---- Panchayat mutations -------------------------------------------------

export function useCreatePanchayat(
  client: ApiClient,
): UseMutationResult<PanchayatDetailDTO, Error, CreatePanchayatInput> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreatePanchayatInput) => client.createPanchayat(input),
    onSuccess: () => void qc.invalidateQueries({ queryKey: queryKeys.adminPanchayats }),
  });
}

export interface UpdatePanchayatVariables {
  id: string;
  input: UpdatePanchayatInput;
}
export function useUpdatePanchayat(
  client: ApiClient,
): UseMutationResult<PanchayatDetailDTO, Error, UpdatePanchayatVariables> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: UpdatePanchayatVariables) => client.updatePanchayat(id, input),
    onSuccess: () => void qc.invalidateQueries({ queryKey: queryKeys.adminPanchayats }),
  });
}

export function useSetPanchayatStatus(
  client: ApiClient,
): UseMutationResult<PanchayatDetailDTO, Error, { id: string; active: boolean }> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      active ? client.reactivatePanchayat(id) : client.deactivatePanchayat(id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: queryKeys.adminPanchayats }),
  });
}

// ---- Ward mutations ------------------------------------------------------

export interface CreateWardVariables {
  panchayatId: string;
  input: CreateWardInput;
}
export function useCreateWard(
  client: ApiClient,
): UseMutationResult<WardDTO, Error, CreateWardVariables> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ panchayatId, input }: CreateWardVariables) =>
      client.createWard(panchayatId, input),
    onSuccess: (ward) => void qc.invalidateQueries({ queryKey: queryKeys.adminWards(ward.panchayatId) }),
  });
}

export interface UpdateWardVariables {
  wardId: string;
  input: UpdateWardInput;
}
export function useUpdateWard(
  client: ApiClient,
): UseMutationResult<WardDTO, Error, UpdateWardVariables> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ wardId, input }: UpdateWardVariables) => client.updateWard(wardId, input),
    onSuccess: (ward) => void qc.invalidateQueries({ queryKey: queryKeys.adminWards(ward.panchayatId) }),
  });
}

export function useSetWardStatus(
  client: ApiClient,
): UseMutationResult<WardDTO, Error, { wardId: string; active: boolean }> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ wardId, active }: { wardId: string; active: boolean }) =>
      active ? client.reactivateWard(wardId) : client.deactivateWard(wardId),
    onSuccess: (ward) => void qc.invalidateQueries({ queryKey: queryKeys.adminWards(ward.panchayatId) }),
  });
}

// ---- Staff search + assignment mutations ---------------------------------

/** Imperative phone search (triggered on demand, hence a mutation not a query). */
export function useSearchStaff(
  client: ApiClient,
): UseMutationResult<StaffUserDTO | null, Error, string> {
  return useMutation({ mutationFn: (phone: string) => client.searchStaff(phone) });
}

export function useAssignRepresentative(
  client: ApiClient,
): UseMutationResult<RepresentativeAssignmentDTO, Error, AssignRepresentativeInput> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: AssignRepresentativeInput) => client.assignRepresentative(input),
    onSuccess: () => void qc.invalidateQueries({ queryKey: queryKeys.adminRepresentatives }),
  });
}

export function useRevokeRepresentative(
  client: ApiClient,
): UseMutationResult<{ revoked: true }, Error, string> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (assignmentId: string) => client.revokeRepresentative(assignmentId),
    onSuccess: () => void qc.invalidateQueries({ queryKey: queryKeys.adminRepresentatives }),
  });
}

export function useAssignCoordinator(
  client: ApiClient,
): UseMutationResult<CoordinatorAssignmentDTO, Error, AssignCoordinatorInput> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: AssignCoordinatorInput) => client.assignCoordinator(input),
    onSuccess: () => void qc.invalidateQueries({ queryKey: queryKeys.adminCoordinators }),
  });
}

export function useRevokeCoordinator(
  client: ApiClient,
): UseMutationResult<{ revoked: true }, Error, string> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (assignmentId: string) => client.revokeCoordinator(assignmentId),
    onSuccess: () => void qc.invalidateQueries({ queryKey: queryKeys.adminCoordinators }),
  });
}
