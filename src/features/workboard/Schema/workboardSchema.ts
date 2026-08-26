import { z } from 'zod'

const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Must be a valid hex color')

export const createTechnicianSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  color: hexColor.default('#3b82f6'),
  userId: z.string().optional(),
})

export const updateTechnicianSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1, 'Name is required').max(100).optional(),
  color: hexColor.optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().min(0).optional(),
  dailyCapacity: z.number().int().min(60).max(720).optional(),
  userId: z.string().nullable().optional(),
})

export const createWorkBaySchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  color: hexColor.default('#64748b'),
  dailyCapacity: z.number().int().min(60).max(1440).optional(),
})

export const updateWorkBaySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1, 'Name is required').max(100).optional(),
  color: hexColor.optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().min(0).optional(),
  dailyCapacity: z.number().int().min(60).max(1440).optional(),
})

export const deleteWorkBaySchema = z.object({
  id: z.string().min(1),
})

export const assignTechnicianSchema = z.object({
  id: z.string().min(1),
  technicianId: z.string().min(1),
  type: z.enum(['serviceRecord', 'inspection']),
  startDateTime: z.coerce.date().optional(),
  endDateTime: z.coerce.date().optional(),
})

export const moveJobSchema = z.object({
  id: z.string().min(1),
  technicianId: z.string().min(1),
  sortOrder: z.number().int().min(0).default(0),
  type: z.enum(['serviceRecord', 'inspection']),
})

export const unassignJobSchema = z.object({
  id: z.string().min(1),
  type: z.enum(['serviceRecord', 'inspection']),
})

export const updateServiceTimesSchema = z.object({
  id: z.string().min(1),
  startDateTime: z.coerce.date(),
  endDateTime: z.coerce.date(),
})

/**
 * One write for everything a board drag can change: which lane the job sits in
 * and when it runs. Dragging used to fire `moveJob` and `updateServiceTimes`
 * back to back, which meant two round trips, two websocket events, and a window
 * where other viewers saw the job in its new lane at its old time.
 *
 * Every field is optional and `null` is meaningful: omit to leave a field
 * alone, pass `null` to clear it (drop a job out of a lane without unassigning
 * it from the other grouping).
 */
export const scheduleJobSchema = z
  .object({
    id: z.string().min(1),
    type: z.enum(['serviceRecord', 'inspection']),
    technicianId: z.string().min(1).nullable().optional(),
    workBayId: z.string().min(1).nullable().optional(),
    startDateTime: z.coerce.date().optional(),
    endDateTime: z.coerce.date().optional(),
    sortOrder: z.number().int().min(0).optional(),
  })
  .refine((d) => (d.startDateTime === undefined) === (d.endDateTime === undefined), {
    message: 'Start and end must be given together',
    path: ['endDateTime'],
  })
  .refine(
    (d) =>
      d.startDateTime === undefined ||
      d.endDateTime === undefined ||
      d.endDateTime > d.startDateTime,
    { message: 'End time must be after start time', path: ['endDateTime'] }
  )

export type CreateTechnicianInput = z.infer<typeof createTechnicianSchema>
export type UpdateTechnicianInput = z.infer<typeof updateTechnicianSchema>
export type CreateWorkBayInput = z.infer<typeof createWorkBaySchema>
export type UpdateWorkBayInput = z.infer<typeof updateWorkBaySchema>
export type AssignTechnicianInput = z.infer<typeof assignTechnicianSchema>
export type MoveJobInput = z.infer<typeof moveJobSchema>
export type UnassignJobInput = z.infer<typeof unassignJobSchema>
export type UpdateServiceTimesInput = z.infer<typeof updateServiceTimesSchema>
export type ScheduleJobInput = z.infer<typeof scheduleJobSchema>
