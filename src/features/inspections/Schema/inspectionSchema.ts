import { z } from "zod";

export const createInspectionSchema = z.object({
  vehicleId: z.string().min(1, "Vehicle is required"),
  templateId: z.string().min(1, "Template is required"),
  mileage: z.coerce.number().int().min(0).optional(),
});

export const updateInspectionItemSchema = z.object({
  condition: z.enum(["pass", "fail", "attention", "not_inspected"]).default("not_inspected"),
  notes: z.string().optional(),
  imageUrl: z.string().optional(),
});

export type CreateInspectionInput = z.infer<typeof createInspectionSchema>;
export type UpdateInspectionItemInput = z.infer<typeof updateInspectionItemSchema>;
