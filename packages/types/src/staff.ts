import { z } from 'zod';

import { phoneSchema } from './auth';

/**
 * Staff organization-management contracts (org-management milestone).
 *
 * Representatives and Coordinators are NOT dedicated models — they are
 * `RoleAssignment` rows (role REPRESENTATIVE scoped to a ward, COORDINATOR
 * scoped to a panchayat). These DTOs/schemas describe the admin-only API for
 * searching users by phone and assigning/revoking those role assignments.
 */

/** Minimal user shape returned by the admin phone search — never sensitive data. */
export interface StaffUserDTO {
  id: string;
  phone: string;
  fullName: string | null;
}

/** One active REPRESENTATIVE assignment (a ward the user represents). */
export interface RepresentativeAssignmentDTO {
  assignmentId: string;
  wardId: string;
  wardNumber: number;
  wardName: string;
  wardNameMl: string;
  wardStatus: string;
  panchayatId: string;
  panchayatName: string;
}

/** A representative = a user with one or more active ward assignments. */
export interface RepresentativeDTO {
  userId: string;
  phone: string;
  fullName: string | null;
  wards: RepresentativeAssignmentDTO[];
}

/** One active COORDINATOR assignment (a panchayat the user coordinates). */
export interface CoordinatorAssignmentDTO {
  assignmentId: string;
  panchayatId: string;
  panchayatCode: string;
  panchayatName: string;
  panchayatNameMl: string;
  panchayatStatus: string;
}

/** A coordinator = a user with one or more active panchayat assignments. */
export interface CoordinatorDTO {
  userId: string;
  phone: string;
  fullName: string | null;
  panchayats: CoordinatorAssignmentDTO[];
}

/** Query to search an existing user by exact phone (for assignment). */
export const staffSearchSchema = z.object({ phone: phoneSchema });
export type StaffSearchInput = z.infer<typeof staffSearchSchema>;

/** Assign an existing user as a REPRESENTATIVE of a ward. */
export const assignRepresentativeSchema = z.object({
  userId: z.string().min(1),
  wardId: z.string().min(1),
});
export type AssignRepresentativeInput = z.infer<typeof assignRepresentativeSchema>;

/** Assign an existing user as a COORDINATOR of a panchayat. */
export const assignCoordinatorSchema = z.object({
  userId: z.string().min(1),
  panchayatId: z.string().min(1),
});
export type AssignCoordinatorInput = z.infer<typeof assignCoordinatorSchema>;
