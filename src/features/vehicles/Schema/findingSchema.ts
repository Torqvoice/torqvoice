import { z } from 'zod'

export const createFindingSchema = z.object({
  vehicleId: z.string().min(1),
  description: z.string().min(1, 'Description is required'),
  severity: z.enum(['needs_work', 'monitor', 'urgent']).default('needs_work'),
  notes: z.string().optional(),
  serviceRecordId: z.string().optional(),
  /**
   * The customer concern this finding answers.
   *
   * Nullable rather than absent, because "this answers nothing the customer
   * asked about" is a real answer: it is the perished bush somebody spotted
   * while the car was on the lift, and it is worth just as much.
   */
  concernId: z.string().nullish(),
})

export type CreateFindingInput = z.infer<typeof createFindingSchema>

export const updateFindingSchema = createFindingSchema.partial().extend({
  id: z.string().min(1),
})

export type UpdateFindingInput = z.infer<typeof updateFindingSchema>

export const resolveFindingSchema = z.object({
  id: z.string().min(1),
  resolvedServiceRecordId: z.string().optional(),
})

export type ResolveFindingInput = z.infer<typeof resolveFindingSchema>
