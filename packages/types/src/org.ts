import { z } from 'zod';
export const wardDTO = z.object({ id: z.string(), number: z.number(), name: z.string(), nameMl: z.string(), panchayatId: z.string() });
export const panchayatDTO = z.object({ id: z.string(), code: z.string(), name: z.string(), nameMl: z.string(), status: z.string() });
export type WardDTO = z.infer<typeof wardDTO>;
export type PanchayatDTO = z.infer<typeof panchayatDTO>;
