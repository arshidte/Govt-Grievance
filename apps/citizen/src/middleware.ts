import createIntlMiddleware from 'next-intl/middleware';
import { NextResponse, type NextRequest } from 'next/server';
import { defaultLocale, locales } from '@pg/i18n';

/**
 * Locale-prefix strategy: `always`. Every route is served under an explicit
 * `/en` or `/ml` prefix (next-intl redirects `/home` -> `/en/home`), rather
 * than hiding the default locale (`as-needed`). This keeps the auth-gate
 * logic below simple and unambiguous: we can strip a known locale segment
 * and compare the remainder against a fixed list of public paths, with no
 * guessing about whether a leading segment is a locale or a route name.
 */
const SESSION_COOKIE_NAME = 'pg_session';

/**
 * Public routes that never require a session cookie.
 * NOTE (T23+): any NEW public auth page (e.g. `/verify`, `/register`) MUST be
 * added here (or to the `/login` segment check in isPublicPath) or it will be
 * gated by the session-cookie auth gate below.
 */
const PUBLIC_PATHS = new Set(['/', '/track']);

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
  // Segment match for /login (not a bare prefix) so sibling routes like
  // `/login-help` / `/loginassistant` are NOT silently treated as public.
  return (
    PUBLIC_PATHS.has(unprefixed) ||
    unprefixed === '/login' ||
    unprefixed.startsWith('/login/')
  );
}

/**
 * Composed middleware: next-intl's locale routing runs first (so an
 * unprefixed request like `/home` becomes `/en/home` before we inspect it),
 * then an auth gate redirects to `/login` for protected routes when the
 * `pg_session` cookie is ABSENT.
 *
 * IMPORTANT: this checks cookie PRESENCE ONLY. It does not validate the
 * session (signature, expiry, revocation) — that remains a server-side
 * concern (the backend is the authoritative auth layer), per the project's
 * Global Constraint. This gate exists purely to avoid rendering protected
 * UI for obviously-unauthenticated requests.
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
