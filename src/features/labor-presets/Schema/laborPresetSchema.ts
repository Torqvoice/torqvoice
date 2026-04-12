import { z } from "zod";

export const laborPresetItemSchema = z.object({
  description: z.string().min(1, "Description is required"),
  hours: z.coerce.number().min(0, "Hours must be 0 or more").default(0),
  rate: z.coerce.number().min(0, "Rate must be 0 or more").default(0),
  pricingType: z.enum(["hourly", "service"]).default("hourly"),
  sortOrder: z.coerce.number().int().min(0).default(0),
});

export const laborPresetPartSchema = z.object({
  name: z.string().min(1, "Part name is required"),
  partNumber: z.string().optional(),
  quantity: z.coerce.number().min(0, "Quantity must be 0 or more").default(1),
  unitPrice: z.coerce.number().min(0, "Price must be 0 or more").default(0),
  inventoryPartId: z.string().optional(),
  sortOrder: z.coerce.number().int().min(0).default(0),
});

export type LaborPresetPartInput = z.infer<typeof laborPresetPartSchema>;

export const createLaborPresetSchema = z.object({
  name: z.string().optional(),
  description: z.string().optional(),
  items: z.array(laborPresetItemSchema).min(1, "At least one item is required"),
  parts: z.array(laborPresetPartSchema).optional().default([]),
});

export const updateLaborPresetSchema = createLaborPresetSchema.partial().extend({
  id: z.string(),
});

export type LaborPresetItemInput = z.infer<typeof laborPresetItemSchema>;
export type CreateLaborPresetInput = z.infer<typeof createLaborPresetSchema>;
export type UpdateLaborPresetInput = z.infer<typeof updateLaborPresetSchema>;
