export { createApiClient, ApiClientError } from './client';
export type { ApiClient, CreateApiClientOptions, OkResponse, OnBehalfResult } from './client';

export { queryKeys } from './query-keys';

export { useRequestOtp, useVerifyOtp, useLogout, useMe } from './auth';
export { useCategories } from './catalog';
export { usePanchayats, useWards } from './org';
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
