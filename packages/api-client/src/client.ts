import type {
  CategoryDTO,
  MeResponse,
  RequestOtpInput,
  UpdateProfileInput,
  VerifyOtpInput,
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
  updateProfile(input: UpdateProfileInput): Promise<MeResponse>;
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
    if (init?.body !== undefined && !headers.has('Content-Type')) {
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

    return (await response.json()) as T;
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

    updateProfile: (input) =>
      request<MeResponse>('/users/me', {
        method: 'PATCH',
        body: JSON.stringify(input),
      }),
  };
}
