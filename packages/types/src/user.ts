import { z } from 'zod';
import { RoleEnum, LanguageEnum, UserStatusEnum } from './enums';
export const roleAssignmentDTO = z.object({
  id: z.string(), role: RoleEnum,
  panchayatId: z.string().nullable(), wardId: z.string().nullable(),
});
export type RoleAssignmentDTO = z.infer<typeof roleAssignmentDTO>;
export const meResponse = z.object({
  id: z.string(), phone: z.string(), fullName: z.string().nullable(),
  email: z.string().nullable(), preferredLanguage: LanguageEnum,
  status: UserStatusEnum, roles: z.array(roleAssignmentDTO),
});
export type MeResponse = z.infer<typeof meResponse>;
export const updateProfileSchema = z.object({
  fullName: z.string().min(1).max(120),
  email: z.string().email().optional().or(z.literal('')),
  preferredLanguage: LanguageEnum,
  addressLine: z.string().max(240).optional(),
});
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
