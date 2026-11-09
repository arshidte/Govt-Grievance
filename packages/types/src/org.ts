import { z } from 'zod';

// ---- Read DTOs (reference lookups: citizen wizard + admin lists) ----
// `status` is additive on wardDTO (admin lists show active/inactive; the
// citizen wizard ignores it and only ever receives ACTIVE wards).
export const wardDTO = z.object({
  id: z.string(),
  number: z.number(),
  name: z.string(),
  nameMl: z.string(),
  panchayatId: z.string(),
  status: z.string(),
});
export const panchayatDTO = z.object({
  id: z.string(),
  code: z.string(),
  name: z.string(),
  nameMl: z.string(),
  status: z.string(),
});
export type WardDTO = z.infer<typeof wardDTO>;
export type PanchayatDTO = z.infer<typeof panchayatDTO>;

/** Richer single-panchayat view for the admin detail panel. */
export const panchayatDetailDTO = panchayatDTO.extend({
  contactPhone: z.string().nullable(),
  contactEmail: z.string().nullable(),
  wardCount: z.number(),
  activeWardCount: z.number(),
  createdAt: z.string(),
});
export type PanchayatDetailDTO = z.infer<typeof panchayatDetailDTO>;

// ---- Admin write contracts (Global-Admin only, enforced server-side) ----

/** Shared field validators (trimmed; bilingual names are both required). */
const orgName = z.string().trim().min(1).max(120);
const orgNameMl = z.string().trim().min(1).max(120);
/** Panchayat code: short, URL/display-safe, immutable after creation. */
const panchayatCode = z
  .string()
  .trim()
  .min(2)
  .max(40)
  .regex(/^[A-Za-z0-9-]+$/, 'Code may contain only letters, digits and hyphens');
/** Optional contact fields — accept empty string (cleared) or a valid value. */
const contactPhone = z.string().trim().max(20).optional().or(z.literal(''));
const contactEmail = z.string().trim().email().max(120).optional().or(z.literal(''));

export const createPanchayatSchema = z.object({
  code: panchayatCode,
  name: orgName,
  nameMl: orgNameMl,
  contactPhone,
  contactEmail,
});
export type CreatePanchayatInput = z.infer<typeof createPanchayatSchema>;

/**
 * Update accepts everything EXCEPT `code` — the panchayat code is immutable
 * after creation (agreed product decision), so it is intentionally absent
 * from this schema and the service never reads it on update.
 */
export const updatePanchayatSchema = z.object({
  name: orgName,
  nameMl: orgNameMl,
  contactPhone,
  contactEmail,
});
export type UpdatePanchayatInput = z.infer<typeof updatePanchayatSchema>;

/**
 * Create a ward under a panchayat (the panchayat id comes from the route,
 * never the body). `number` is validated for uniqueness within the panchayat
 * server-side (DB `@@unique([panchayatId, number])`).
 */
export const createWardSchema = z.object({
  number: z.number().int().positive().max(100000),
  name: orgName,
  nameMl: orgNameMl,
});
export type CreateWardInput = z.infer<typeof createWardSchema>;

/** Update a ward. `number` may change (audited); uniqueness re-checked. */
export const updateWardSchema = z.object({
  number: z.number().int().positive().max(100000),
  name: orgName,
  nameMl: orgNameMl,
});
export type UpdateWardInput = z.infer<typeof updateWardSchema>;
