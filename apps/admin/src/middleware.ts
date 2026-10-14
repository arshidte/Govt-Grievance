import createIntlMiddleware from 'next-intl/middleware';
import { NextResponse, type NextRequest } from 'next/server';
import { defaultLocale, locales } from '@pg/i18n';

/**
 * Locale-prefix strategy: `always`. Every route is served under an explicit
 * `/en` or `/ml` prefix (next-intl redirects `/dashboard` -> `/en/dashboard`),
 * rather than hiding the default locale (`as-needed`). This keeps the
 * auth-gate logic below simple and unambiguous: we can strip a known locale
 * segment and compare the remainder against a fixed list of public paths,
 * with no guessing about whether a leading segment is a locale or a route
 * name. Mirrors the citizen app's middleware.ts exactly (same cookie name,
 * same locale-prefix strategy) — see that file for the fuller rationale.
 */
const SESSION_COOKIE_NAME = 'pg_session';

/**
 * Public routes that never require a session cookie. Unlike the citizen
 * app, the admin app has no public landing/track/register flow — `/login`
 * and `/verify` (Task 26's OTP login flow) are the only routes reachable
 * without a session. Without this, `/login` itself would be gated by the
 * check below, producing a redirect loop (unauthenticated -> redirect to
 * /login -> /login gated -> redirect to /login -> ...). Any NEW public
 * route added later must be added here or it will be gated below.
 */
const PUBLIC_PATHS = new Set<string>([]);

const intlMiddleware = createIntlMiddleware({
  locales,
  defaultLocale,
  localePrefix: 'always',
});

/** Strips a leading `/en` or `/ml` locale segment, if present. */
function stripLocalePrefix(pathname: string): string {
  for (const locale of locales) {
    const prefix = `/${locale}`;
    if (pathname === prefix) return '/';
    if (pathname.startsWith(`${prefix}/`)) return pathname.slice(prefix.length);
  }
  return pathname;
}

function isPublicPath(pathname: string): boolean {
  const unprefixed = stripLocalePrefix(pathname);
  // Segment match for /login and /verify (not a bare prefix) so sibling
  // routes like `/login-help` / `/loginassistant` / `/verify-something`
  // are NOT silently treated as public.
  return (
    PUBLIC_PATHS.has(unprefixed) ||
    unprefixed === '/login' ||
    unprefixed.startsWith('/login/') ||
    unprefixed === '/verify' ||
    unprefixed.startsWith('/verify/')
  );
}

/**
 * Composed middleware: next-intl's locale routing runs first (so an
 * unprefixed request like `/dashboard` becomes `/en/dashboard` before we
 * inspect it), then an auth gate redirects to `/login` for protected routes
 * when the `pg_session` cookie is ABSENT.
 *
 * IMPORTANT: this checks cookie PRESENCE ONLY. It does not validate the
 * session (signature, expiry, revocation) and it CANNOT check roles —
 * roles are not encoded in the cookie, only resolvable server-side via
 * `GET /auth/me`. That remains a server-side concern (the backend is the
 * authoritative auth layer; the authed route group's layout does the
 * staff-role check — see src/app/[locale]/(app)/layout.tsx and
 * src/lib/requireStaff.ts), per the project's Global Constraint. This gate
 * exists purely to avoid rendering protected UI for obviously-
 * unauthenticated requests.
 */
export function middleware(request: NextRequest) {
  const intlResponse = intlMiddleware(request);

  // If next-intl already issued a redirect (e.g. locale-prefixing an
  // unprefixed path), honor it — the auth gate runs on the NEXT request,
  // once the path is locale-prefixed.
  if (intlResponse.status >= 300 && intlResponse.status < 400) {
    return intlResponse;
  }

  const { pathname } = request.nextUrl;

  if (!isPublicPath(pathname)) {
    const hasSession = request.cookies.has(SESSION_COOKIE_NAME);
    if (!hasSession) {
      const locale = locales.find((l) => pathname === `/${l}` || pathname.startsWith(`/${l}/`)) ?? defaultLocale;
      const loginUrl = new URL(`/${locale}/login`, request.url);
      return NextResponse.redirect(loginUrl);
    }
  }

  return intlResponse;
}

export const config = {
  // Run on everything except Next.js internals, API routes, and static
  // assets (files with an extension, e.g. favicon.ico, *.png).
  matcher: ['/((?!api|_next|_vercel|.*\\..*).*)'],
};
