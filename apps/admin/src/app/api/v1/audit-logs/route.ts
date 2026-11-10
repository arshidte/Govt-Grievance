import { NextRequest, type NextResponse } from 'next/server';

import { proxyToApi } from '../../../../lib/bff-proxy';

/**
 * Dedicated BFF route for the admin audit-log viewer (`GET /api/v1/audit-logs`,
 * M4B). A dedicated route (mirroring the `auth/[...action]` sibling) rather than
 * the general catch-all, specifically so it can apply a STRICT query-parameter
 * allowlist: only the M4A-supported filters + pagination params are forwarded;
 * anything else is dropped before the upstream call.
 *
 * The opaque `cursor` is passed through verbatim (never decoded or
 * reconstructed). The session cookie + internal-API relay (and the path-safety
 * / Set-Cookie handling) are delegated to `proxyToApi`; the NestJS API remains
 * the sole authorization boundary (Global-Admin `@Roles('ADMIN')`), so this
 * route adds no business logic and never exposes the internal origin or tokens
 * to the browser. Only `GET` is exported — the viewer is read-only.
 */
const ALLOWED_PARAMS = [
  'action',
  'entityType',
  'entityId',
  'actorUserId',
  'from',
  'to',
  'limit',
  'cursor',
] as const;

async function handler(request: NextRequest): Promise<NextResponse> {
  const incoming = request.nextUrl.searchParams;
  const filtered = new URLSearchParams();
  for (const key of ALLOWED_PARAMS) {
    const value = incoming.get(key);
    if (value !== null && value !== '') {
      filtered.set(key, value);
    }
  }

  // Clone the request with the sanitized query string; `proxyToApi` reads
  // `nextUrl.search` and forwards the `Cookie` header from this request.
  const url = new URL(request.nextUrl.href);
  url.search = filtered.toString();
  const sanitized = new NextRequest(url, request);

  return proxyToApi(sanitized, ['audit-logs']);
}

export const GET = handler;
