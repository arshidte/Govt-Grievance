import { Injectable } from '@nestjs/common';
import { OnboardingStatus, Prisma, Role, type StaffOnboarding } from '@prisma/client';
import type {
  InitiateOnboardingInput,
  OnboardingScopeDTO,
  StaffOnboardingDTO,
} from '@pg/types';

import { AuditService } from '../audit/audit.service';
import { ApiError } from '../common/api-error';
import { env } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';

import { OtpService } from '../auth/otp.service';

/** Dedicated OTP purpose so an onboarding code can never satisfy a login (and vice versa). */
export const ONBOARDING_PURPOSE = 'staff_onboarding';

/**
 * Admin-initiated staff onboarding (staff-onboarding milestone).
 *
 * A `StaffOnboarding` row records the PENDING intent to grant a staff role;
 * no `RoleAssignment` is created until OTP verification, so a pending
 * onboarding grants zero authorization. Verification is admin-driven (the
 * admin enters the OTP the staff member received), after which the user is
 * upserted by phone and one ACTIVE assignment is created per target scope —
 * idempotently, never touching unrelated assignments. All endpoints are
 * Global-Admin-only (enforced by the controller's guard).
 */
@Injectable()
export class StaffOnboardingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly otp: OtpService,
    private readonly audit: AuditService,
  ) {}

  async initiate(actorUserId: string, dto: InitiateOnboardingInput): Promise<StaffOnboardingDTO> {
    const role = dto.role === 'REPRESENTATIVE' ? Role.REPRESENTATIVE : Role.COORDINATOR;
    const wardIds = dto.wardIds ?? [];
    const panchayatIds = dto.panchayatIds ?? [];

    // Validate every target scope exists AND is active (and, for wards, that
    // the parent panchayat is active) BEFORE anything is created.
    if (role === Role.REPRESENTATIVE) {
      await this.assertWardsActive(wardIds);
    } else {
      await this.assertPanchayatsActive(panchayatIds);
    }

    // If an existing user was pinned, it must exist and match the phone.
    if (dto.userId) {
      const user = await this.prisma.user.findUnique({ where: { id: dto.userId } });
      if (!user) throw new ApiError('user_not_found', 404, 'errors.userNotFound');
      if (user.phone !== dto.phone) {
        throw new ApiError('onboarding_phone_mismatch', 409, 'errors.onboardingPhoneMismatch');
      }
    }

    // At most one pending onboarding per phone (DB partial-unique backstops this).
    const existingPending = await this.prisma.staffOnboarding.findFirst({
      where: { phone: dto.phone, status: OnboardingStatus.pending },
    });
    if (existingPending && existingPending.expiresAt > new Date()) {
      throw new ApiError('onboarding_pending_exists', 409, 'errors.onboardingPendingExists');
    }
    // A stale (time-expired) pending row is marked expired so a fresh one can be created.
    if (existingPending) {
      await this.prisma.staffOnboarding.update({
        where: { id: existingPending.id },
        data: { status: OnboardingStatus.expired },
      });
    }

    const existingUser =
      (await this.prisma.user.findUnique({ where: { phone: dto.phone } })) ?? null;

    let onboarding: StaffOnboarding;
    try {
      onboarding = await this.prisma.staffOnboarding.create({
        data: {
          phone: dto.phone,
          userId: dto.userId ?? existingUser?.id ?? null,
          role,
          wardIds: role === Role.REPRESENTATIVE ? wardIds : [],
          panchayatIds: role === Role.COORDINATOR ? panchayatIds : [],
          status: OnboardingStatus.pending,
          expiresAt: new Date(Date.now() + env.OTP_TTL_SECONDS * 1000),
          createdBy: actorUserId,
        },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ApiError('onboarding_pending_exists', 409, 'errors.onboardingPendingExists');
      }
      throw err;
    }

    // Send the onboarding OTP (purpose-scoped; rate-limited per phone+purpose).
    await this.otp.request(dto.phone, ONBOARDING_PURPOSE);

    await this.audit.record({
      actorUserId,
      action: 'staff.onboarding_initiated',
      entityType: 'StaffOnboarding',
      entityId: onboarding.id,
      metadata: { role, scopeCount: role === Role.REPRESENTATIVE ? wardIds.length : panchayatIds.length },
    });

    return this.toDTO(onboarding);
  }

  async resend(actorUserId: string, id: string): Promise<StaffOnboardingDTO> {
    const onboarding = await this.getPendingOrThrow(id);

    // Resend cooldown: block if the last onboarding challenge for this phone
    // was sent within the cooldown window.
    const lastChallenge = await this.prisma.otpChallenge.findFirst({
      where: { phone: onboarding.phone, purpose: ONBOARDING_PURPOSE },
      orderBy: { createdAt: 'desc' },
    });
    if (lastChallenge) {
      const availableAt = new Date(
        lastChallenge.createdAt.getTime() + env.OTP_RESEND_COOLDOWN_SECONDS * 1000,
      );
      if (availableAt > new Date()) {
        throw new ApiError('resend_cooldown', 429, 'errors.resendCooldown');
      }
    }

    await this.otp.request(onboarding.phone, ONBOARDING_PURPOSE);
    const updated = await this.prisma.staffOnboarding.update({
      where: { id },
      data: { expiresAt: new Date(Date.now() + env.OTP_TTL_SECONDS * 1000) },
    });
    await this.audit.record({
      actorUserId,
      action: 'staff.onboarding_resent',
      entityType: 'StaffOnboarding',
      entityId: id,
    });
    return this.toDTO(updated);
  }

  async verify(actorUserId: string, id: string, code: string): Promise<StaffOnboardingDTO> {
    const onboarding = await this.prisma.staffOnboarding.findUnique({ where: { id } });
    if (!onboarding) throw new ApiError('onboarding_not_found', 404, 'errors.onboardingNotFound');

    // Idempotent: a verified onboarding simply returns its state (no re-grant).
    if (onboarding.status === OnboardingStatus.verified) {
      return this.toDTO(onboarding);
    }
    if (onboarding.status !== OnboardingStatus.pending || onboarding.expiresAt <= new Date()) {
      // Mark a time-expired pending row as expired for clarity.
      if (onboarding.status === OnboardingStatus.pending) {
        await this.prisma.staffOnboarding.update({
          where: { id },
          data: { status: OnboardingStatus.expired },
        });
      }
      throw new ApiError('onboarding_not_pending', 409, 'errors.onboardingNotPending');
    }

    // Verify the OTP (purpose-scoped). Throws a uniform invalid_otp on failure;
    // consumes the challenge on success (replay-safe).
    await this.otp.verify(onboarding.phone, code, ONBOARDING_PURPOSE);

    // Re-validate the target scopes are STILL active at activation time.
    if (onboarding.role === Role.REPRESENTATIVE) {
      await this.assertWardsActive(onboarding.wardIds);
    } else {
      await this.assertPanchayatsActive(onboarding.panchayatIds);
    }

    const scopeIds =
      onboarding.role === Role.REPRESENTATIVE ? onboarding.wardIds : onboarding.panchayatIds;

    const createdAssignmentIds = await this.prisma.$transaction(async (tx) => {
      // Upsert the user by phone (resolve existing or create the account now).
      const user = await tx.user.upsert({
        where: { phone: onboarding.phone },
        create: { phone: onboarding.phone },
        update: {},
      });

      const ids: string[] = [];
      for (const scopeId of scopeIds) {
        const where =
          onboarding.role === Role.REPRESENTATIVE
            ? { userId: user.id, role: Role.REPRESENTATIVE, wardId: scopeId, revokedAt: null }
            : { userId: user.id, role: Role.COORDINATOR, panchayatId: scopeId, revokedAt: null };
        // Idempotent: skip if an active assignment already exists for this scope.
        const existing = await tx.roleAssignment.findFirst({ where });
        if (existing) continue;
        const created = await tx.roleAssignment.create({
          data:
            onboarding.role === Role.REPRESENTATIVE
              ? { userId: user.id, role: Role.REPRESENTATIVE, wardId: scopeId, grantedBy: actorUserId }
              : { userId: user.id, role: Role.COORDINATOR, panchayatId: scopeId, grantedBy: actorUserId },
        });
        ids.push(created.id);
      }

      await tx.staffOnboarding.update({
        where: { id },
        data: { status: OnboardingStatus.verified, verifiedAt: new Date(), userId: user.id },
      });
      return ids;
    });

    await this.audit.record({
      actorUserId,
      action: 'staff.onboarding_verified',
      entityType: 'StaffOnboarding',
      entityId: id,
      metadata: {
        role: onboarding.role,
        assignmentsCreated: createdAssignmentIds.length,
        scopeCount: scopeIds.length,
      },
    });
    for (const assignmentId of createdAssignmentIds) {
      await this.audit.record({
        actorUserId,
        action:
          onboarding.role === Role.REPRESENTATIVE ? 'representative.assigned' : 'coordinator.assigned',
        entityType: 'RoleAssignment',
        entityId: assignmentId,
        metadata: { viaOnboarding: id },
      });
    }

    const refreshed = await this.prisma.staffOnboarding.findUnique({ where: { id } });
    return this.toDTO(refreshed!);
  }

  async cancel(actorUserId: string, id: string): Promise<StaffOnboardingDTO> {
    const onboarding = await this.getPendingOrThrow(id);
    const updated = await this.prisma.staffOnboarding.update({
      where: { id },
      data: { status: OnboardingStatus.cancelled, cancelledAt: new Date() },
    });
    await this.audit.record({
      actorUserId,
      action: 'staff.onboarding_cancelled',
      entityType: 'StaffOnboarding',
      entityId: id,
    });
    return this.toDTO(updated);
  }

  /** List onboardings, newest first. Optional status filter (e.g. pending). */
  async list(status?: OnboardingStatus): Promise<StaffOnboardingDTO[]> {
    const rows = await this.prisma.staffOnboarding.findMany({
      where: status ? { status } : undefined,
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return Promise.all(rows.map((r) => this.toDTO(r)));
  }

  async get(id: string): Promise<StaffOnboardingDTO> {
    const row = await this.prisma.staffOnboarding.findUnique({ where: { id } });
    if (!row) throw new ApiError('onboarding_not_found', 404, 'errors.onboardingNotFound');
    return this.toDTO(row);
  }

  // ---- helpers -----------------------------------------------------------

  private async getPendingOrThrow(id: string): Promise<StaffOnboarding> {
    const onboarding = await this.prisma.staffOnboarding.findUnique({ where: { id } });
    if (!onboarding) throw new ApiError('onboarding_not_found', 404, 'errors.onboardingNotFound');
    if (onboarding.status !== OnboardingStatus.pending) {
      throw new ApiError('onboarding_not_pending', 409, 'errors.onboardingNotPending');
    }
    return onboarding;
  }

  private async assertWardsActive(wardIds: string[]): Promise<void> {
    if (wardIds.length === 0) throw new ApiError('scope_required', 422, 'errors.scopeRequired');
    const wards = await this.prisma.ward.findMany({
      where: { id: { in: wardIds } },
      include: { panchayat: true },
    });
    if (wards.length !== wardIds.length) {
      throw new ApiError('ward_not_found', 404, 'errors.wardNotFound');
    }
    for (const w of wards) {
      if (w.status !== 'active') throw new ApiError('ward_inactive', 409, 'errors.wardInactive');
      if (w.panchayat.status !== 'active') {
        throw new ApiError('panchayat_inactive', 409, 'errors.panchayatInactive');
      }
    }
  }

  private async assertPanchayatsActive(panchayatIds: string[]): Promise<void> {
    if (panchayatIds.length === 0) throw new ApiError('scope_required', 422, 'errors.scopeRequired');
    const panchayats = await this.prisma.panchayat.findMany({ where: { id: { in: panchayatIds } } });
    if (panchayats.length !== panchayatIds.length) {
      throw new ApiError('panchayat_not_found', 404, 'errors.panchayatNotFound');
    }
    for (const p of panchayats) {
      if (p.status !== 'active') throw new ApiError('panchayat_inactive', 409, 'errors.panchayatInactive');
    }
  }

  private async toDTO(o: StaffOnboarding): Promise<StaffOnboardingDTO> {
    const now = new Date();
    // Derive expiry lazily for display (a pending row past its window is expired).
    const status: StaffOnboardingDTO['status'] =
      o.status === OnboardingStatus.pending && o.expiresAt <= now ? 'expired' : o.status;

    const scopes = await this.buildScopes(o);

    const userExists = o.userId
      ? true
      : (await this.prisma.user.count({ where: { phone: o.phone } })) > 0;

    return {
      id: o.id,
      phone: o.phone,
      role: o.role === Role.REPRESENTATIVE ? 'REPRESENTATIVE' : 'COORDINATOR',
      status,
      scopes,
      userExists,
      createdAt: o.createdAt.toISOString(),
      expiresAt: o.expiresAt.toISOString(),
      verifiedAt: o.verifiedAt ? o.verifiedAt.toISOString() : null,
    };
  }

  private async buildScopes(o: StaffOnboarding): Promise<OnboardingScopeDTO[]> {
    if (o.role === Role.REPRESENTATIVE) {
      const wards = await this.prisma.ward.findMany({
        where: { id: { in: o.wardIds } },
        include: { panchayat: true },
      });
      return wards.map((w) => ({
        id: w.id,
        label: `Ward ${w.number} — ${w.name} (${w.panchayat.name})`,
        active: w.status === 'active' && w.panchayat.status === 'active',
      }));
    }
    const panchayats = await this.prisma.panchayat.findMany({ where: { id: { in: o.panchayatIds } } });
    return panchayats.map((p) => ({
      id: p.id,
      label: `${p.code} — ${p.name}`,
      active: p.status === 'active',
    }));
  }
}
