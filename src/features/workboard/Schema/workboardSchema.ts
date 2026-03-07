import { z } from "zod";

export const createTechnicianSchema = z.object({
  name: z.string().min(1, "Name is required").max(100),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "Must be a valid hex color")
    .default("#3b82f6"),
  memberId: z.string().optional(),
});

export const updateTechnicianSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1, "Name is required").max(100).optional(),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "Must be a valid hex color")
    .optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().min(0).optional(),
  dailyCapacity: z.number().int().min(60).max(720).optional(),
  memberId: z.string().nullable().optional(),
});

export const assignTechnicianSchema = z.object({
  id: z.string().min(1),
  technicianId: z.string().min(1),
  type: z.enum(["serviceRecord", "inspection"]),
});

export const moveJobSchema = z.object({
  id: z.string().min(1),
  technicianId: z.string().min(1),
  sortOrder: z.number().int().min(0).default(0),
  type: z.enum(["serviceRecord", "inspection"]),
});

export const unassignJobSchema = z.object({
  id: z.string().min(1),
  type: z.enum(["serviceRecord", "inspection"]),
});

export const updateServiceTimesSchema = z.object({
  id: z.string().min(1),
  startDateTime: z.coerce.date(),
  endDateTime: z.coerce.date(),
});

export type CreateTechnicianInput = z.infer<typeof createTechnicianSchema>;
export type UpdateTechnicianInput = z.infer<typeof updateTechnicianSchema>;
export type AssignTechnicianInput = z.infer<typeof assignTechnicianSchema>;
export type MoveJobInput = z.infer<typeof moveJobSchema>;
export type UnassignJobInput = z.infer<typeof unassignJobSchema>;
export type UpdateServiceTimesInput = z.infer<typeof updateServiceTimesSchema>;
