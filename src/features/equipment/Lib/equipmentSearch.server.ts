import 'server-only'

import { db } from '@/lib/db'
import { equipmentSerialLabels, equipmentSerialQuery } from './equipmentSearch'

/**
 * The vehicles found, each with the equipment on it whose serial number the
 * search matched, for the row to say which. Asked only while equipment is on.
 */
export async function withMatchedEquipment<V extends { id: string }>(
  organizationId: string,
  vehicles: V[],
  words: string[]
): Promise<(V | (V & { equipment: string[] }))[]> {
  if (vehicles.length === 0) return vehicles
  const items = await db.equipmentItem.findMany(
    equipmentSerialQuery(
      organizationId,
      vehicles.map((v) => v.id),
      words
    )
  )
  return vehicles.map((vehicle) => {
    const matched = items.filter((item) => item.vehicleId === vehicle.id).slice(0, 3)
    return matched.length > 0 ? { ...vehicle, equipment: equipmentSerialLabels(matched) } : vehicle
  })
}
