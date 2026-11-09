import { PanchayatsManager } from '../../../../features/org/panchayats/PanchayatsManager';

/**
 * Admin Panchayats management (org-management milestone — replaces the
 * `ModulePage` placeholder). Reached only after the `(app)` layout's
 * `requireStaff` gate; every mutation the client component triggers is
 * additionally Global-Admin-only server-side (RbacGuard + @Roles('ADMIN')).
 */
export default function PanchayatsPage() {
  return <PanchayatsManager />;
}
