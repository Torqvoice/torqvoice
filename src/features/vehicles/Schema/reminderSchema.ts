import { z } from 'zod'

export const createReminderSchema = z.object({
  // A reminder relates to a vehicle, a customer, or just the workshop (both null)
  vehicleId: z.string().nullable().optional(),
  customerId: z.string().nullable().optional(),
  title: z.string().min(1, 'Title is required'),
  description: z.string().optional(),
  dueDate: z.string().optional(),
  dueMileage: z.coerce.number().nullable().optional(),
  // How the workshop wants to be notified when the reminder comes due
  notifyInApp: z.boolean().optional(),
  notifyEmail: z.boolean().optional(),
})

export type CreateReminderInput = z.infer<typeof createReminderSchema>

export const updateReminderSchema = createReminderSchema.partial().extend({
  id: z.string().min(1),
})

export type UpdateReminderInput = z.infer<typeof updateReminderSchema>
