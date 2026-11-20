import { z } from 'zod'
import { isDayKey, parseManufacture } from '../Lib/equipmentDays'

export const EQUIPMENT_TYPE_NAME_MAX = 60
export const EQUIPMENT_TEXT_MAX = 120
export const EQUIPMENT_NOTES_MAX = 2000
/** "Work on": how many items one job or quote can point at. */
export const MAX_WORK_ON = 50

export const createEquipmentTypeSchema = z.object({
  name: z.string().trim().min(1).max(EQUIPMENT_TYPE_NAME_MAX),
})

export const updateEquipmentTypeSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1).max(EQUIPMENT_TYPE_NAME_MAX).optional(),
  isActive: z.boolean().optional(),
})

export const reorderEquipmentTypesSchema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(500),
})

/** Optional text: empty is nothing. */
const text = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => (value === '' ? null : value))
    .nullable()
    .optional()

/** A calendar day ("2026-11-20"), or empty for none. */
const day = z
  .string()
  .trim()
  .refine((value) => value === '' || isDayKey(value), 'Not a date')
  .transform((value) => (value === '' ? null : value))
  .nullable()
  .optional()

/** A year alone or a full day, as the plate gives it; empty for none. */
const manufacture = z
  .string()
  .trim()
  .max(10)
  .refine((value) => value === '' || parseManufacture(value) !== null, 'Not a year or a date')
  .transform((value) => (value === '' ? null : value))
  .nullable()
  .optional()

/** The report file as the upload route stored it. */
const report = z
  .object({
    url: z.string().min(1).max(500),
    name: z.string().trim().min(1).max(200),
  })
  .nullable()
  .optional()

export const equipmentItemFields = z.object({
  typeId: z.string().min(1),
  make: text(EQUIPMENT_TEXT_MAX),
  model: text(EQUIPMENT_TEXT_MAX),
  serialNumber: text(EQUIPMENT_TEXT_MAX),
  manufacture,
  installDate: day,
  notes: text(EQUIPMENT_NOTES_MAX),
  ratedCapacity: text(EQUIPMENT_TEXT_MAX),
  nextExaminationDue: day,
  lastExaminedAt: day,
  certificateReference: text(EQUIPMENT_TEXT_MAX),
  report,
})

export const addEquipmentItemSchema = equipmentItemFields.extend({
  vehicleId: z.string().min(1),
})

export const updateEquipmentItemSchema = equipmentItemFields.extend({
  id: z.string().min(1),
})

export const moveEquipmentItemSchema = z.object({
  id: z.string().min(1),
  vehicleId: z.string().min(1),
})

export const setWorkOnSchema = z.object({
  /** The job or quote. */
  id: z.string().min(1),
  itemIds: z.array(z.string().min(1)).max(MAX_WORK_ON),
})

export const addEquipmentMeterSchema = z.object({
  equipmentItemId: z.string().min(1),
  meterTypeId: z.string().min(1),
  value: z.union([z.string().max(32), z.number()]).optional(),
  readOn: z
    .string()
    .refine((value) => value === '' || isDayKey(value), 'Not a date')
    .optional(),
})

export type EquipmentItemInput = z.input<typeof equipmentItemFields>
