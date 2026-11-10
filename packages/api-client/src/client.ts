import type {
  AssignCoordinatorInput,
  AssignRepresentativeInput,
  AttachmentDTO,
  AuditLogListParams,
  AuditLogPageDTO,
  CategoryDTO,
  CoordinatorAssignmentDTO,
  CoordinatorDTO,
  CreateIssueInput,
  CreateOnBehalfInput,
  CreatePanchayatInput,
  CreateWardInput,
  InitiateOnboardingInput,
  IssueDetailDTO,
  IssueSummaryDTO,
  MeResponse,
  NotificationDTO,
  PanchayatDetailDTO,
  PanchayatDTO,
  RepresentativeAssignmentDTO,
  RepresentativeDTO,
  RequestOtpInput,
  StaffOnboardingDTO,
  StaffUserDTO,
  TransitionInput,
  UpdatePanchayatInput,
  UpdateProfileInput,
  UpdateWardInput,
  VerifyOtpInput,
  WardDTO,
} from '@pg/types';

/** All backend routes are served under this version prefix (see apps/api main.ts `setGlobalPrefix`). */
const API_PREFIX = '/api/v1';

/** Shape of the uniform backend error body: `{ error: { code, messageKey } }`. */
interface ApiErrorBody {
  error: { code: string; messageKey: string };
}

function isApiErrorBody(value: unknown): value is ApiErrorBody {
  if (typeof value !== 'object' || value === null) return false;
  const err = (value as { error?: unknown }).error;
  if (typeof err !== 'object' || err === null) return false;
  const { code, messageKey } = err as { code?: unknown; messageKey?: unknown };
  return typeof code === 'string' && typeof messageKey === 'string';
}

/**
 * Typed error thrown by the API client for any non-OK response, and for
 * network-level failures (fetch rejecting). Always carries `code`,
 * `messageKey`, and the HTTP `status` (network errors use `status: 0`),
 * falling back to generic values when the response body isn't the
 * expected `{ error: { code, messageKey } }` shape.
 */
export class ApiClientError extends Error {
  constructor(
    public readonly code: string,
    public readonly messageKey: string,
    public readonly status: number,
  ) {
    super(`${code}: ${messageKey}`);
    this.name = 'ApiClientError';
  }
}

/** A plain `{ ok: true }` acknowledgement returned by request-otp/logout. */
export interface OkResponse {
  ok: true;
}

/**
 * Minimal 4-key shape returned by `POST /issues/on-behalf`. No equivalent
 * DTO exists in `@pg/types` (the API's own `OnBehalfResult` — see
 * `apps/api/src/issues/on-behalf.service.ts` — lives server-side only), so
 * this mirrors it locally rather than reaching into the API package.
 */
export interface OnBehalfResult {
  referenceNo: string;
  id: string;
  status: string;
  createdAt: string;
}

export interface CreateApiClientOptions {
  /** Origin (and optional path prefix) of the API, WITHOUT `/api/v1` — e.g. `https://api.example.com`. */
  baseUrl: string;
  /**
   * Optional hook for SERVER-side callers (BFF/Next.js route handlers) that need to
   * forward the incoming request's cookies to the API, since there is no browser
   * cookie jar in that context. Browser callers can omit this — the browser sends
   * cookies automatically via `credentials: 'include'`. May be sync or async.
   */
  getCookieHeader?: () => string | undefined | Promise<string | undefined>;
}

export interface ApiClient {
  requestOtp(input: RequestOtpInput): Promise<OkResponse>;
  verifyOtp(input: VerifyOtpInput): Promise<MeResponse>;
  logout(): Promise<OkResponse>;
  getMe(): Promise<MeResponse>;
  getCategories(): Promise<CategoryDTO[]>;
  getPanchayats(includeInactive?: boolean): Promise<PanchayatDTO[]>;
  getWards(panchayatId: string, includeInactive?: boolean): Promise<WardDTO[]>;
  updateProfile(input: UpdateProfileInput): Promise<MeResponse>;

  // ---- Admin org-management (Global-Admin only, enforced server-side) ----
  getPanchayat(id: string): Promise<PanchayatDetailDTO>;
  createPanchayat(input: CreatePanchayatInput): Promise<PanchayatDetailDTO>;
  updatePanchayat(id: string, input: UpdatePanchayatInput): Promise<PanchayatDetailDTO>;
  deactivatePanchayat(id: string): Promise<PanchayatDetailDTO>;
  reactivatePanchayat(id: string): Promise<PanchayatDetailDTO>;
  createWard(panchayatId: string, input: CreateWardInput): Promise<WardDTO>;
  updateWard(wardId: string, input: UpdateWardInput): Promise<WardDTO>;
  deactivateWard(wardId: string): Promise<WardDTO>;
  reactivateWard(wardId: string): Promise<WardDTO>;
  searchStaff(phone: string): Promise<StaffUserDTO | null>;
  listRepresentatives(): Promise<RepresentativeDTO[]>;
  assignRepresentative(input: AssignRepresentativeInput): Promise<RepresentativeAssignmentDTO>;
  revokeRepresentative(assignmentId: string): Promise<{ revoked: true }>;
  listCoordinators(): Promise<CoordinatorDTO[]>;
  assignCoordinator(input: AssignCoordinatorInput): Promise<CoordinatorAssignmentDTO>;
  revokeCoordinator(assignmentId: string): Promise<{ revoked: true }>;

  // ---- Admin audit-log viewer (read-only, Global-Admin enforced server-side) ----
  listAuditLogs(params?: AuditLogListParams): Promise<AuditLogPageDTO>;

  // ---- Admin staff onboarding (OTP-gated, Global-Admin only) ----
  initiateOnboarding(input: InitiateOnboardingInput): Promise<StaffOnboardingDTO>;
  listOnboardings(status?: string): Promise<StaffOnboardingDTO[]>;
  getOnboarding(id: string): Promise<StaffOnboardingDTO>;
  resendOnboarding(id: string): Promise<StaffOnboardingDTO>;
  verifyOnboarding(id: string, code: string): Promise<StaffOnboardingDTO>;
  cancelOnboarding(id: string): Promise<StaffOnboardingDTO>;
  createIssue(input: CreateIssueInput, idempotencyKey?: string): Promise<IssueDetailDTO>;
  createOnBehalf(input: CreateOnBehalfInput, idempotencyKey?: string): Promise<OnBehalfResult>;
  listIssues(params?: { status?: string }): Promise<IssueSummaryDTO[]>;
  getIssue(id: string): Promise<IssueDetailDTO>;
  transitionIssue(id: string, input: TransitionInput): Promise<IssueDetailDTO>;
  uploadAttachment(issueId: string, file: Blob | File): Promise<AttachmentDTO>;
  listNotifications(): Promise<NotificationDTO[]>;
  unreadCount(): Promise<{ count: number }>;
  markNotificationRead(id: string): Promise<NotificationDTO>;
}

/**
 * Creates a typed fetch client for the Panchayat Platform API.
 *
 * URL convention: pass `baseUrl` as just the origin (no `/api/v1`); the
 * client owns each route's path (e.g. `/auth/request-otp`) and prepends
 * the `/api/v1` version prefix itself, so callers never repeat it.
 */
export function createApiClient(options: CreateApiClientOptions): ApiClient {
  const { baseUrl, getCookieHeader } = options;

  async function request<T>(path: string, init?: RequestInit): Promise<T> {
    const url = `${baseUrl}${API_PREFIX}${path}`;
    const headers = new Headers(init?.headers);
    // FormData bodies (multipart uploads) must NOT get a JSON content-type —
    // the browser/fetch needs to set its own `multipart/form-data;
    // boundary=...` based on the actual FormData contents. Forcing
    // `application/json` here would silently break the multipart upload.
    if (
      init?.body !== undefined &&
      !headers.has('Content-Type') &&
      !(init.body instanceof FormData)
    ) {
      headers.set('Content-Type', 'application/json');
    }

    if (getCookieHeader) {
      const cookie = await getCookieHeader();
      if (cookie) headers.set('Cookie', cookie);
    }

    let response: Response;
    try {
      response = await fetch(url, {
        ...init,
        headers,
        credentials: 'include',
      });
    } catch {
      throw new ApiClientError('network_error', 'errors.network', 0);
    }

    if (!response.ok) {
      let parsedBody: unknown;
      try {
        parsedBody = await response.json();
      } catch {
        parsedBody = undefined;
      }

      if (isApiErrorBody(parsedBody)) {
        throw new ApiClientError(parsedBody.error.code, parsedBody.error.messageKey, response.status);
      }
      throw new ApiClientError('unknown_error', 'errors.unknown', response.status);
    }

    // Read as text first: some endpoints legitimately return an EMPTY body
    // (e.g. `GET /staff/search` with no match resolves to `null`, which Nest
    // may serialize as no content). Parsing an empty string with `.json()`
    // throws, so treat an empty body as `null`.
    const text = await response.text();
    return (text ? (JSON.parse(text) as T) : (null as T));
  }

  return {
    requestOtp: (input) =>
      request<OkResponse>('/auth/request-otp', {
        method: 'POST',
        body: JSON.stringify(input),
      }),

    verifyOtp: (input) =>
      request<MeResponse>('/auth/verify-otp', {
        method: 'POST',
        body: JSON.stringify(input),
      }),

    logout: () => request<OkResponse>('/auth/logout', { method: 'POST' }),

    getMe: () => request<MeResponse>('/auth/me', { method: 'GET' }),

    getCategories: () => request<CategoryDTO[]>('/categories', { method: 'GET' }),

    getPanchayats: (includeInactive) =>
      request<PanchayatDTO[]>(`/panchayats${includeInactive ? '?includeInactive=true' : ''}`, {
        method: 'GET',
      }),

    getWards: (panchayatId, includeInactive) =>
      request<WardDTO[]>(
        `/panchayats/${encodeURIComponent(panchayatId)}/wards${
          includeInactive ? '?includeInactive=true' : ''
        }`,
        { method: 'GET' },
      ),

    updateProfile: (input) =>
      request<MeResponse>('/users/me', {
        method: 'PATCH',
        body: JSON.stringify(input),
      }),

    // ---- Admin org-management --------------------------------------------
    getPanchayat: (id) =>
      request<PanchayatDetailDTO>(`/panchayats/${encodeURIComponent(id)}`, { method: 'GET' }),

    createPanchayat: (input) =>
      request<PanchayatDetailDTO>('/panchayats', { method: 'POST', body: JSON.stringify(input) }),

    updatePanchayat: (id, input) =>
      request<PanchayatDetailDTO>(`/panchayats/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: JSON.stringify(input),
      }),

    deactivatePanchayat: (id) =>
      request<PanchayatDetailDTO>(`/panchayats/${encodeURIComponent(id)}/deactivate`, {
        method: 'POST',
      }),

    reactivatePanchayat: (id) =>
      request<PanchayatDetailDTO>(`/panchayats/${encodeURIComponent(id)}/reactivate`, {
        method: 'POST',
      }),

    createWard: (panchayatId, input) =>
      request<WardDTO>(`/panchayats/${encodeURIComponent(panchayatId)}/wards`, {
        method: 'POST',
        body: JSON.stringify(input),
      }),

    updateWard: (wardId, input) =>
      request<WardDTO>(`/wards/${encodeURIComponent(wardId)}`, {
        method: 'PATCH',
        body: JSON.stringify(input),
      }),

    deactivateWard: (wardId) =>
      request<WardDTO>(`/wards/${encodeURIComponent(wardId)}/deactivate`, { method: 'POST' }),

    reactivateWard: (wardId) =>
      request<WardDTO>(`/wards/${encodeURIComponent(wardId)}/reactivate`, { method: 'POST' }),

    searchStaff: (phone) =>
      request<StaffUserDTO | null>(`/staff/search?phone=${encodeURIComponent(phone)}`, {
        method: 'GET',
      }),

    listRepresentatives: () =>
      request<RepresentativeDTO[]>('/representatives', { method: 'GET' }),

    assignRepresentative: (input) =>
      request<RepresentativeAssignmentDTO>('/representatives', {
        method: 'POST',
        body: JSON.stringify(input),
      }),

    revokeRepresentative: (assignmentId) =>
      request<{ revoked: true }>(
        `/representatives/${encodeURIComponent(assignmentId)}/revoke`,
        { method: 'POST' },
      ),

    listCoordinators: () => request<CoordinatorDTO[]>('/coordinators', { method: 'GET' }),

    assignCoordinator: (input) =>
      request<CoordinatorAssignmentDTO>('/coordinators', {
        method: 'POST',
        body: JSON.stringify(input),
      }),

    revokeCoordinator: (assignmentId) =>
      request<{ revoked: true }>(
        `/coordinators/${encodeURIComponent(assignmentId)}/revoke`,
        { method: 'POST' },
      ),

    // ---- Staff onboarding ------------------------------------------------
    initiateOnboarding: (input) =>
      request<StaffOnboardingDTO>('/onboarding', { method: 'POST', body: JSON.stringify(input) }),

    listOnboardings: (status) =>
      request<StaffOnboardingDTO[]>(
        `/onboarding${status ? `?status=${encodeURIComponent(status)}` : ''}`,
        { method: 'GET' },
      ),

    getOnboarding: (id) =>
      request<StaffOnboardingDTO>(`/onboarding/${encodeURIComponent(id)}`, { method: 'GET' }),

    resendOnboarding: (id) =>
      request<StaffOnboardingDTO>(`/onboarding/${encodeURIComponent(id)}/resend`, { method: 'POST' }),

    verifyOnboarding: (id, code) =>
      request<StaffOnboardingDTO>(`/onboarding/${encodeURIComponent(id)}/verify`, {
        method: 'POST',
        body: JSON.stringify({ code }),
      }),

    cancelOnboarding: (id) =>
      request<StaffOnboardingDTO>(`/onboarding/${encodeURIComponent(id)}/cancel`, { method: 'POST' }),

    createIssue: (input, idempotencyKey) =>
      request<IssueDetailDTO>('/issues', {
        method: 'POST',
        body: JSON.stringify(input),
        headers: idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : undefined,
      }),

    createOnBehalf: (input, idempotencyKey) =>
      request<OnBehalfResult>('/issues/on-behalf', {
        method: 'POST',
        body: JSON.stringify(input),
        headers: idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : undefined,
      }),

    listIssues: (params) => {
      const query = params?.status ? `?status=${encodeURIComponent(params.status)}` : '';
      return request<IssueSummaryDTO[]>(`/issues${query}`, { method: 'GET' });
    },

    listAuditLogs: (params) => {
      const qs = new URLSearchParams();
      // Only set params that are present; the opaque `cursor` is forwarded as-is.
      if (params?.action) qs.set('action', params.action);
      if (params?.entityType) qs.set('entityType', params.entityType);
      if (params?.entityId) qs.set('entityId', params.entityId);
      if (params?.actorUserId) qs.set('actorUserId', params.actorUserId);
      if (params?.from) qs.set('from', params.from);
      if (params?.to) qs.set('to', params.to);
      if (params?.limit !== undefined) qs.set('limit', String(params.limit));
      if (params?.cursor) qs.set('cursor', params.cursor);
      const query = qs.toString();
      return request<AuditLogPageDTO>(`/audit-logs${query ? `?${query}` : ''}`, { method: 'GET' });
    },

    getIssue: (id) => request<IssueDetailDTO>(`/issues/${encodeURIComponent(id)}`, { method: 'GET' }),

    transitionIssue: (id, input) =>
      request<IssueDetailDTO>(`/issues/${encodeURIComponent(id)}/status`, {
        method: 'PATCH',
        body: JSON.stringify(input),
      }),

    uploadAttachment: (issueId, file) => {
      const fd = new FormData();
      fd.append('file', file);
      return request<AttachmentDTO>(`/issues/${encodeURIComponent(issueId)}/attachment`, {
        method: 'POST',
        body: fd,
      });
    },

    listNotifications: () => request<NotificationDTO[]>('/notifications', { method: 'GET' }),

    unreadCount: () => request<{ count: number }>('/notifications/unread-count', { method: 'GET' }),

    markNotificationRead: (id) =>
      request<NotificationDTO>(`/notifications/${encodeURIComponent(id)}/read`, { method: 'PATCH' }),
  };
}
