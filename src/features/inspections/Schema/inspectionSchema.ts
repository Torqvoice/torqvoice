import { z } from "zod";

export const createInspectionSchema = z.object({
  vehicleId: z.string().min(1, "Vehicle is required"),
  templateId: z.string().min(1, "Template is required"),
  mileage: z.coerce.number().int().min(0).optional(),
});

export const updateInspectionItemSchema = z.object({
  // "attention" is the EU minor category and "fail" the major one; see
  // Lib/conditions.ts for why the stored names differ from the EU wording.
  condition: z
    .enum(["pass", "fail", "attention", "dangerous", "not_inspected"])
    .default("not_inspected"),
  notes: z.string().optional(),
  imageUrls: z.array(z.string()).optional(),
  measuredValue: z.number().nullable().optional(),
  textValue: z.string().nullable().optional(),
});

/** Roadworthiness certificate fields — Directive 2014/45/EU Annex IV. */
export const updateInspectionDetailsSchema = z.object({
  mileage: z.coerce.number().int().min(0).nullable().optional(),
  vehicleCategory: z.string().max(10).nullable().optional(),
  certificateNumber: z.string().max(64).nullable().optional(),
  inspectorName: z.string().max(120).nullable().optional(),
  testLocation: z.string().max(200).nullable().optional(),
  nextTestDue: z.coerce.date().nullable().optional(),
  notes: z.string().max(5000).nullable().optional(),
});

export type CreateInspectionInput = z.infer<typeof createInspectionSchema>;
export type UpdateInspectionItemInput = z.infer<typeof updateInspectionItemSchema>;
export type UpdateInspectionDetailsInput = z.infer<typeof updateInspectionDetailsSchema>;
