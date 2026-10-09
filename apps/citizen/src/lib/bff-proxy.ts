import { NextResponse, type NextRequest } from 'next/server';

/**
 * Shared BFF (backend-for-frontend) relay helper.
 *
 * Extracted from Task 23's `/api/v1/auth/[...action]/route.ts` (ruling R17)
 * so a second catch-all route (`/api/v1/[...path]/route.ts`, covering
 * `/users/*` and `/categories`) can reuse the EXACT SAME verified
 * cookie/Set-Cookie relay behavior instead of re-implementing it. See that
 * route's original header comment for the full rationale (same-origin
 * cookie delivery for the HttpOnly `pg_session` cookie); this file keeps
 * only the mechanics, so both routes stay byte-for-byte consistent.
 *
 * It is a THIN, FAITHFUL proxy — no business logic, no own validation, no
 * CORS (same-origin by construction). `API_INTERNAL_URL` (server-to-server
 * origin) is read from `process.env` on the SERVER only — never sent to or
 * referenced from client code, so it cannot leak into a browser bundle or
 * response.
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
