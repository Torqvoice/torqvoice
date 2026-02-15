import { z } from "zod";

export const createNoteSchema = z.object({
  vehicleId: z.string(),
  title: z.string().min(1, "Title is required"),
  content: z.string().min(1, "Content is required"),
  isPinned: z.boolean().default(false),
});

export const updateNoteSchema = createNoteSchema.partial().extend({
  id: z.string(),
});

export type CreateNoteInput = z.infer<typeof createNoteSchema>;
export type UpdateNoteInput = z.infer<typeof updateNoteSchema>;
