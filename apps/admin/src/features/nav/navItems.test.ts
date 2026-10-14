import { describe, expect, it } from 'vitest';
import type { MeResponse, RoleAssignmentDTO } from '@pg/types';
import { can } from '../auth/can';
import { navItems } from './navItems';

/** Builds a minimal `MeResponse` carrying exactly the given role assignments — only `roles` matters to `can()`. */
function meWithRoles(roles: RoleAssignmentDTO['role'][]): MeResponse {
  return {
    id: 'user-1',
    phone: '+919000000000',
    fullName: null,
    email: null,
    preferredLanguage: 'en',
    status: 'active',
    roles: roles.map((role, i) => ({ id: `role-${i}`, role, panchayatId: null, wardId: null })),
  };
}

/** Filters `navItems` by `can(user, item.permission)` — the same filtering the Sidebar/MobileDrawer apply. */
function visibleKeys(user: MeResponse): string[] {
  return navItems.filter((item) => can(user, item.permission)).map((item) => item.key);
}

describe('navItems + can() role-based filtering', () => {
  it('excludes admin-only items for a REPRESENTATIVE but includes Issues', () => {
    const representative = meWithRoles(['REPRESENTATIVE']);
    const keys = visibleKeys(representative);

    expect(keys).toContain('issues');
    expect(keys).not.toContain('settings');
    expect(keys).not.toContain('auditLogs');
  });

  it('includes every nav item for an ADMIN, including admin-only items', () => {
    const admin = meWithRoles(['ADMIN']);
    const keys = visibleKeys(admin);

    expect(keys).toEqual(navItems.map((item) => item.key));
    expect(keys).toContain('settings');
    expect(keys).toContain('auditLogs');
  });

  it('excludes admin-only items for a COORDINATOR but includes staff items', () => {
    const coordinator = meWithRoles(['COORDINATOR']);
    const keys = visibleKeys(coordinator);

    expect(keys).toContain('issues');
    expect(keys).not.toContain('settings');
    expect(keys).not.toContain('auditLogs');
  });

  it('shows nothing for a user with no staff roles (defense in depth — the server gate already blocks this case)', () => {
    const citizen = meWithRoles(['CITIZEN']);
    expect(visibleKeys(citizen)).toEqual([]);
  });
});
