import { Injectable } from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import type {
  CoordinatorDTO,
  RepresentativeAssignmentDTO,
  RepresentativeDTO,
  CoordinatorAssignmentDTO,
  StaffUserDTO,
} from '@pg/types';

import { AuditService } from '../audit/audit.service';
import { ApiError } from '../common/api-error';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Admin-only management of Representative (ward-scoped) and Coordinator
 * (panchayat-scoped) assignments. Both are `RoleAssignment` rows — there is
 * no dedicated model. Assignments are soft-revoked (never deleted), so the
 * assignment history is preserved; a revoked row no longer grants
 * authorization because `SessionService.validate` attaches ACTIVE assignments
 * only.
 *
 * Invariants enforced here:
 *  - assign targets an EXISTING user and a VALID, ACTIVE ward/panchayat;
 *  - no duplicate ACTIVE assignment (pre-check + DB partial-unique backstop);
 *  - one user may hold many assignments (multiple wards / panchayats);
 *  - revoke never touches the underlying User or any UNRELATED assignment.
 */
@Injectable()
export class StaffAssignmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Find an existing user by exact phone (for assignment). Null when none. */
  async searchByPhone(phone: string): Promise<StaffUserDTO | null> {
    const user = await this.prisma.user.findUnique({ where: { phone } });
    if (!user) {
      return null;
    }
    return { id: user.id, phone: user.phone, fullName: user.fullName };
  }

  // ---- Representatives (ward-scoped) -------------------------------------

  async listRepresentatives(): Promise<RepresentativeDTO[]> {
    const assignments = await this.prisma.roleAssignment.findMany({
      where: { role: Role.REPRESENTATIVE, revokedAt: null },
      include: { user: true, ward: { include: { panchayat: true } } },
      orderBy: [{ userId: 'asc' }, { createdAt: 'asc' }],
    });

    const byUser = new Map<string, RepresentativeDTO>();
    for (const ra of assignments) {
      if (!ra.ward) continue; // defensive: REPRESENTATIVE rows always carry a ward (CHECK)
      let rep = byUser.get(ra.userId);
      if (!rep) {
        rep = { userId: ra.userId, phone: ra.user.phone, fullName: ra.user.fullName, wards: [] };
        byUser.set(ra.userId, rep);
      }
      rep.wards.push({
        assignmentId: ra.id,
        wardId: ra.ward.id,
        wardNumber: ra.ward.number,
        wardName: ra.ward.name,
        wardNameMl: ra.ward.nameMl,
        wardStatus: ra.ward.status,
        panchayatId: ra.ward.panchayatId,
        panchayatName: ra.ward.panchayat.name,
      });
    }
    return [...byUser.values()];
  }

  async assignRepresentative(
    actorUserId: string,
    userId: string,
    wardId: string,
  ): Promise<RepresentativeAssignmentDTO> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new ApiError('user_not_found', 404, 'errors.userNotFound');
    }
    const ward = await this.prisma.ward.findUnique({
      where: { id: wardId },
      include: { panchayat: true },
    });
    if (!ward) {
      throw new ApiError('ward_not_found', 404, 'errors.wardNotFound');
    }
    if (ward.status !== 'active') {
      throw new ApiError('ward_inactive', 409, 'errors.wardInactive');
    }
    if (ward.panchayat.status !== 'active') {
      throw new ApiError('panchayat_inactive', 409, 'errors.panchayatInactive');
    }
    const existing = await this.prisma.roleAssignment.findFirst({
      where: { userId, role: Role.REPRESENTATIVE, wardId, revokedAt: null },
    });
    if (existing) {
      throw new ApiError('assignment_exists', 409, 'errors.assignmentExists');
    }

    let created;
    try {
      created = await this.prisma.roleAssignment.create({
        data: { userId, role: Role.REPRESENTATIVE, wardId, grantedBy: actorUserId },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ApiError('assignment_exists', 409, 'errors.assignmentExists');
      }
      throw err;
    }

    await this.audit.record({
      actorUserId,
      action: 'representative.assigned',
      entityType: 'RoleAssignment',
      entityId: created.id,
      metadata: { userId, wardId, panchayatId: ward.panchayatId },
    });

    return {
      assignmentId: created.id,
      wardId: ward.id,
      wardNumber: ward.number,
      wardName: ward.name,
      wardNameMl: ward.nameMl,
      wardStatus: ward.status,
      panchayatId: ward.panchayatId,
      panchayatName: ward.panchayat.name,
    };
  }

  async revokeRepresentative(actorUserId: string, assignmentId: string): Promise<void> {
    await this.revokeAssignment(actorUserId, assignmentId, Role.REPRESENTATIVE, 'representative.revoked');
  }

  // ---- Coordinators (panchayat-scoped) ----------------------------------

  async listCoordinators(): Promise<CoordinatorDTO[]> {
    const assignments = await this.prisma.roleAssignment.findMany({
      where: { role: Role.COORDINATOR, revokedAt: null },
      include: { user: true, panchayat: true },
      orderBy: [{ userId: 'asc' }, { createdAt: 'asc' }],
    });

    const byUser = new Map<string, CoordinatorDTO>();
    for (const ra of assignments) {
      if (!ra.panchayat) continue; // defensive: COORDINATOR rows always carry a panchayat (CHECK)
      let coord = byUser.get(ra.userId);
      if (!coord) {
        coord = { userId: ra.userId, phone: ra.user.phone, fullName: ra.user.fullName, panchayats: [] };
        byUser.set(ra.userId, coord);
      }
      coord.panchayats.push({
        assignmentId: ra.id,
        panchayatId: ra.panchayat.id,
        panchayatCode: ra.panchayat.code,
        panchayatName: ra.panchayat.name,
        panchayatNameMl: ra.panchayat.nameMl,
        panchayatStatus: ra.panchayat.status,
      });
    }
    return [...byUser.values()];
  }

  async assignCoordinator(
    actorUserId: string,
    userId: string,
    panchayatId: string,
  ): Promise<CoordinatorAssignmentDTO> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new ApiError('user_not_found', 404, 'errors.userNotFound');
    }
    const panchayat = await this.prisma.panchayat.findUnique({ where: { id: panchayatId } });
    if (!panchayat) {
      throw new ApiError('panchayat_not_found', 404, 'errors.panchayatNotFound');
    }
    if (panchayat.status !== 'active') {
      throw new ApiError('panchayat_inactive', 409, 'errors.panchayatInactive');
    }
    const existing = await this.prisma.roleAssignment.findFirst({
      where: { userId, role: Role.COORDINATOR, panchayatId, revokedAt: null },
    });
    if (existing) {
      throw new ApiError('assignment_exists', 409, 'errors.assignmentExists');
    }

    let created;
    try {
      created = await this.prisma.roleAssignment.create({
        data: { userId, role: Role.COORDINATOR, panchayatId, grantedBy: actorUserId },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ApiError('assignment_exists', 409, 'errors.assignmentExists');
      }
      throw err;
    }

    await this.audit.record({
      actorUserId,
      action: 'coordinator.assigned',
      entityType: 'RoleAssignment',
      entityId: created.id,
      metadata: { userId, panchayatId },
    });

    return {
      assignmentId: created.id,
      panchayatId: panchayat.id,
      panchayatCode: panchayat.code,
      panchayatName: panchayat.name,
      panchayatNameMl: panchayat.nameMl,
      panchayatStatus: panchayat.status,
    };
  }

  async revokeCoordinator(actorUserId: string, assignmentId: string): Promise<void> {
    await this.revokeAssignment(actorUserId, assignmentId, Role.COORDINATOR, 'coordinator.revoked');
  }

  // ---- Shared revoke -----------------------------------------------------

  /**
   * Soft-revoke exactly ONE active assignment of the given `role`. Scoping the
   * lookup to `{ id, role, revokedAt: null }` means this endpoint can only
   * touch an ACTIVE assignment of its own kind — never an unrelated role, and
   * never a row already revoked (idempotent 404). Stamps `revokedAt`/
   * `revokedBy`; the User and all other assignments are untouched.
   */
  private async revokeAssignment(
    actorUserId: string,
    assignmentId: string,
    role: Role,
    action: string,
  ): Promise<void> {
    const assignment = await this.prisma.roleAssignment.findFirst({
      where: { id: assignmentId, role, revokedAt: null },
    });
    if (!assignment) {
      throw new ApiError('assignment_not_found', 404, 'errors.assignmentNotFound');
    }
    await this.prisma.roleAssignment.update({
      where: { id: assignmentId },
      data: { revokedAt: new Date(), revokedBy: actorUserId },
    });
    await this.audit.record({
      actorUserId,
      action,
      entityType: 'RoleAssignment',
      entityId: assignmentId,
      metadata: {
        userId: assignment.userId,
        wardId: assignment.wardId,
        panchayatId: assignment.panchayatId,
      },
    });
  }
}
