import { equipmentLabel } from './equipmentLabel'

/**
 * The vehicle condition a search word adds as a serial number of equipment
 * on the vehicle now (a crane's, a tail lift's), for a workshop that records
 * equipment; nothing otherwise, so the query is what it always was. An item
 * removed, or moved to another vehicle, finds only the vehicle it is on now.
 */
export function equipmentSerialMatch(
  organizationId: string,
  word: string,
  enabled: boolean
): {
  equipment: {
    some: {
      organizationId: string
      removedAt: null
      serialNumber: { contains: string; mode: 'insensitive' }
    }
  }
}[] {
  const term = word.trim()
  if (!enabled || !term) return []
  return [
    {
      equipment: {
        some: {
          organizationId,
          removedAt: null,
          serialNumber: { contains: term, mode: 'insensitive' },
        },
      },
    },
  ]
}

/**
 * The equipment on these vehicles now whose serial number holds one of the
 * words: what a vehicle in the search palette was found by, for its row to
 * say which.
 */
export function equipmentSerialQuery(
  organizationId: string,
  vehicleIds: string[],
  words: string[]
) {
  const terms = words.map((w) => w.trim()).filter(Boolean)
  return {
    where: {
      organizationId,
      vehicleId: { in: vehicleIds },
      removedAt: null,
      OR: terms.map((term) => ({
        serialNumber: { contains: term, mode: 'insensitive' as const },
      })),
    },
    orderBy: { createdAt: 'asc' as const },
    select: {
      vehicleId: true,
      make: true,
      model: true,
      serialNumber: true,
      type: { select: { name: true } },
    },
    take: 30,
  }
}

/** Those items as the row shows them: "Crane, HIAB X-HiPro 192 (4471)". */
export function equipmentSerialLabels(
  items: {
    make: string | null
    model: string | null
    serialNumber: string | null
    type: { name: string }
  }[]
): string[] {
  return items.map((item) => equipmentLabel({ typeName: item.type.name, ...item }))
}
