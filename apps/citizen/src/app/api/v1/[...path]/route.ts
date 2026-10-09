import type { NextResponse, NextRequest } from 'next/server';
import { proxyToApi } from '../../../../lib/bff-proxy';

/**
 * General BFF (backend-for-frontend) proxy for `/api/v1/*`, EXCLUDING
 * `/api/v1/auth/*` (Next.js resolves the more specific static `auth`
 * segment's sibling route — `../auth/[...action]/route.ts` — before this
 * catch-all for any path starting with `auth/`, so there is no overlap).
 *
 * RULING R17 (T24): Task 23 only built the auth BFF. This task's client
 * hooks additionally need `/api/v1/users/me` (PATCH, via `useUpdateProfile`
 * in `ProfileForm`) and `/api/v1/categories` (GET, via `useCategories`,
 * itself public but routed through the same proxy for consistency — see
 * the brief). Rather than add a second near-duplicate per-route handler,
 * this catch-all covers EVERY remaining `/api/v1/*` path uniformly, reusing
 * the exact relay helper (`proxyToApi`, in `src/lib/bff-proxy.ts`) that the
 * auth route also uses — same Cookie forwarding, same `getSetCookie()`
 * fan-out, same 502-without-leaking-the-internal-URL fallback, same
 * same-origin/no-CORS security properties. No new behavior, no weakening
 * of API-side guards (`PATCH /users/me` still requires `AuthGuard` on the
 * NestJS side; this proxy forwards the Cookie header but adds no
 * authorization logic of its own).
 */
async function handler(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
): Promise<NextResponse> {
  const { path } = await params;
  return proxyToApi(request, path);
}

export const GET = handler;
export const POST = handler;
export const PATCH = handler;
export const PUT = handler;
export const DELETE = handler;
