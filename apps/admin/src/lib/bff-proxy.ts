import { NextResponse, type NextRequest } from 'next/server';

import { isPathSafe } from './bff-allowlist';

/**
 * Shared BFF (backend-for-frontend) relay helper — admin app's copy of the
 * citizen app's `apps/citizen/src/lib/bff-proxy.ts` (T24's ruling R17).
 * Admin is a SEPARATE Next.js app/deployment from citizen, so this is a
 * deliberate, byte-for-byte-behavior copy rather than a shared import (no
 * cross-app package for it exists, and introducing one is out of scope for
 * this task — see T26's brief).
 *
 * It is a THIN, FAITHFUL proxy — no business logic, no own validation, no
 * CORS (same-origin by construction). `API_INTERNAL_URL` (server-to-server
 * origin) is read from `process.env` on the SERVER only — never sent to or
 * referenced from client code, so it cannot leak into a browser bundle or
 * response.
 *
 * TASK 19 (BFF HARDENING, mirroring citizen's Task 18): this helper now
 * gates every call through `isPathSafe` (see `./bff-allowlist.ts`) BEFORE
 * building the upstream URL or calling `fetch`. This protects BOTH the new
 * general catch-all (`/api/v1/[...path]/route.ts`) AND the pre-existing auth
 * sibling route (`/api/v1/auth/[...action]/route.ts`), since both
 * string-concat their segments into this same function.
 */

const UPSTREAM_BASE = process.env.API_INTERNAL_URL;

function upstreamUrl(pathSegments: string[], search: string): string {
  const path = pathSegments.join('/');
  return `${UPSTREAM_BASE}/api/v1/${path}${search}`;
}

/**
 * Proxies `request` to `${API_INTERNAL_URL}/api/v1/${pathSegments.join('/')}`,
 * forwarding method/body/content-type/Cookie/query string untouched, and
 * relays the upstream response body/status/content-type back, including
 * EVERY `Set-Cookie` header individually (via `getSetCookie()` — see the
 * footgun note below) rather than folding multiples into one comma-joined
 * string.
 */
export async function proxyToApi(request: NextRequest, pathSegments: string[]): Promise<NextResponse> {
  // PATH-SAFETY GATE (Task 19) — runs BEFORE the upstream URL is built or
  // fetched, so a crafted traversal / absolute-URL / host-override can never
  // reach `fetch`. Lives HERE (not in the per-route allowlist) precisely so
  // BOTH callers are protected: the general `/api/v1/[...path]` catch-all
  // AND the `/api/v1/auth/[...action]` sibling route — the auth route also
  // string-concats its segments into `proxyToApi`, so without this guard a
  // request like `/api/v1/auth/%2e%2e/dev/last-otp` (delivered decoded as
  // `['auth','..','dev','last-otp']`) would let `fetch`'s URL normalization
  // collapse `/auth/../dev/` → `/dev/`, escaping the `auth/` prefix. We
  // reject any `.`/`..` (raw or `%2e`-encoded), leading/embedded `/`, `\`,
  // `//`, or `scheme:`/`scheme://` form. Rejection → 404, upstream NEVER
  // called, indistinguishable from a nonexistent route.
  if (!isPathSafe(pathSegments)) {
    return NextResponse.json(
      { error: { code: 'not_found', messageKey: 'errors.notFound' } },
      { status: 404 },
    );
  }

  const url = upstreamUrl(pathSegments, request.nextUrl.search);

  const headers = new Headers();
  const contentType = request.headers.get('content-type');
  if (contentType) headers.set('content-type', contentType);
  const cookie = request.headers.get('cookie');
  if (cookie) headers.set('cookie', cookie);

  const hasBody = request.method !== 'GET' && request.method !== 'HEAD';

  let upstreamResponse: Response;
  try {
    upstreamResponse = await fetch(url, {
      method: request.method,
      headers,
      body: hasBody ? await request.text() : undefined,
      // Server-to-server call: this process IS the credential boundary for
      // the incoming browser request (we forward its Cookie header above
      // explicitly), so no `credentials` option is needed/applicable here.
      redirect: 'manual',
    });
  } catch {
    // Upstream unreachable — do not leak the internal URL or raw error.
    return NextResponse.json(
      { error: { code: 'upstream_unreachable', messageKey: 'errors.network' } },
      { status: 502 },
    );
  }

  const bodyText = await upstreamResponse.text();
  const response = new NextResponse(bodyText, {
    status: upstreamResponse.status,
    statusText: upstreamResponse.statusText,
  });

  const responseContentType = upstreamResponse.headers.get('content-type');
  if (responseContentType) {
    response.headers.set('content-type', responseContentType);
  }

  // Set-Cookie footgun: `fetch`/`Headers.get('set-cookie')` folds MULTIPLE
  // Set-Cookie response headers into one comma-joined string, which is NOT
  // valid for re-emitting as separate cookies (commas appear inside cookie
  // attributes like `Expires`, so naive splitting corrupts them too).
  // `getSetCookie()` (undici/Next's Headers extension) returns each
  // Set-Cookie header as a separate array entry instead — append each one
  // individually onto the outgoing NextResponse so every upstream cookie
  // is relayed intact, first-party, to the browser.
  for (const setCookie of upstreamResponse.headers.getSetCookie()) {
    response.headers.append('set-cookie', setCookie);
  }

  return response;
}
