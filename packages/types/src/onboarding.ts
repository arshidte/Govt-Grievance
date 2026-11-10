import { z } from 'zod';

import { phoneSchema } from './auth';

/**
 * Admin-initiated staff onboarding contracts (staff-onboarding milestone).
 *
 * An admin initiates onboarding for a phone + role + scope(s); the resulting
 * `StaffOnboarding` record stays `pending` (granting NO access) until the
 * staff member's phone ownership is proven by OTP. On verification the user is
 * upserted by phone and one active `RoleAssignment` is created per scope.
 */

/** Only the two assignable staff roles are onboardable (never ADMIN/CITIZEN). */
export const OnboardingRoleEnum = z.enum(['REPRESENTATIVE', 'COORDINATOR']);
export type OnboardingRole = z.infer<typeof OnboardingRoleEnum>;

export const OnboardingStatusEnum = z.enum(['pending', 'verified', 'cancelled', 'expired']);
export type OnboardingStatusValue = z.infer<typeof OnboardingStatusEnum>;

/**
 * Initiate onboarding. REPRESENTATIVE requires one or more `wardIds` (and no
 * panchayat scope); COORDINATOR requires one or more `panchayatIds` (and no
 * ward scope). `userId` is optional — when the admin picked an existing user;
 * otherwise the user is resolved/created by phone at verification time. All
 * scope ids are re-validated (existence + active) server-side; never trusted.
 */
export const initiateOnboardingSchema = z
  .object({
    phone: phoneSchema,
    role: OnboardingRoleEnum,
    userId: z.string().min(1).optional(),
    wardIds: z.array(z.string().min(1)).max(100).optional(),
    panchayatIds: z.array(z.string().min(1)).max(100).optional(),
  })
  .superRefine((val, ctx) => {
    if (val.role === 'REPRESENTATIVE') {
      if (!val.wardIds || val.wardIds.length === 0) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['wardIds'], message: 'ward_required' });
      }
      if (val.panchayatIds && val.panchayatIds.length > 0) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['panchayatIds'], message: 'scope_mismatch' });
      }
    } else {
      if (!val.panchayatIds || val.panchayatIds.length === 0) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['panchayatIds'], message: 'panchayat_required' });
      }
      if (val.wardIds && val.wardIds.length > 0) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['wardIds'], message: 'scope_mismatch' });
      }
    }
  });
export type InitiateOnboardingInput = z.infer<typeof initiateOnboardingSchema>;

/** Verify onboarding OTP (admin enters the code the staff member received). */
export const verifyOnboardingSchema = z.object({
  code: z.string().regex(/^\d{6}$/, 'invalid_code'),
});
export type VerifyOnboardingInput = z.infer<typeof verifyOnboardingSchema>;

/** One resolved scope (a ward or a panchayat) with a display label. */
export interface OnboardingScopeDTO {
  id: string;
  label: string;
  /** Whether the referenced ward/panchayat is currently active. */
  active: boolean;
}

/** Admin-facing view of a staff onboarding record. */
export interface StaffOnboardingDTO {
  id: string;
  phone: string;
  role: OnboardingRole;
  status: OnboardingStatusValue;
  /** Target scopes (wards for REPRESENTATIVE, panchayats for COORDINATOR). */
  scopes: OnboardingScopeDTO[];
  /** Whether a user already exists for this phone (informational, admin-only). */
  userExists: boolean;
  createdAt: string;
  expiresAt: string;
  verifiedAt: string | null;
}
