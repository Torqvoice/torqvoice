import { z } from 'zod'

export const METER_NAME_MAX_LENGTH = 60
export const METER_UNIT_MAX_LENGTH = 20

export const createMeterTypeSchema = z.object({
  name: z.string().trim().min(1).max(METER_NAME_MAX_LENGTH),
  unit: z.string().trim().max(METER_UNIT_MAX_LENGTH).default(''),
})

export const updateMeterTypeSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1).max(METER_NAME_MAX_LENGTH).optional(),
  unit: z.string().trim().max(METER_UNIT_MAX_LENGTH).optional(),
  isActive: z.boolean().optional(),
})

/** A reading as typed: the server reads the number, in the person's own decimal mark. */
const typedValue = z.union([z.string().max(32), z.number()])

/** A reading date, YYYY-MM-DD on the workshop's calendar; empty means now. */
const readingDay = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .optional()
  .or(z.literal(''))

export const addVehicleMeterSchema = z.object({
  vehicleId: z.string().min(1),
  meterTypeId: z.string().min(1),
  /** A first reading, when one is typed with it. */
  value: typedValue.optional(),
  readOn: readingDay,
})

export const addMeterReadingSchema = z.object({
  vehicleMeterId: z.string().min(1),
  value: typedValue,
  readOn: readingDay,
})

export const replaceVehicleMeterSchema = z.object({
  vehicleMeterId: z.string().min(1),
  /** What the old meter had reached when it came off. */
  oldEnd: typedValue,
  /** What the new meter showed when it went on. */
  newStart: typedValue,
  readOn: readingDay,
})

export const markMeterReadingSchema = z.object({
  readingId: z.string().min(1),
  wrong: z.boolean(),
})

export const setJobMeterReadingSchema = z.object({
  jobId: z.string().min(1),
  vehicleMeterId: z.string().min(1),
  /** Empty or null takes the job's reading away. */
  value: typedValue.nullable(),
})
