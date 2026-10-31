import { z } from 'zod'

/**
 * A registry's answer as the vehicle form hands it back on save: which
 * connector answered, what it was asked, and the parts of the answer the
 * inspection status keeps. Saved with `recordRegistryAnswer`, so a vehicle
 * created or edited from a lookup is stored as checked now, with the day the
 * registry gave, and the hourly sync does not spend a second lookup on it.
 */
export const registryAnswerSchema = z.object({
  inspectionDue: z.string().max(40).optional(),
  lastInspected: z.string().max(40).optional(),
  registered: z.boolean().optional(),
  vehicleClass: z.string().max(120).optional(),
  firstRegistered: z.string().max(40).optional(),
  tyres: z
    .array(
      z.object({
        axle: z.number(),
        tyre: z.string().max(40).optional(),
        rim: z.string().max(40).optional(),
        loadIndex: z.string().max(20).optional(),
        speedRating: z.string().max(20).optional(),
      })
    )
    .max(10)
    .optional(),
  weights: z.object({ kerb: z.number().optional(), grossMax: z.number().optional() }).optional(),
})

export const registryLookupSchema = z.object({
  connectorId: z.string().max(60),
  /** What the registry was asked about, so the answer is only kept for that vehicle. */
  by: z.enum(['plate', 'vin']),
  value: z.string().max(32),
  result: registryAnswerSchema,
})

export type RegistryLookup = z.infer<typeof registryLookupSchema>

/** A plate or VIN reduced to what identifies it: letters and digits, upper case. */
export function identifierKey(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, '')
}

/**
 * Whether the lookup was about the vehicle as it is being saved. A plate
 * retyped after the lookup is another vehicle, whose answer this is not.
 */
export function lookupAppliesTo(
  lookup: Pick<RegistryLookup, 'by' | 'value'>,
  vehicle: { licensePlate?: string | null; vin?: string | null }
): boolean {
  const saved = lookup.by === 'vin' ? vehicle.vin : vehicle.licensePlate
  if (!saved) return false
  const asked = identifierKey(lookup.value)
  return asked.length > 0 && asked === identifierKey(saved)
}

/**
 * Whether the form's date field still says what the registry said: left
 * alone, or holding the day the registry gave. Anything else, a cleared
 * field included, is the workshop's own doing.
 */
export function holdsRegistryDate(
  value: string | undefined,
  result: Pick<RegistryLookup['result'], 'inspectionDue'>
): boolean {
  if (value === undefined) return true
  const registryDay = result.inspectionDue?.slice(0, 10)
  return Boolean(registryDay) && value.trim() === registryDay
}
