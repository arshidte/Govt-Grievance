import { Injectable } from '@nestjs/common';
import type { RoleAssignment, User } from '@prisma/client';
import { STAFF_ROLES, type Role } from '@pg/types';

/** A `User` with its `roleAssignments` eagerly loaded (what `AuthGuard` attaches to `req.user`). */
export type ScopedUser = User & { roleAssignments: RoleAssignment[] };

/**
 * The resource being acted on, identified by scope. Both fields are
 * optional because not every resource is ward-scoped (e.g. a panchayat-level
 * report), and an unscoped `{}` means "global" (only ADMIN may act on it).
 *
 * IMPORTANT (scope-resolution approach, see Task 12 brief): this service does
 * NO database lookups. A ward's panchayat is never inferred here. Callers
 * (in practice, `RbacGuard`) are responsible for resolving a ward's
 * panchayatId via Prisma BEFORE calling `can()`, and passing a `resourceScope`
 * that already carries both `wardId` and the ward's `panchayatId` when
 * relevant. This keeps the role/scope matching logic pure and unit-testable
 * with plain in-memory objects — no DB needed for this file's tests.
 */
export interface ResourceScope {
  panchayatId?: string;
  wardId?: string;
}

/**
 * Scoped RBAC decision engine: "can user U do action A on resource R".
 *
 * `action` is an opaque string today (e.g. `'issue:update'`) — this service
 * does not maintain an action->role matrix; callers/guards decide which
 * roles are eligible for an action (via `@Roles(...)`) and then ask `can()`
 * (or `hasRole()`) to confirm the *scope* matches one of the user's
 * assignments for an eligible role. `action` is accepted for call-site
 * clarity and future extension, but is not currently used to vary the
 * decision.
 *
 * Rules:
 * - ADMIN: allowed for any scope (including the empty/global scope).
 * - COORDINATOR: allowed when `resourceScope.panchayatId` matches one of the
 *   user's COORDINATOR assignments' `panchayatId`.
 * - REPRESENTATIVE: allowed when `resourceScope.wardId` matches one of the
 *   user's REPRESENTATIVE assignments' `wardId`.
 * - CITIZEN / no matching staff role: denied.
 *
 * Denial is the default outcome: any ambiguous or unscoped request where no
 * rule above explicitly grants access is denied. Never change this to
 * default-allow.
 */
@Injectable()
export class AccessControlService {
  /**
   * Returns whether `user` may perform `action` on a resource identified by
   * `resourceScope`. See class doc for the exact matching rules. Pure
   * function of its arguments — no I/O.
   */
  can(user: ScopedUser, action: string, resourceScope: ResourceScope): boolean {
    void action; // reserved for future per-action rules; scope matching below is role-driven today.

    for (const ra of user.roleAssignments) {
      if (ra.role === 'ADMIN') {
        return true;
      }

      if (ra.role === 'COORDINATOR') {
        if (resourceScope.panchayatId && ra.panchayatId === resourceScope.panchayatId) {
          return true;
        }
      }

      if (ra.role === 'REPRESENTATIVE') {
        if (resourceScope.wardId && ra.wardId === resourceScope.wardId) {
          return true;
        }
      }
    }

    return false;
  }

  /** True if `user` holds any role in `STAFF_ROLES` (ADMIN/COORDINATOR/REPRESENTATIVE), regardless of scope. */
  isStaff(user: ScopedUser): boolean {
    return user.roleAssignments.some((ra) => STAFF_ROLES.includes(ra.role as Role));
  }

  /**
   * True if `user` holds `role`, optionally constrained to `scope`. With no
   * `scope`, any assignment of that role (scoped or not) matches. With a
   * `scope`, at least one assignment of that role must match every scope key
   * provided (e.g. `{ panchayatId: 'p1' }` requires a COORDINATOR assignment
   * whose `panchayatId` is exactly `'p1'`).
   */
  hasRole(user: ScopedUser, role: Role, scope?: ResourceScope): boolean {
    return user.roleAssignments.some((ra) => {
      if (ra.role !== role) {
        return false;
      }

      if (!scope) {
        return true;
      }

      if (scope.panchayatId !== undefined && ra.panchayatId !== scope.panchayatId) {
        return false;
      }

      if (scope.wardId !== undefined && ra.wardId !== scope.wardId) {
        return false;
      }

      return true;
    });
  }
}
