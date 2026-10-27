/**
 * Centralized rate-limit configuration for the global HTTP throttler
 * (`@nestjs/throttler`), registered in `app.module.ts`.
 *
 * Two named throttlers are registered:
 * - `default`: a generous general-purpose limit applied to every route.
 * - `auth`: a MUCH tighter limit applied only to `/auth/*` routes (see
 *   `@Throttle({ auth: { limit: AUTH_THROTTLE_LIMIT, ttl: ... } })` on
 *   `AuthController` in `src/auth/auth.controller.ts`), since those routes
 *   (`request-otp`/`verify-otp`) are the most sensitive to abuse (OTP
 *   flooding, credential/code guessing).
 *
 * The DEFAULT limit/TTLs and the auth TTL are intentionally tiny, readable
 * constants so the e2e in `test/throttle.e2e-spec.ts` can deterministically
 * trip the `auth` limit in a handful of requests without waiting out a real
 * TTL. The auth LIMIT is sourced from the validated env (`config/env.ts`) —
 * strict default 5, production-guarded — see `AUTH_THROTTLE_LIMIT` below.
 */

import { env } from '../config/env';

/** General-purpose limit: requests allowed per `DEFAULT_THROTTLE_TTL_MS` window, per IP. */
export const DEFAULT_THROTTLE_LIMIT = 100;

/** Window (ms) for the general-purpose limit. */
export const DEFAULT_THROTTLE_TTL_MS = 60_000;

/**
 * Tight limit for `/auth/*` routes: requests allowed per
 * `AUTH_THROTTLE_TTL_MS` window, per IP. Deliberately much lower than the
 * default limit (acceptance criterion: auth endpoints throttled harder than
 * general endpoints).
 *
 * Sourced from the VALIDATED env (`config/env.ts`) — a single config contract
 * (positive-int validation + the production guard both live there) rather than
 * a second raw `process.env` read here. The PRODUCTION value is fixed at the
 * default `5` (strict); it is overridable ONLY outside production so the
 * Playwright BROWSER e2e — which performs many real OTP logins from one IP
 * (127.0.0.1), a harness artifact, not the abuse this guards against — can
 * raise it. `test/throttle.e2e-spec.ts` asserts the real behaviour against the
 * default (it never sets the override). The env guard rejects any non-default
 * value under `NODE_ENV=production`.
 */
export const AUTH_THROTTLE_LIMIT = env.AUTH_THROTTLE_LIMIT;

/** Window (ms) for the tight auth limit. */
export const AUTH_THROTTLE_TTL_MS = 60_000;
