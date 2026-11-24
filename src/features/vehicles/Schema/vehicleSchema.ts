import { z } from 'zod'
import { NAME_MAX_LENGTH, READING_MAX, SHORT_TEXT_MAX_LENGTH } from '@/lib/input-limits'
import { FLEET_NUMBER_MAX_LENGTH } from '../Lib/fleetNumber'
import { optionalUploadUrlSchema } from '@/lib/upload-url'
import { registryLookupSchema } from '../Lib/registryLookup'
import { HSN_PATTERN, normalizeHsn, normalizeTsn, TSN_PATTERN } from '../Lib/typeKey'
import { VEHICLE_YEAR_MIN, vehicleYearMax } from '../Lib/vehicleYear'

// An empty string passes: on an update it is how a cleared field says so.
const hsnSchema = z
  .string()
  .transform(normalizeHsn)
  .refine((v) => v === '' || HSN_PATTERN.test(v), 'HSN is four digits, from field 2.1')
const tsnSchema = z
  .string()
  .transform(normalizeTsn)
  .refine((v) => v === '' || TSN_PATTERN.test(v), 'TSN is three letters or digits, from field 2.2')

export const createVehicleSchema = z.object({
  make: z.string().min(1, 'Make is required').max(NAME_MAX_LENGTH),
  model: z.string().min(1, 'Model is required').max(NAME_MAX_LENGTH),
  year: z.coerce
    .number()
    .min(VEHICLE_YEAR_MIN, 'Year must be after 1900')
    .max(vehicleYearMax(), 'Year is too far in the future'),
  vin: z.string().max(SHORT_TEXT_MAX_LENGTH).optional(),
  licensePlate: z.string().max(SHORT_TEXT_MAX_LENGTH).optional(),
  color: z.string().max(SHORT_TEXT_MAX_LENGTH).optional(),
  mileage: z.coerce.number().min(0).max(READING_MAX).default(0),
  fuelType: z.string().max(SHORT_TEXT_MAX_LENGTH).optional(),
  transmission: z.string().max(SHORT_TEXT_MAX_LENGTH).optional(),
  engineSize: z.string().max(NAME_MAX_LENGTH).optional(),
  engineCode: z.string().max(SHORT_TEXT_MAX_LENGTH).optional(),
  hsn: hsnSchema.optional(),
  tsn: tsnSchema.optional(),
  /** The owner's own number for the vehicle. Kept only by a workshop that uses the field. */
  fleetNumber: z
    .string()
    .trim()
    .max(
      FLEET_NUMBER_MAX_LENGTH,
      `Fleet / unit number can be at most ${FLEET_NUMBER_MAX_LENGTH} characters`
    )
    .optional(),
  purchaseDate: z.string().optional(),
  purchasePrice: z.coerce.number().optional(),
  imageUrl: optionalUploadUrlSchema.optional(),
  customerId: z.string().optional(),
  /**
   * Next periodic inspection, YYYY-MM-DD, as the form's field holds it. Empty
   * clears a manual date; undefined leaves the stored date alone.
   */
  inspectionDueAt: z.string().optional(),
  /**
   * The registry lookup made on this form, when there was one. Saved as that
   * registry's answer, checked now, so the sync does not look the vehicle up
   * again straight away; a date typed over the registry's is saved by hand
   * on top of it.
   */
  registryLookup: registryLookupSchema.optional(),
  /**
   * The workshop's own fields, as the full form shows them, by field id.
   * Checked and written with the record, all or nothing. Left out by a form
   * that does not show them, and then not looked at.
   */
  customFields: z.record(z.string(), z.string()).optional(),
})

export const updateVehicleSchema = createVehicleSchema.partial().extend({
  id: z.string(),
  // Without the new vehicle's default: zod fills a default in even on an
  // optional field, so an update that did not send the reading (adding a
  // customer from the work order) came out with `mileage: 0` and wiped it.
  mileage: z.coerce.number().min(0).max(READING_MAX).optional(),
})

export type CreateVehicleInput = z.infer<typeof createVehicleSchema>
export type UpdateVehicleInput = z.infer<typeof updateVehicleSchema>
