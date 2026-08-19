/**
 * Capacity arithmetic for the shelf overview and the location picker.
 *
 * Everything counts individual tires. A location's capacity is the number of
 * tires it holds, occupancy is the sum of the quantities of the sets on it,
 * and "room for" is the difference. Counting sets instead would break the
 * moment a customer stores a pair or a five-wheel set, which happens often
 * enough to be the normal case rather than the exception.
 */

import { occupancyBand } from './tireConstants'

export type LocationCapacity = {
  id: string
  code: string
  capacity: number
  /** Tires currently on this location. */
  used: number
  /** Tires that still fit. Never negative, even when a shelf is overfilled. */
  free: number
  /** used / capacity, uncapped so an overfilled shelf reads above 1. */
  ratio: number
  band: ReturnType<typeof occupancyBand>
}

export type WarehouseCapacity = {
  id: string
  name: string
  capacity: number
  used: number
  free: number
  ratio: number
  band: ReturnType<typeof occupancyBand>
  locationCount: number
  /** Locations with at least one tire on them. */
  occupiedLocationCount: number
}

export function locationCapacity(location: {
  id: string
  code: string
  capacity: number
  tireSets: { quantity: number }[]
}): LocationCapacity {
  const used = location.tireSets.reduce((sum, set) => sum + set.quantity, 0)
  const capacity = Math.max(0, location.capacity)
  return {
    id: location.id,
    code: location.code,
    capacity,
    used,
    free: Math.max(0, capacity - used),
    ratio: capacity > 0 ? used / capacity : used > 0 ? Infinity : 0,
    band: occupancyBand(used, capacity),
  }
}

export function warehouseCapacity(warehouse: {
  id: string
  name: string
  locations: { id: string; code: string; capacity: number; tireSets: { quantity: number }[] }[]
}): WarehouseCapacity {
  const perLocation = warehouse.locations.map(locationCapacity)
  const capacity = perLocation.reduce((sum, l) => sum + l.capacity, 0)
  const used = perLocation.reduce((sum, l) => sum + l.used, 0)
  return {
    id: warehouse.id,
    name: warehouse.name,
    capacity,
    used,
    free: Math.max(0, capacity - used),
    ratio: capacity > 0 ? used / capacity : used > 0 ? Infinity : 0,
    band: occupancyBand(used, capacity),
    locationCount: perLocation.length,
    occupiedLocationCount: perLocation.filter((l) => l.used > 0).length,
  }
}

/**
 * Locations that can take `quantity` more tires, best fit first.
 *
 * Best fit means the tightest shelf that still has room, so storage stays
 * dense and half-empty shelves get filled before new ones are opened. A
 * technician who ignores the order and picks any location is not blocked —
 * this ranks suggestions, it does not enforce them.
 */
export function locationsWithRoom(
  locations: LocationCapacity[],
  quantity: number
): LocationCapacity[] {
  return locations
    .filter((l) => l.free >= quantity)
    .sort((a, b) => a.free - b.free || a.code.localeCompare(b.code))
}

/**
 * Splits every location into those that fit the set and those that do not,
 * keeping both so the picker can show the full shelf list with the ones that
 * are too full greyed out rather than silently missing.
 */
export function partitionByRoom<T extends LocationCapacity>(
  locations: T[],
  quantity: number
): { fits: T[]; tooFull: T[] } {
  const fits: T[] = []
  const tooFull: T[] = []
  for (const location of locations) {
    if (location.free >= quantity) fits.push(location)
    else tooFull.push(location)
  }
  return {
    fits: fits.sort((a, b) => a.free - b.free || a.code.localeCompare(b.code)),
    tooFull: tooFull.sort((a, b) => b.free - a.free || a.code.localeCompare(b.code)),
  }
}

/**
 * Total free tire slots across a set of locations. Shown on the check-in
 * screen so staff know at a glance whether the building can take another set
 * before they start filling in the form.
 */
export function totalFree(locations: LocationCapacity[]): number {
  return locations.reduce((sum, l) => sum + l.free, 0)
}
