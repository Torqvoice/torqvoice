import { z } from 'zod'
import { READING_MAX } from '@/lib/input-limits'

export const createFuelLogSchema = z.object({
  vehicleId: z.string(),
  date: z.string().default(() => new Date().toISOString()),
  mileage: z.coerce.number().min(0, 'Mileage is required').max(READING_MAX),
  gallons: z.coerce.number().min(0, 'Gallons is required'),
  pricePerGallon: z.coerce.number().min(0, 'Price is required'),
  totalCost: z.coerce.number().min(0),
  isFillUp: z.boolean().default(true),
  station: z.string().optional(),
  notes: z.string().optional(),
})

export type CreateFuelLogInput = z.infer<typeof createFuelLogSchema>
