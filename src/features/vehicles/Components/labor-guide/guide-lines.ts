import type { FluidPartLine } from '@/features/integrations/Lib/fluid-stock'
import type { ServicePartInput } from '@/features/vehicles/Schema/serviceSchema'

/** A fluid from the labor guide as a work order part line, the shape a pick from stock has. */
export function servicePartFromFluid(line: FluidPartLine): ServicePartInput {
  return { ...line, inventoryPartId: line.inventoryPartId ?? undefined }
}
