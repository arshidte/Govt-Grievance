import type { Role } from '@pg/types';

/**
 * A nav permission names the CAPABILITY an item requires, not a specific
 * role — `can()` (src/features/auth/can.ts) maps roles to the set of
 * permissions they hold. Keeping the mapping in one place (rather than
 * sprinkling role checks across every nav item) means a role's visibility
 * can change by editing `can.ts` alone.
 *
 * - `staff`: any STAFF_ROLES member (ADMIN, COORDINATOR, REPRESENTATIVE) —
 *   the baseline, already enforced server-side by `requireStaff`.
 * - `admin`: ADMIN-only surfaces (platform configuration, audit trail).
 */
export type NavPermission = 'staff' | 'admin';

export interface NavItem {
  /** Also used as the i18n key under the `nav` namespace and as the `data-testid` suffix. */
  key: string;
  /** Href relative to the locale prefix (e.g. `/issues` -> `/${locale}/issues`). */
  href: string;
  permission: NavPermission;
}

/**
 * The admin dashboard's nav model: the dashboard home plus the 12 modules
 * from the brief. Order here is the order rendered in the sidebar/drawer.
 * `permission` is UX-only (see can.ts) — every route behind these links is
 * additionally enforced server-side by the `(app)` layout's `requireStaff`
 * gate, and will be further scoped by real authorization once each module
 * ships its own API in M2+.
 */
export const navItems: NavItem[] = [
  { key: 'dashboard', href: '/', permission: 'staff' },
  { key: 'issues', href: '/issues', permission: 'staff' },
  { key: 'panchayats', href: '/panchayats', permission: 'admin' },
  { key: 'wards', href: '/wards', permission: 'admin' },
  { key: 'representatives', href: '/representatives', permission: 'staff' },
  { key: 'coordinators', href: '/coordinators', permission: 'admin' },
  { key: 'citizens', href: '/citizens', permission: 'staff' },
  { key: 'categories', href: '/categories', permission: 'admin' },
  { key: 'escalations', href: '/escalations', permission: 'staff' },
  { key: 'notifications', href: '/notifications', permission: 'staff' },
  { key: 'reports', href: '/reports', permission: 'staff' },
  { key: 'settings', href: '/settings', permission: 'admin' },
  { key: 'auditLogs', href: '/audit-logs', permission: 'admin' },
];

export type { Role };
