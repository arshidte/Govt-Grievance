import { Injectable } from '@nestjs/common';
import type { MeResponse } from '@pg/types';

import { PrismaService } from '../prisma/prisma.service';
import type { SessionUser } from './session.service';

/**
 * Supporting logic for `AuthController` that isn't already owned by
 * `OtpService`/`SessionService`: resolving a verified phone to a `User` row
 * (creating one if needed) and shaping the `MeResponse` DTO.
 */
@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Resolves `phone` (already OTP-verified by the caller) to its `User` row,
   * creating one if this is the phone's first successful verification.
   *
   * GLOBAL CONSTRAINT: self-registration creates a CITIZEN identity ONLY.
   * A brand-new row gets no `RoleAssignment` at all — `roles: []` in the
   * `MeResponse` — never a staff role (ADMIN/COORDINATOR/REPRESENTATIVE).
   * Granting any staff role happens only through an explicit, separately
   * authorized admin action elsewhere in the system, never here.
   *
   * Uses `upsert` keyed on the unique `phone` column so concurrent first-time
   * verifications for the same phone can't create two User rows; the
   * `update: {}` branch is a deliberate no-op for an existing user (we don't
   * want verify-otp to silently mutate an existing profile).
   */
  async findOrCreateCitizenByPhone(phone: string): Promise<SessionUser> {
    const user = await this.prisma.user.upsert({
      where: { phone },
      create: { phone },
      update: {},
      include: { roleAssignments: true },
    });

    return user;
  }

  /** Shapes a resolved user (with role assignments) into the `MeResponse` DTO. */
  toMeResponse(user: SessionUser): MeResponse {
    return {
      id: user.id,
      phone: user.phone,
      fullName: user.fullName,
      email: user.email,
      preferredLanguage: user.preferredLanguage,
      status: user.status,
      roles: user.roleAssignments.map((ra) => ({
        id: ra.id,
        role: ra.role,
        panchayatId: ra.panchayatId,
        wardId: ra.wardId,
      })),
    };
  }
}
