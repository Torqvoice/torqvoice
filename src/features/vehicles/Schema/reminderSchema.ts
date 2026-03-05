import { z } from "zod";

export const createReminderSchema = z.object({
  vehicleId: z.string(),
  title: z.string().min(1, "Title is required"),
  description: z.string().nullish(),
  dueDate: z.string().nullish(),
  dueMileage: z.preprocess(
    (v) => (v === null || v === undefined || v === "" ? undefined : v),
    z.coerce.number().optional(),
  ),
});

export type CreateReminderInput = z.infer<typeof createReminderSchema>;

export const updateReminderSchema = createReminderSchema.partial().extend({
  id: z.string().min(1),
});

export type UpdateReminderInput = z.infer<typeof updateReminderSchema>;
