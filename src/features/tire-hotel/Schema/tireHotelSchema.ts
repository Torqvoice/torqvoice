import { z } from 'zod'
import {
  TIRE_CONDITIONS,
  TIRE_MOVEMENT_TYPES,
  TIRE_POSITIONS,
  TIRE_SEASONS,
  TIRE_SET_STATUSES,
} from '../Lib/tireConstants'
import { CHARGE_TARGETS, STORAGE_AGREEMENT_STATUSES, STORAGE_BILLING_MODELS } from '../Lib/billing'
import { TREATMENT_TYPES } from '../Lib/treatments'

const optionalText = z.string().trim().max(200).optional().or(z.literal(''))

export const warehouseSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(120),
  address: optionalText,
  notes: z.string().trim().max(2000).optional().or(z.literal('')),
  isDefault: z.boolean().optional(),
})

export const updateWarehouseSchema = warehouseSchema.partial().extend({
  id: z.string().min(1),
})

export const locationSchema = z
  .object({
    warehouseId: z.string().min(1, 'Warehouse is required'),
    /// Optional: derived from zone/rack/shelf/position when left blank.
    code: z.string().trim().max(40).optional().or(z.literal('')),
    zone: optionalText,
    rack: optionalText,
    shelf: optionalText,
    position: optionalText,
    capacity: z.coerce.number().int().min(0, 'Capacity cannot be negative').max(10000),
    notes: z.string().trim().max(1000).optional().or(z.literal('')),
  })
  .refine(
    (v) =>
      !!(
        v.code?.trim() ||
        v.zone?.trim() ||
        v.rack?.trim() ||
        v.shelf?.trim() ||
        v.position?.trim()
      ),
    {
      message: 'Give the location a code or fill in at least one of zone, rack, shelf, or position',
      path: ['code'],
    }
  )

export const updateLocationSchema = z.object({
  id: z.string().min(1),
  code: z.string().trim().max(40).optional().or(z.literal('')),
  zone: optionalText,
  rack: optionalText,
  shelf: optionalText,
  position: optionalText,
  capacity: z.coerce.number().int().min(0).max(10000).optional(),
  notes: z.string().trim().max(1000).optional().or(z.literal('')),
  isArchived: z.boolean().optional(),
})

/**
 * Bulk shelf creation. Filling a warehouse one shelf at a time is the single
 * most tedious part of setting the module up, so a rack of twelve shelves is
 * one form submission rather than twelve.
 */
export const bulkLocationSchema = z
  .object({
    warehouseId: z.string().min(1),
    zone: optionalText,
    rack: optionalText,
    /// Shelves are numbered from `shelfFrom` to `shelfTo` inclusive.
    shelfFrom: z.coerce.number().int().min(0).max(999),
    shelfTo: z.coerce.number().int().min(0).max(999),
    capacity: z.coerce.number().int().min(0).max(10000),
  })
  .refine((v) => v.shelfTo >= v.shelfFrom, {
    message: 'The last shelf number must not be lower than the first',
    path: ['shelfTo'],
  })

export const measurementSchema = z.object({
  position: z.enum(TIRE_POSITIONS).default('unspecified'),
  /// Entered in the workshop's display unit and normalised to mm before it
  /// reaches this schema.
  treadDepthMm: z.coerce.number().min(0).max(50).nullable().optional(),
  pressureBar: z.coerce.number().min(0).max(20).nullable().optional(),
  condition: z.enum(TIRE_CONDITIONS).default('good'),
  damage: z.string().trim().max(500).optional().or(z.literal('')),
  notes: z.string().trim().max(500).optional().or(z.literal('')),
})

export const tireSetSchema = z.object({
  vehicleId: z.string().min(1).optional().nullable(),
  customerId: z.string().min(1).optional().nullable(),
  season: z.enum(TIRE_SEASONS).default('summer'),
  studded: z.boolean().optional(),
  brand: optionalText,
  model: optionalText,
  size: z.string().trim().max(60).optional().or(z.literal('')),
  dotCode: z.string().trim().max(30).optional().or(z.literal('')),
  loadSpeedIndex: z.string().trim().max(20).optional().or(z.literal('')),
  withRims: z.boolean().optional(),
  rimType: optionalText,
  hasTpms: z.boolean().optional(),
  quantity: z.coerce.number().int().min(1, 'A set needs at least one tire').max(20),
  notes: z.string().trim().max(2000).optional().or(z.literal('')),
  locationId: z.string().min(1).optional().nullable(),
  measurements: z.array(measurementSchema).max(20).optional(),
  /// Prep work the set needs. Replaces the list wholesale.
  treatments: z.array(z.enum(TREATMENT_TYPES)).max(TREATMENT_TYPES.length).optional(),
})

export const updateTireSetSchema = tireSetSchema.partial().extend({
  id: z.string().min(1),
  status: z.enum(TIRE_SET_STATUSES).optional(),
})

export const checkInSchema = tireSetSchema.extend({
  /// Required on check-in: a set that arrives has to land somewhere.
  locationId: z.string().min(1, 'Choose where the tires go'),
  note: z.string().trim().max(500).optional().or(z.literal('')),
  /// The job the tires arrived on, when check-in was started from one. Links
  /// the new set to that work order so the technician sees the shelf without
  /// anyone going looking for it.
  serviceRecordId: z.string().min(1).optional().nullable(),
})

export const checkOutSchema = z.object({
  id: z.string().min(1),
  note: z.string().trim().max(500).optional().or(z.literal('')),
  measurements: z.array(measurementSchema).max(20).optional(),
})

export const relocateSchema = z.object({
  id: z.string().min(1),
  toLocationId: z.string().min(1, 'Choose the new location'),
  note: z.string().trim().max(500).optional().or(z.literal('')),
})

export const movementSchema = z.object({
  tireSetId: z.string().min(1),
  type: z.enum(TIRE_MOVEMENT_TYPES),
  note: z.string().trim().max(500).optional().or(z.literal('')),
})

const extraSchema = z.object({
  label: z.string().trim().min(1).max(80),
  price: z.coerce.number().min(0).max(1_000_000),
})

export const agreementSchema = z.object({
  tireSetId: z.string().min(1),
  customerId: z.string().min(1).optional().nullable(),
  billingModel: z.enum(STORAGE_BILLING_MODELS).default('seasonal'),
  price: z.coerce.number().min(0, 'Price cannot be negative').max(1_000_000),
  extras: z.array(extraSchema).max(20).optional(),
  startDate: z.coerce.date(),
  endDate: z.coerce.date().optional().nullable(),
  autoRenew: z.boolean().optional(),
  notes: z.string().trim().max(2000).optional().or(z.literal('')),
})

export const updateAgreementSchema = agreementSchema
  .omit({ tireSetId: true })
  .partial()
  .extend({
    id: z.string().min(1),
    status: z.enum(STORAGE_AGREEMENT_STATUSES).optional(),
  })

/**
 * A storage fee raised by hand, with no agreement behind it.
 *
 * The period is still recorded because it prints on the invoice line and
 * answers "what was this for" a year later, but nothing renews it and nothing
 * raises the next one.
 */
export const oneOffChargeSchema = z
  .object({
    tireSetId: z.string().min(1),
    amount: z.coerce.number().min(0, 'Price cannot be negative').max(1_000_000),
    periodStart: z.coerce.date(),
    periodEnd: z.coerce.date(),
  })
  .refine((v) => v.periodEnd >= v.periodStart, {
    message: 'The period cannot end before it starts',
    path: ['periodEnd'],
  })

export const invoiceChargeSchema = z
  .object({
    chargeId: z.string().min(1),
    target: z.enum(CHARGE_TARGETS).default('new_invoice'),
    /// The job to append to. Only meaningful when target is `existing`.
    serviceRecordId: z.string().min(1).optional().nullable(),
  })
  .refine((v) => v.target !== 'existing' || !!v.serviceRecordId, {
    message: 'Choose which job to add the line to',
    path: ['serviceRecordId'],
  })

export type AgreementInput = z.infer<typeof agreementSchema>
export type OneOffChargeInput = z.infer<typeof oneOffChargeSchema>
export type ExtraInput = z.infer<typeof extraSchema>

export type WarehouseInput = z.infer<typeof warehouseSchema>
export type LocationInput = z.infer<typeof locationSchema>
export type BulkLocationInput = z.infer<typeof bulkLocationSchema>
export type TireSetInput = z.infer<typeof tireSetSchema>
export type CheckInInput = z.infer<typeof checkInSchema>
export type CheckOutInput = z.infer<typeof checkOutSchema>
export type MeasurementInput = z.infer<typeof measurementSchema>
