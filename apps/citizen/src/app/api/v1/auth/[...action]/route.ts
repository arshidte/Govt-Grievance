import { NextResponse, type NextRequest } from 'next/server';

/**
 * BFF (backend-for-frontend) proxy for `/api/v1/auth/*`.
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
 * `pg_session` cookie as FIRST-PARTY (same-origin to the Next.js app),
 * rather than needing a cross-origin cookie relationship with the NestJS
 * API's own origin, which browsers restrict far more heavily (SameSite,
 * third-party cookie blocking, etc.).
 *
 * `API_INTERNAL_URL` (server-to-server origin, e.g. `http://localhost:4000`
 * in dev) is read from `process.env` on the SERVER only — it is never sent
 * to or referenced from client code, so it cannot leak into a browser
 * bundle or response.
 */

const UPSTREAM_BASE = process.env.API_INTERNAL_URL;

function upstreamUrl(action: string[], search: string): string {
  const path = action.join('/');
  return `${UPSTREAM_BASE}/api/v1/auth/${path}${search}`;
}

async function proxy(request: NextRequest, action: string[]): Promise<NextResponse> {
  const url = upstreamUrl(action, request.nextUrl.search);

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
  // (e.g. the `pg_session` cookie set by verify-otp, or cleared by logout)
  // is relayed intact, first-party, to the browser.
  for (const setCookie of upstreamResponse.headers.getSetCookie()) {
    response.headers.append('set-cookie', setCookie);
  }

  return response;
}

async function handler(
  request: NextRequest,
  { params }: { params: Promise<{ action: string[] }> },
): Promise<NextResponse> {
  const { action } = await params;
  return proxy(request, action);
}

export const GET = handler;
export const POST = handler;
