import type { CookieOptions } from 'express';

import { env } from '../config/env';

/**
 * Shared attributes for the session cookie, independent of value/lifetime.
 *
 * - `httpOnly`: JS (and thus XSS) cannot read the token.
 * - `secure`: only sent over HTTPS. (The platform terminates TLS in front of
 *   the API in every deployed environment.)
 * - `sameSite: 'lax'`: the cookie rides top-level navigations but not
 *   cross-site subrequests, mitigating CSRF while keeping normal links
 *   working.
 * - `path: '/'`: the session applies to the whole API surface.
 */
const BASE_COOKIE_OPTIONS: Readonly<CookieOptions> = {
  httpOnly: true,
  secure: true,
  sameSite: 'lax',
  path: '/',
};

/** The name of the session cookie, from validated env. */
export const SESSION_COOKIE_NAME = env.SESSION_COOKIE_NAME;

/** A cookie name + value + options triple, ready for `res.cookie(...)`. */
export interface SessionCookie {
  name: string;
  value: string;
  options: CookieOptions;
}

/**
 * Builds the cookie that carries the opaque session `token`. `maxAge` is tied
 * to `SESSION_TTL_HOURS` so the browser drops the cookie around the same time
 * the server-side session expires. The controller sets this on the response
 * (Task 11); this helper stays a pure function so it is trivially testable.
 */
export function buildSessionCookie(token: string): SessionCookie {
  return {
    name: SESSION_COOKIE_NAME,
    value: token,
    options: {
      ...BASE_COOKIE_OPTIONS,
      maxAge: env.SESSION_TTL_HOURS * 60 * 60 * 1000,
    },
  };
}

/**
 * Builds the cookie that clears the session on logout: same name and
 * attributes (so the browser matches and overwrites the existing cookie) with
 * an empty value and an immediate expiry.
 */
export function buildClearSessionCookie(): SessionCookie {
  return {
    name: SESSION_COOKIE_NAME,
    value: '',
    options: {
      ...BASE_COOKIE_OPTIONS,
      maxAge: 0,
      expires: new Date(0),
    },
  };
}
