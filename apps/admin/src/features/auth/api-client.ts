'use client';

import { createApiClient, type ApiClient } from '@pg/api-client';

/**
 * Browser-side API client (mirrors the citizen app's
 * `src/features/auth/api-client.ts`). `baseUrl: ''` makes every request
 * same-origin (e.g. `/api/v1/auth/request-otp`), which the BFF catch-all
 * route handler at `src/app/api/v1/auth/[...action]/route.ts` intercepts
 * and forwards to the real NestJS API — see that file's header comment and
 * ruling R16 for why the BFF is mounted at that exact path.
 *
 * No `getCookieHeader` here (unlike the SERVER client in `src/lib/api.ts`):
 * in the browser, `fetch`'s default `credentials: 'include'` (set inside
 * `createApiClient`) already sends the browser's own cookie jar
 * automatically — there is no separate "incoming request" to forward from.
 *
 * Created once at module scope: it holds no per-request/per-user state
 * (unlike `QueryClient`, which IS created per-session in `providers.tsx`),
 * so a single shared instance is safe and avoids recreating it on every
 * render/hook call.
 */
export const browserApiClient: ApiClient = createApiClient({ baseUrl: '' });

/** Returns the shared browser-side API client. A stable reference across renders. */
export function useApiClient(): ApiClient {
  return browserApiClient;
}
