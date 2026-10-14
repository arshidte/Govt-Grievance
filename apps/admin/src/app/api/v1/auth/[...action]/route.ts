import type { NextResponse, NextRequest } from 'next/server';
import { proxyToApi } from '../../../../../lib/bff-proxy';

/**
 * BFF (backend-for-frontend) proxy for `/api/v1/auth/*` — admin app's
 * mirror of the citizen app's `src/app/api/v1/auth/[...action]/route.ts`.
 *
 * MOUNT PATH (ruling R16): `@pg/api-client`'s `createApiClient` hardcodes
 * the `/api/v1` prefix onto every URL it builds (see
 * packages/api-client/src/client.ts: `${baseUrl}${API_PREFIX}${path}`). A
 * same-origin BROWSER client (`baseUrl: ''`) therefore emits requests to
 * `/api/v1/auth/request-otp`, `/api/v1/auth/verify-otp`, etc. This catch-all
 * is mounted at `src/app/api/v1/auth/[...action]/route.ts` (NOT the brief's
 * original `src/app/api/auth/[...action]/route.ts`) specifically so it
 * matches those same-origin requests.
 *
 * It is a THIN, FAITHFUL proxy — no business logic, no own validation, no
 * CORS (this is same-origin by construction: browser -> this route handler
 * -> NestJS). It exists purely so the browser can set/read the
 * `pg_session` cookie as FIRST-PARTY (same-origin to the Next.js admin
 * app), rather than needing a cross-origin cookie relationship with the
 * NestJS API's own origin, which browsers restrict far more heavily
 * (SameSite, third-party cookie blocking, etc.).
 *
 * The actual relay mechanics (fetch, header forwarding, Set-Cookie fan-out,
 * 502 fallback) live in `src/lib/bff-proxy.ts` (`proxyToApi`) — copied from
 * the citizen app (T24's ruling R17 extracted it there; admin is a
 * separate app/deployment, so it gets its own copy rather than a shared
 * import). This file keeps only the `action` param -> `auth/<action>` path
 * prefixing that is specific to this route's mount point.
 *
 * Admin only needs the auth routes proxied for THIS task (login/verify/
 * logout/me). A general catch-all mirroring citizen's
 * `/api/v1/[...path]/route.ts` is deferred until admin has client-side
 * authed reads (T27) — not needed yet, so not added (YAGNI).
 */
async function handler(
  request: NextRequest,
  { params }: { params: Promise<{ action: string[] }> },
): Promise<NextResponse> {
  const { action } = await params;
  return proxyToApi(request, ['auth', ...action]);
}

export const GET = handler;
export const POST = handler;
