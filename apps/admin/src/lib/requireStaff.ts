import { STAFF_ROLES, type MeResponse } from '@pg/types';

/**
 * The admin app's staff-role gate (Review Focus #4). Returns true iff
 * `user` holds at least one role in `STAFF_ROLES` (ADMIN, COORDINATOR,
 * REPRESENTATIVE) — a citizen-only `MeResponse` (empty `roles`, or only a
 * CITIZEN assignment) returns false.
 *
 * Pure function of the already-fetched `MeResponse` — no I/O. The SERVER
 * side caller (the authed route group's layout, see
 * src/app/[locale]/(app)/layout.tsx) is responsible for fetching `me` via
 * `GET /auth/me` and deciding what to render when this returns false
 * (the `ForbiddenState` from `@pg/ui`) vs. when the fetch itself fails
 * with 401 (redirect to `/login` — no valid session at all, which is a
 * DIFFERENT case from "valid session, wrong role").
 */
export function requireStaff(user: MeResponse): boolean {
  return user.roles.some((r) => STAFF_ROLES.includes(r.role));
}
