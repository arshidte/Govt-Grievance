import { describe, expect, it } from 'vitest';
import type { MeResponse, Role } from '@pg/types';
import { requireStaff } from './requireStaff';

/**
 * Review Focus #4: the admin app's staff gate. `requireStaff` is a pure
 * function of a `MeResponse` — no I/O, no server call — so this suite
 * covers it directly: every `STAFF_ROLES` member (ADMIN, COORDINATOR,
 * REPRESENTATIVE) must grant access, and a citizen-only (or role-less) user
 * must be denied. The actual Forbidden-rendering/redirect wiring that CALLS
 * this function from the authed layout is a server component and is
 * exercised by the (deferred-execution) Playwright spec, not here.
 */

function meWithRoles(roles: Role[]): MeResponse {
  return {
    id: 'user-1',
    phone: '+919876543210',
    fullName: 'Test User',
    email: null,
    preferredLanguage: 'en',
    status: 'active',
    roles: roles.map((role, i) => ({
      id: `ra-${i}`,
      role,
      panchayatId: null,
      wardId: null,
    })),
  };
}

describe('requireStaff', () => {
  it('is false for a citizen-only MeResponse', () => {
    expect(requireStaff(meWithRoles(['CITIZEN']))).toBe(false);
  });

  it('is false for a MeResponse with no roles at all', () => {
    expect(requireStaff(meWithRoles([]))).toBe(false);
  });

  it('is true when the user holds ADMIN', () => {
    expect(requireStaff(meWithRoles(['ADMIN']))).toBe(true);
  });

  it('is true when the user holds COORDINATOR', () => {
    expect(requireStaff(meWithRoles(['COORDINATOR']))).toBe(true);
  });

  it('is true when the user holds REPRESENTATIVE', () => {
    expect(requireStaff(meWithRoles(['REPRESENTATIVE']))).toBe(true);
  });

  it('is true when the user holds a staff role alongside CITIZEN', () => {
    expect(requireStaff(meWithRoles(['CITIZEN', 'REPRESENTATIVE']))).toBe(true);
  });
});
