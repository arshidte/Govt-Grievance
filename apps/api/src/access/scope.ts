import { SetMetadata } from '@nestjs/common';

/** Where in the request `RbacGuard` should read the resource-scope identifier from. */
export type ScopeSource = 'param' | 'query';

/** Which resource-scope field a given request key populates. */
export type ScopeTarget = 'panchayatId' | 'wardId';

/** One (source, key) -> target mapping used by `RbacGuard` to resolve the resource scope. */
export interface ScopeDescriptor {
  source: ScopeSource;
  key: string;
  target: ScopeTarget;
}

/** Metadata key `RbacGuard` reads to learn how to resolve the resource's scope. */
export const SCOPE_KEY = 'access:scope';

/**
 * Declares where to read the resource's scope identifier(s) from (route
 * params or the query string), for `RbacGuard` to resolve the scope it
 * checks against the caller's role assignments.
 *
 * A single call takes one `(source, key)` pair and defaults `target` to
 * `'panchayatId'`. Pass `target: 'wardId'` for a ward-scoped route. If a
 * route is scoped by ward only, `RbacGuard` resolves that ward's
 * `panchayatId` via Prisma itself (see `RbacGuard` docs) — callers do not
 * need to also declare a `panchayatId` descriptor for that case.
 *
 * `SetMetadata` does not merge across repeated calls with the same key, so
 * this decorator accepts only ONE descriptor per handler. A route needing
 * both a param-sourced `panchayatId` AND a separately-sourced `wardId` is
 * not supported today — compose the single identifier that best identifies
 * the resource (ward implies panchayat via DB lookup in the guard).
 *
 * Example: `@ScopeFrom('param', 'panchayatId')` on
 * `GET /panchayats/:panchayatId/issues` reads `req.params.panchayatId`.
 * Example: `@ScopeFrom('param', 'wardId', 'wardId')` on
 * `GET /wards/:wardId/issues` reads `req.params.wardId`.
 */
export const ScopeFrom = (source: ScopeSource, key: string, target: ScopeTarget = 'panchayatId') =>
  SetMetadata(SCOPE_KEY, { source, key, target });
