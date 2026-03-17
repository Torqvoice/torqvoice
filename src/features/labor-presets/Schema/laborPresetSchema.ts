import { z } from "zod";

export const laborPresetItemSchema = z.object({
  description: z.string().min(1, "Description is required"),
  hours: z.coerce.number().min(0, "Hours must be 0 or more").default(0),
  rate: z.coerce.number().min(0, "Rate must be 0 or more").default(0),
  sortOrder: z.coerce.number().int().min(0).default(0),
});

export const createLaborPresetSchema = z.object({
  name: z.string().optional(),
  description: z.string().optional(),
  items: z.array(laborPresetItemSchema).min(1, "At least one item is required"),
});

export const updateLaborPresetSchema = createLaborPresetSchema.partial().extend({
  id: z.string(),
});

export type LaborPresetItemInput = z.infer<typeof laborPresetItemSchema>;
export type CreateLaborPresetInput = z.infer<typeof createLaborPresetSchema>;
export type UpdateLaborPresetInput = z.infer<typeof updateLaborPresetSchema>;
