import { SetMetadata } from '@nestjs/common';
import type { Role } from '@pg/types';

/** Metadata key `RbacGuard` reads to learn which roles are eligible for a route. */
export const ROLES_KEY = 'access:roles';

/**
 * Marks a route handler (or controller) as requiring one of `roles`.
 * `RbacGuard` denies with a uniform 403 unless the authenticated user holds
 * at least one of the listed roles (ADMIN always passes, see guard).
 *
 * A route with no `@Roles(...)` and no `RbacGuard` applied is NOT restricted
 * by this mechanism — `@Roles` only has an effect where `RbacGuard` runs.
 */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
