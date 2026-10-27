import { NextResponse, type NextRequest } from 'next/server';

import { isAllowed } from '../../../../lib/bff-allowlist';
import { proxyToApi } from '../../../../lib/bff-proxy';

/**
 * General BFF (backend-for-frontend) proxy for `/api/v1/*`, EXCLUDING
 * `/api/v1/auth/*` (Next.js resolves the more specific static `auth`
 * segment's sibling route — `../auth/[...action]/route.ts` — before this
 * catch-all for any path starting with `auth/`, so there is no overlap).
 *
 * TASK 19 (admin's parallel to citizen's Task 18/24): admin previously had
 * NO general catch-all — only the auth sibling route existed. This route is
 * NEW. It is built DIRECTLY to the hardened standard (never existed in an
 * unhardened "forward everything" form): it FIRST consults the admin
 * `isAllowed(method, path)` allowlist (`src/lib/bff-allowlist.ts`); any
 * (method, path) pair the admin screens don't use — citizen/rep-only routes
 * (`POST issues`, `POST issues/on-behalf`, `POST issues/:id/attachment`),
 * dev routes (`GET dev/last-otp`), notifications/categories/panchayats/
 * users/me, or anything unlisted — is rejected as a 404 BEFORE
 * `proxyToApi`/`fetch` is ever called, indistinguishable from a nonexistent
 * route (no hint it was a blocked internal path). Traversal / absolute-URL
 * safety is enforced one layer deeper, inside `proxyToApi` (so the auth
 * sibling route gets it too).
 *
 * ADMIN-SPECIFIC ASYMMETRY: `PATCH issues/:id/status` (the staff status
 * transition) IS allowlisted here, unlike the citizen app's allowlist,
 * which deliberately blocks it.
 */

/**
 * 404 in the SAME uniform error-body shape the NestJS API uses
 * (`{ error: { code, messageKey } }`) so a blocked path is indistinguishable
 * from a genuinely nonexistent one — no signal that it was an allowlist
 * rejection of a real internal endpoint.
 */
function notFound(): NextResponse {
  return NextResponse.json(
    { error: { code: 'not_found', messageKey: 'errors.notFound' } },
    { status: 404 },
  );
}

async function handler(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
): Promise<NextResponse> {
  const { path } = await params;

  // Allowlist gate — reject disallowed (method, path) pairs BEFORE any
  // upstream contact. `proxyToApi` is never reached for a 404 here.
  if (!isAllowed(request.method, path)) {
    return notFound();
  }

  return proxyToApi(request, path);
}

export const GET = handler;
export const POST = handler;
export const PATCH = handler;
export const PUT = handler;
export const DELETE = handler;
