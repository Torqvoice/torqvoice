import { z } from 'zod'
import { STAGES, STATUS_COLORS } from '../Lib/stages'

export const workOrderStatusSchema = z.object({
  name: z.string().trim().min(1, 'Give the status a name').max(40),
  stage: z.enum(STAGES),
  color: z.enum(STATUS_COLORS).default('slate'),
  notifyCustomer: z.boolean().default(false),
  messageTemplate: z.string().trim().max(600).optional().or(z.literal('')),
})

export const updateWorkOrderStatusSchema = workOrderStatusSchema.extend({
  id: z.string().min(1),
})

export const reorderWorkOrderStatusesSchema = z.object({
  stage: z.enum(STAGES),
  /** Every status of the stage, in the order they should be listed. */
  ids: z.array(z.string().min(1)).max(50),
})

export type WorkOrderStatusInput = z.infer<typeof workOrderStatusSchema>
