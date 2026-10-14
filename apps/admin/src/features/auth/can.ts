import { STAFF_ROLES, type MeResponse, type Role } from '@pg/types';
import type { NavPermission } from '../nav/navItems';

/**
 * UX-ONLY permission helper. `can()` decides which nav items a user's
 * roles are shown in the sidebar/drawer so staff aren't presented links to
 * surfaces they can't use — it is NOT an authorization boundary. The
 * backend remains the SOLE authoritative layer: every admin route and API
 * call is (or will be, as each module ships) independently enforced
 * server-side (see `requireStaff`, src/lib/requireStaff.ts, for the
 * existing staff-vs-citizen gate). Hiding a link here never substitutes
 * for checking permission where the action actually happens.
 *
 * Per-role visibility (brief example: REPRESENTATIVE sees Issues but not
 * Settings/Audit-logs; ADMIN sees everything):
 *   - ADMIN: every permission (`staff` + `admin`).
 *   - COORDINATOR, REPRESENTATIVE: `staff` only — day-to-day case-handling
 *     modules, not platform configuration/administration.
 *   - CITIZEN (or no roles): nothing — citizens never reach this app (the
 *     `(app)` layout's `requireStaff` gate blocks them before this runs),
 *     but `can()` stays total/safe for any input.
 */
const ROLE_PERMISSIONS: Record<Role, NavPermission[]> = {
  ADMIN: ['staff', 'admin'],
  COORDINATOR: ['staff'],
  REPRESENTATIVE: ['staff'],
  CITIZEN: [],
};

/** Accepts either a full `MeResponse` or just its `roles`, so callers (e.g. a client Sidebar given only roles as props) don't need to construct a fake `MeResponse`. */
export type CanUser = Pick<MeResponse, 'roles'> | MeResponse['roles'];

function rolesOf(user: CanUser): Role[] {
  const roles = Array.isArray(user) ? user : user.roles;
  return roles.map((r) => r.role);
}

export function can(user: CanUser, permission: NavPermission): boolean {
  const roles = rolesOf(user);
  return roles.some((role) => ROLE_PERMISSIONS[role].includes(permission));
}

/** Re-exported for convenience so callers of `can` don't need a separate `@pg/types` import just for `STAFF_ROLES`. */
export { STAFF_ROLES };
