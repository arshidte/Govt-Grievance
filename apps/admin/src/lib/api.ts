import { cookies } from 'next/headers';
import { createApiClient } from '@pg/api-client';

/**
 * Server-side API client (mirrors the citizen app's src/lib/api.ts). Used
 * from server components / route handlers, where there is no browser
 * cookie jar — `getCookieHeader` forwards the INCOMING request's cookies
 * (including `pg_session`) to the API so the backend can authenticate the
 * call on the caller's behalf.
 *
 * `baseUrl` is the API ORIGIN only (no `/api/v1` — `createApiClient`
 * prepends that itself). `API_INTERNAL_URL` is the server-to-server origin
 * (see .env.example), shared with the citizen app — same backend, same
 * `pg_session` cookie; only the CORS origin differs per-app
 * (`CORS_ORIGIN_ADMIN`, enforced by the API, not by this client).
 */
export const api = createApiClient({
  baseUrl: process.env.API_INTERNAL_URL!,
  getCookieHeader: async () => (await cookies()).toString(),
});
