import { z } from 'zod';
export const subcategoryDTO = z.object({ id: z.string(), name: z.string(), nameMl: z.string() });
export const categoryDTO = z.object({ id: z.string(), slug: z.string(), name: z.string(), nameMl: z.string(), subcategories: z.array(subcategoryDTO) });
export type CategoryDTO = z.infer<typeof categoryDTO>;
