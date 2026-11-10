/**
 * ADMIN BFF allowlist + shared path-safety validation (Task 19 — parallels
 * citizen's Task 18, `apps/citizen/src/lib/bff-allowlist.ts`).
 *
 * Admin had NO general catch-all before this task — only the auth sibling
 * route (`auth/[...action]/route.ts`) existed, calling `proxyToApi` directly.
 * This task adds the general catch-all AND, exactly like citizen, turns it
 * (and the shared `proxyToApi` helper) into a STRICT path+method allowlist:
 * only the exact (method, path-shape) pairs the admin screens actually use
 * are relayed; everything else is indistinguishable from a nonexistent
 * route (404, upstream never called).
 *
 * It ALSO owns `isPathSafe`, the traversal / absolute-URL / host-override
 * rejection that MUST run before any `fetch`. That guard lives here (and is
 * invoked from `proxyToApi`) so BOTH the general catch-all AND the auth
 * sibling route — which both string-concat their segments into
 * `proxyToApi` — are protected by the same check.
 *
 * FETCH-NORMALIZATION VECTOR (why pre-validation is non-negotiable):
 * `proxyToApi` builds the upstream URL by STRING CONCAT
 * (`${API_INTERNAL_URL}/api/v1/${segments.join('/')}`) and hands it to
 * `fetch`, which URL-NORMALIZES. A request to
 * `/api/v1/issues/%2e%2e/dev/last-otp` arrives at the Next catch-all with
 * the `%2e%2e` already decoded to `..` in the params, producing the string
 * `.../api/v1/issues/../dev/last-otp`. `fetch` would then collapse
 * `/issues/../dev/` to `/dev/`, ESCAPING the intended `issues/` prefix and
 * hitting an unintended upstream path. Rejecting any `.`/`..` segment (and
 * absolute-URL / `//` / backslash / `scheme:` forms) BEFORE constructing
 * the URL closes that vector — the crafted `..` can never reach `fetch`.
 *
 * THIS MODULE IS A FAITHFUL COPY of the citizen module's `isPathSafe` and
 * `matchesPattern` (copied VERBATIM — the decode-then-reject logic and the
 * segment-boundary `*` handling were the reviewed security crux for Task 18
 * and must not be reinvented or weakened here). ONLY the allowlist array
 * contents differ, per the admin app's own endpoint surface (spec §8:
 * "admin: auth, issues, attachments").
 */

/**
 * One allowlist entry: an HTTP method plus a path PATTERN. The pattern is
 * relative to `/api/v1/` (no leading slash) and uses:
 *   - literal segments            — must match that exact segment;
 *   - `:param`                    — matches EXACTLY ONE non-empty segment
 *                                   that is not `.`/`..` (ids);
 *   - a trailing `*` (as a suffix  — prefix wildcard: the literal before it
 *     on the LAST segment, e.g.      must match that segment, and zero+
 *     `notifications*`)              further CLEAN segments may follow
 *                                    (covers `notifications`,
 *                                    `notifications/unread-count`,
 *                                    `notifications/:id/read`, etc.).
 */
interface AllowlistEntry {
  readonly method: string;
  readonly pattern: string;
}

/**
 * The ADMIN allowlist — method + path-pattern (path RELATIVE to
 * `/api/v1/`). Tight patterns (exact segment counts + method) mean the
 * citizen-only / unlisted routes fall out as 404s WITHOUT any explicit
 * exclusion entry:
 *   - `POST  issues`             — not listed (citizen self-submit only);
 *   - `POST  issues/on-behalf`   — not listed (admin app has no rep
 *                                  on-behalf UI; out of this app's surface);
 *   - `POST  issues/:id/attachment` — not listed (citizen-only upload);
 *   - `GET|PATCH notifications*` — `notifications` is not an allowlisted
 *                                  prefix here;
 *   - `GET   categories`        — not listed;
 *   - `GET   panchayats*`       — not listed;
 *   - `GET|PATCH users/me`      — not listed (profile read is `auth/me`,
 *                                  served by the auth sibling route);
 *   - `GET   dev/last-otp`      — `dev` is not an allowlisted prefix.
 *
 * ADMIN-SPECIFIC: `PATCH issues/:id/status` IS allowed here (the staff
 * status transition) — this is the one deliberate asymmetry vs. the
 * citizen allowlist, which blocks it.
 *
 * AUTH: `/api/v1/auth/*` is served by the SEPARATE auth sibling route
 * (`auth/[...action]/route.ts`), which Next resolves BEFORE this catch-all,
 * so the catch-all never receives an `auth/*` path. We therefore OMIT auth
 * entries here (there is nothing for them to match in this route) rather
 * than carry dead patterns — the auth route keeps forwarding `auth/*`
 * itself and now also benefits from the shared `isPathSafe` guard in
 * `proxyToApi`.
 */
const ADMIN_ALLOWLIST: readonly AllowlistEntry[] = [
  // Issues (staff scope-checked server-side; PATCH status is the
  // admin-specific staff transition that citizen's allowlist deliberately
  // excludes).
  { method: 'GET', pattern: 'issues' },
  { method: 'GET', pattern: 'issues/:id' },
  { method: 'PATCH', pattern: 'issues/:id/status' },

  // Attachments (download a stored attachment by id; owner-or-in-scope-staff
  // authorized server-side).
  { method: 'GET', pattern: 'attachments/:id' },

  // Organization management (org-management milestone). READS are authed;
  // every MUTATION is additionally Global-Admin-only server-side (RbacGuard
  // + @Roles('ADMIN')) — the allowlist only relays the shape, it is NOT the
  // authorization boundary. Query strings (`?includeInactive`, `?phone`) are
  // forwarded by `proxyToApi` and don't affect path matching.
  //   Panchayats
  { method: 'GET', pattern: 'panchayats' },
  { method: 'POST', pattern: 'panchayats' },
  { method: 'GET', pattern: 'panchayats/:id' },
  { method: 'PATCH', pattern: 'panchayats/:id' },
  { method: 'POST', pattern: 'panchayats/:id/deactivate' },
  { method: 'POST', pattern: 'panchayats/:id/reactivate' },
  { method: 'GET', pattern: 'panchayats/:id/wards' },
  { method: 'POST', pattern: 'panchayats/:id/wards' },
  //   Wards (item ops by ward id)
  { method: 'GET', pattern: 'wards/:id' },
  { method: 'PATCH', pattern: 'wards/:id' },
  { method: 'POST', pattern: 'wards/:id/deactivate' },
  { method: 'POST', pattern: 'wards/:id/reactivate' },
  //   Staff search + representative/coordinator assignments
  { method: 'GET', pattern: 'staff/search' },
  { method: 'GET', pattern: 'representatives' },
  { method: 'POST', pattern: 'representatives' },
  { method: 'POST', pattern: 'representatives/:id/revoke' },
  { method: 'GET', pattern: 'coordinators' },
  { method: 'POST', pattern: 'coordinators' },
  { method: 'POST', pattern: 'coordinators/:id/revoke' },
  //   Staff onboarding (admin-initiated, OTP-gated). All admin-only server-side.
  { method: 'POST', pattern: 'onboarding' },
  { method: 'GET', pattern: 'onboarding' },
  { method: 'GET', pattern: 'onboarding/:id' },
  { method: 'POST', pattern: 'onboarding/:id/resend' },
  { method: 'POST', pattern: 'onboarding/:id/verify' },
  { method: 'POST', pattern: 'onboarding/:id/cancel' },
];

/**
 * True iff `segment` is a single, CLEAN path segment: non-empty, and not a
 * `.`/`..` traversal token. (Decoding and `%2e`-style checks happen in
 * `isPathSafe`, which runs first; this is the per-segment shape check used
 * by the matcher for `:param` and `*`.)
 */
function isCleanSegment(segment: string): boolean {
  return segment.length > 0 && segment !== '.' && segment !== '..';
}

/**
 * Matches one concrete path (already split into segments) against one
 * allowlist pattern. A wrong segment count (outside a trailing `*`) or a
 * dirty `:param`/`*` segment fails the match.
 */
function matchesPattern(patternSegments: string[], pathSegments: string[]): boolean {
  for (let i = 0; i < patternSegments.length; i++) {
    // `i < length`, so this index is always present; the `?? ''` narrows the
    // `noUncheckedIndexedAccess` `string | undefined` to `string` (an empty
    // pattern segment never matches a real path segment anyway).
    const patternSegment = patternSegments[i] ?? '';

    if (patternSegment.endsWith('*')) {
      // Trailing prefix-wildcard (only valid on the LAST pattern segment).
      // The literal BEFORE the `*` must match the path segment at this
      // index; then every REMAINING path segment must be clean. Zero
      // further segments is allowed (matches the bare prefix exactly).
      const literal = patternSegment.slice(0, -1);
      const here = pathSegments[i];
      if (here !== literal) return false;
      const rest = pathSegments.slice(i + 1);
      return rest.every(isCleanSegment);
    }

    const pathSegment = pathSegments[i];
    if (pathSegment === undefined) return false; // path shorter than pattern

    if (patternSegment.startsWith(':')) {
      // `:param` — exactly one clean segment (an id), never `.`/`..`.
      if (!isCleanSegment(pathSegment)) return false;
      continue;
    }

    // Literal segment — must match exactly.
    if (patternSegment !== pathSegment) return false;
  }

  // No wildcard consumed the tail: lengths must be exactly equal (a longer
  // path — e.g. `issues/:id/status` vs `issues/:id` — must NOT match).
  return pathSegments.length === patternSegments.length;
}

/**
 * The admin allowlist decision. `method` is matched case-INSENSITIVELY
 * but EXACTLY (GET ≠ PATCH); `path` is the segments relative to `/api/v1/`
 * (as delivered by Next's catch-all, already URL-decoded). Returns `true`
 * only if some allowlist entry matches both the method and the path shape.
 *
 * NOTE: this is a pure allowlist check. It does NOT re-validate traversal /
 * absolute-URL safety — that is `isPathSafe`'s job and runs in
 * `proxyToApi` before any fetch. (The matcher's `isCleanSegment` guard on
 * `:param`/`*` is defense-in-depth, not the primary traversal defense.)
 */
export function isAllowed(method: string, path: string[]): boolean {
  const normalizedMethod = method.toUpperCase();
  return ADMIN_ALLOWLIST.some((entry) => {
    if (entry.method !== normalizedMethod) return false;
    return matchesPattern(entry.pattern.split('/'), path);
  });
}

/**
 * Path-safety gate — runs in `proxyToApi` BEFORE the upstream URL is built
 * or fetched, protecting BOTH the general catch-all and the auth sibling
 * route. `segments` are the already-decoded catch-all params that will be
 * `.join('/')`-ed into the upstream path.
 *
 * Returns `false` (→ caller responds 404, upstream NEVER called) for any
 * reconstructed path that, after decoding, has:
 *   - any `.`/`..` segment, or a segment whose %-decoded form is `.`/`..`
 *     (e.g. `%2e%2e`) — the fetch-normalization traversal vector;
 *   - a leading `/`, a `//` (protocol-relative), a `\` backslash, or a
 *     `scheme:` / `http:`/`https:` prefix — absolute-URL / host-override
 *     attempts (`new URL('//evil.test/x', base)` → `http://evil.test/x`);
 *   - an empty segment that would alter the path structure.
 */
export function isPathSafe(segments: string[]): boolean {
  if (segments.length === 0) return false;

  for (const rawSegment of segments) {
    // A segment could itself be percent-encoded (e.g. `%2e%2e`). Decode and
    // inspect; a malformed encoding is treated as unsafe.
    let decoded: string;
    try {
      decoded = decodeURIComponent(rawSegment);
    } catch {
      return false;
    }

    // Empty segment — would collapse into `//` on join, altering structure.
    if (decoded.length === 0) return false;

    // Traversal tokens (raw or decoded `%2e%2e` / `%2e`).
    if (decoded === '.' || decoded === '..') return false;

    // Backslash — some normalizers treat `\` as a path separator.
    if (decoded.includes('\\')) return false;

    // A `/` inside a single decoded segment means it would inject extra
    // path structure (a leading `/`, a `//` protocol-relative form, or a
    // nested traversal like `../`). Reject outright.
    if (decoded.includes('/')) return false;

    // Absolute-URL / scheme prefix (`http:`, `https:`, or any `scheme:`
    // host-override attempt). A colon in the first segment is the tell for
    // a `scheme://host` form once joined; reject any `://` or leading
    // scheme marker.
    if (decoded.includes('://')) return false;
    if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(decoded)) return false;
  }

  return true;
}
