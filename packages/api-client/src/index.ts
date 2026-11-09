export { createApiClient, ApiClientError } from './client';
export type { ApiClient, CreateApiClientOptions, OkResponse, OnBehalfResult } from './client';

export { queryKeys } from './query-keys';

export { useRequestOtp, useVerifyOtp, useLogout, useMe } from './auth';
export { useCategories } from './catalog';
export { usePanchayats, useWards } from './org';
export {
  useAdminPanchayats,
  useAdminPanchayat,
  useAdminWards,
  useRepresentatives,
  useCoordinators,
  useCreatePanchayat,
  useUpdatePanchayat,
  useSetPanchayatStatus,
  useCreateWard,
  useUpdateWard,
  useSetWardStatus,
  useSearchStaff,
  useAssignRepresentative,
  useRevokeRepresentative,
  useAssignCoordinator,
  useRevokeCoordinator,
} from './org-admin';
export type {
  UpdatePanchayatVariables,
  CreateWardVariables,
  UpdateWardVariables,
} from './org-admin';
export { useUpdateProfile } from './profile';
export {
  useIssues,
  useIssue,
  useCreateIssue,
  useCreateOnBehalf,
  useTransitionIssue,
  useUploadAttachment,
} from './issues';
export type {
  CreateIssueVariables,
  CreateOnBehalfVariables,
  TransitionIssueVariables,
  UploadAttachmentVariables,
} from './issues';
export { useNotifications, useUnreadCount, useMarkRead } from './notifications';
