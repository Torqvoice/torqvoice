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
  memberId: z.string().nullable().optional(),
});

export const createBoardAssignmentSchema = z.object({
  date: z.string().min(1, "Date is required"),
  technicianId: z.string().min(1, "Technician is required"),
  serviceRecordId: z.string().optional(),
  inspectionId: z.string().optional(),
  notes: z.string().optional(),
  sortOrder: z.number().int().min(0).default(0),
});

export const moveAssignmentSchema = z.object({
  id: z.string().min(1),
  technicianId: z.string().min(1),
  date: z.string().min(1),
  sortOrder: z.number().int().min(0).default(0),
});

export const removeAssignmentSchema = z.object({
  id: z.string().min(1),
});

export type CreateTechnicianInput = z.infer<typeof createTechnicianSchema>;
export type UpdateTechnicianInput = z.infer<typeof updateTechnicianSchema>;
export type CreateBoardAssignmentInput = z.infer<typeof createBoardAssignmentSchema>;
export type MoveAssignmentInput = z.infer<typeof moveAssignmentSchema>;
