import { z } from 'zod';
export const RoleEnum = z.enum(['ADMIN', 'COORDINATOR', 'REPRESENTATIVE', 'CITIZEN']);
export type Role = z.infer<typeof RoleEnum>;
export const STAFF_ROLES: Role[] = ['ADMIN', 'COORDINATOR', 'REPRESENTATIVE'];
export const LanguageEnum = z.enum(['en', 'ml']);
export type Language = z.infer<typeof LanguageEnum>;
export const UserStatusEnum = z.enum(['active', 'disabled']);
export type UserStatus = z.infer<typeof UserStatusEnum>;
