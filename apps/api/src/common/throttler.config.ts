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
 * These are intentionally tiny, readable numbers (not environment-driven)
 * so the e2e in `test/throttle.e2e-spec.ts` can deterministically trip the
 * `auth` limit in a handful of requests without waiting out a real TTL.
 */

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
 * The PRODUCTION default is `5` (strict) — and `test/throttle.e2e-spec.ts`
 * asserts exactly this behaviour against the default (it never sets the env
 * var below). It is env-OVERRIDABLE solely so the Playwright BROWSER e2e
 * harness can raise it (its `webServer` boots the API with a high value,
 * alongside the existing `OTP_RATE_LIMIT_PER_PHONE_PER_HOUR=100` override):
 * those suites legitimately perform many real OTP logins from a single IP
 * (127.0.0.1), which is a harness artifact, NOT the abuse this throttle
 * guards against — the throttle's real behaviour is covered by the dedicated
 * throttle e2e at the default. Never lower the default; never set the
 * override in a production environment.
 */
export const AUTH_THROTTLE_LIMIT = Number(process.env.AUTH_THROTTLE_LIMIT ?? 5);

/** Window (ms) for the tight auth limit. */
export const AUTH_THROTTLE_TTL_MS = 60_000;
