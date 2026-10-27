import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { UseMutationResult, UseQueryResult } from '@tanstack/react-query';
import type {
  AttachmentDTO,
  CreateIssueInput,
  CreateOnBehalfInput,
  IssueDetailDTO,
  IssueSummaryDTO,
  TransitionInput,
} from '@pg/types';

import type { ApiClient, OnBehalfResult } from './client';
import { queryKeys } from './query-keys';

/** Variables for `useCreateIssue`: the issue payload plus an optional client-generated idempotency key. */
export interface CreateIssueVariables {
  input: CreateIssueInput;
  idempotencyKey?: string;
}

/** Variables for `useCreateOnBehalf`: the on-behalf payload plus an optional client-generated idempotency key. */
export interface CreateOnBehalfVariables {
  input: CreateOnBehalfInput;
  idempotencyKey?: string;
}

/** Variables for `useTransitionIssue`: the target issue id plus the transition payload. */
export interface TransitionIssueVariables {
  id: string;
  input: TransitionInput;
}

/** Variables for `useUploadAttachment`: the target issue id plus the file to upload. */
export interface UploadAttachmentVariables {
  issueId: string;
  file: Blob | File;
}

/**
 * Query: `GET /issues`, optionally filtered by `status`. Keyed on
 * `[...queryKeys.issues, params ?? {}]` so different filters cache
 * separately while still sharing the `['issues']` prefix for invalidation.
 */
export function useIssues(
  client: ApiClient,
  params?: { status?: string },
): UseQueryResult<IssueSummaryDTO[], Error> {
  return useQuery({
    queryKey: [...queryKeys.issues, params ?? {}],
    queryFn: () => client.listIssues(params),
  });
}

/** Query: `GET /issues/:id`. Disabled until `id` is truthy. */
export function useIssue(client: ApiClient, id: string): UseQueryResult<IssueDetailDTO, Error> {
  return useQuery({
    queryKey: queryKeys.issue(id),
    queryFn: () => client.getIssue(id),
    enabled: !!id,
  });
}

/**
 * Mutation: `POST /issues`. On success invalidates the issues list AND the
 * notification queries: a submission also writes the citizen's
 * `issue.submitted` notification server-side (see API §11), so the shell's
 * unread-count bell + notifications list must refetch to reflect it —
 * otherwise the bell stays stale at its mount-time value (0) until a hard
 * reload. (`queryKeys.notifications` is the prefix of `queryKeys.unreadCount`,
 * so both are invalidated explicitly to be unambiguous.)
 */
export function useCreateIssue(
  client: ApiClient,
): UseMutationResult<IssueDetailDTO, Error, CreateIssueVariables> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ input, idempotencyKey }: CreateIssueVariables) =>
      client.createIssue(input, idempotencyKey),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.issues });
      void queryClient.invalidateQueries({ queryKey: queryKeys.notifications });
      void queryClient.invalidateQueries({ queryKey: queryKeys.unreadCount });
    },
  });
}

/**
 * Mutation: `POST /issues/on-behalf`. On success invalidates the issues list
 * plus the notification queries — like a self-submission, an on-behalf
 * creation writes the resolved CITIZEN's `issue.submitted` notification, so a
 * client observing notifications must refetch. (The notification recipient is
 * the citizen, not the acting rep; the invalidation is harmless on the rep's
 * own client and correct for any shared cache.)
 */
export function useCreateOnBehalf(
  client: ApiClient,
): UseMutationResult<OnBehalfResult, Error, CreateOnBehalfVariables> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ input, idempotencyKey }: CreateOnBehalfVariables) =>
      client.createOnBehalf(input, idempotencyKey),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.issues });
      void queryClient.invalidateQueries({ queryKey: queryKeys.notifications });
      void queryClient.invalidateQueries({ queryKey: queryKeys.unreadCount });
    },
  });
}

/**
 * Mutation: `PATCH /issues/:id/status`. Invalidates BOTH the single-issue
 * detail cache and the issues list on success, since a transition changes
 * fields visible in both.
 */
export function useTransitionIssue(
  client: ApiClient,
): UseMutationResult<IssueDetailDTO, Error, TransitionIssueVariables> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: TransitionIssueVariables) => client.transitionIssue(id, input),
    onSuccess: (_data, { id }) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.issue(id) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.issues });
    },
  });
}

/**
 * Mutation: `POST /issues/:id/attachment` (multipart). Invalidates the
 * single-issue detail cache on success (the attachment is part of
 * `IssueDetailDTO`).
 */
export function useUploadAttachment(
  client: ApiClient,
): UseMutationResult<AttachmentDTO, Error, UploadAttachmentVariables> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ issueId, file }: UploadAttachmentVariables) =>
      client.uploadAttachment(issueId, file),
    onSuccess: (_data, { issueId }) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.issue(issueId) });
    },
  });
}
