import { describe, expect, it } from 'vitest';

import { AccessControlService, type ScopedUser } from './access-control.service';

let roleAssignmentCounter = 0;

/** Builds a minimal `ScopedUser` with the given role assignments for pure in-memory tests. */
function userWith(
  assignments: Array<{ role: ScopedUser['roleAssignments'][number]['role']; panchayatId?: string | null; wardId?: string | null }>,
): ScopedUser {
  return {
    id: `user-${roleAssignmentCounter}`,
    phone: '+911234567890',
    fullName: null,
    email: null,
    preferredLanguage: 'en',
    status: 'active',
    addressLine: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    roleAssignments: assignments.map((a) => {
      roleAssignmentCounter += 1;
      return {
        id: `ra-${roleAssignmentCounter}`,
        userId: `user-${roleAssignmentCounter}`,
        role: a.role,
        panchayatId: a.panchayatId ?? null,
        wardId: a.wardId ?? null,
        createdAt: new Date(),
      };
    }),
  } as unknown as ScopedUser;
}

describe('AccessControlService', () => {
  const service = new AccessControlService();

  describe('can', () => {
    it('ADMIN can act on any scope', () => {
      const admin = userWith([{ role: 'ADMIN' }]);

      expect(service.can(admin, 'issue:update', {})).toBe(true);
      expect(service.can(admin, 'issue:update', { panchayatId: 'p1' })).toBe(true);
      expect(service.can(admin, 'issue:update', { wardId: 'w1' })).toBe(true);
    });

    it('COORDINATOR@P1 denied on P2', () => {
      const coordinator = userWith([{ role: 'COORDINATOR', panchayatId: 'p1' }]);

      expect(service.can(coordinator, 'issue:update', { panchayatId: 'p2' })).toBe(false);
    });

    it('REPRESENTATIVE@W1 denied on W2', () => {
      const representative = userWith([{ role: 'REPRESENTATIVE', wardId: 'w1' }]);

      expect(service.can(representative, 'issue:update', { wardId: 'w2' })).toBe(false);
    });

    it('CITIZEN denied a staff-only action', () => {
      const citizen = userWith([{ role: 'CITIZEN' }]);

      expect(service.can(citizen, 'issue:update', { panchayatId: 'p1' })).toBe(false);
      expect(service.can(citizen, 'issue:update', {})).toBe(false);
    });

    it('COORDINATOR@P1 allowed on a ward within P1', () => {
      const coordinator = userWith([{ role: 'COORDINATOR', panchayatId: 'p1' }]);

      // Guard resolves ward->panchayat before calling can(); here we simulate
      // that resolved scope directly since this service is DB-free.
      expect(service.can(coordinator, 'issue:update', { wardId: 'w1', panchayatId: 'p1' })).toBe(true);
    });
  });

  describe('isStaff', () => {
    it('is true for ADMIN, COORDINATOR, and REPRESENTATIVE', () => {
      expect(service.isStaff(userWith([{ role: 'ADMIN' }]))).toBe(true);
      expect(service.isStaff(userWith([{ role: 'COORDINATOR', panchayatId: 'p1' }]))).toBe(true);
      expect(service.isStaff(userWith([{ role: 'REPRESENTATIVE', wardId: 'w1' }]))).toBe(true);
    });

    it('is false for a CITIZEN with no staff assignment', () => {
      expect(service.isStaff(userWith([{ role: 'CITIZEN' }]))).toBe(false);
    });

    it('is false for a user with no role assignments at all', () => {
      expect(service.isStaff(userWith([]))).toBe(false);
    });
  });

  describe('hasRole', () => {
    it('matches a role with no scope constraint regardless of the assignment scope', () => {
      const coordinator = userWith([{ role: 'COORDINATOR', panchayatId: 'p1' }]);

      expect(service.hasRole(coordinator, 'COORDINATOR')).toBe(true);
      expect(service.hasRole(coordinator, 'REPRESENTATIVE')).toBe(false);
    });

    it('matches a role constrained to a scope only when the assignment scope matches exactly', () => {
      const coordinator = userWith([{ role: 'COORDINATOR', panchayatId: 'p1' }]);

      expect(service.hasRole(coordinator, 'COORDINATOR', { panchayatId: 'p1' })).toBe(true);
      expect(service.hasRole(coordinator, 'COORDINATOR', { panchayatId: 'p2' })).toBe(false);
    });

    it('matches a REPRESENTATIVE role constrained to a wardId scope', () => {
      const representative = userWith([{ role: 'REPRESENTATIVE', wardId: 'w1' }]);

      expect(service.hasRole(representative, 'REPRESENTATIVE', { wardId: 'w1' })).toBe(true);
      expect(service.hasRole(representative, 'REPRESENTATIVE', { wardId: 'w2' })).toBe(false);
    });
  });
});
