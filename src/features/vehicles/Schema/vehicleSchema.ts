import { z } from 'zod'
import { optionalUploadUrlSchema } from '@/lib/upload-url'
import { HSN_PATTERN, normalizeHsn, normalizeTsn, TSN_PATTERN } from '../Lib/typeKey'

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
  make: z.string().min(1, 'Make is required'),
  model: z.string().min(1, 'Model is required'),
  year: z.coerce
    .number()
    .min(1900, 'Year must be after 1900')
    .max(new Date().getFullYear() + 2, 'Year is too far in the future'),
  vin: z.string().optional(),
  licensePlate: z.string().optional(),
  color: z.string().optional(),
  mileage: z.coerce.number().min(0).default(0),
  fuelType: z.string().optional(),
  transmission: z.string().optional(),
  engineSize: z.string().optional(),
  engineCode: z.string().optional(),
  hsn: hsnSchema.optional(),
  tsn: tsnSchema.optional(),
  purchaseDate: z.string().optional(),
  purchasePrice: z.coerce.number().optional(),
  imageUrl: optionalUploadUrlSchema.optional(),
  customerId: z.string().optional(),
  /** Next periodic inspection, YYYY-MM-DD, set by hand. Empty clears a manual date. */
  inspectionDueAt: z.string().optional(),
  /**
   * The registry connector whose lookup filled inspectionDueAt, left as it
   * was. The date is then saved as that registry's answer, checked now, and
   * not as a hand-typed date the sync would look up again straight away.
   */
  inspectionDueSource: z.string().max(60).optional(),
})

export const updateVehicleSchema = createVehicleSchema.partial().extend({
  id: z.string(),
})

export type CreateVehicleInput = z.infer<typeof createVehicleSchema>
export type UpdateVehicleInput = z.infer<typeof updateVehicleSchema>
