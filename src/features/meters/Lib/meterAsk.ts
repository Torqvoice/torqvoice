/**
 * Which "far above the last reading" question a workshop's meter asks, told
 * from the unit the workshop gave it. A meter in kilometres or miles takes
 * the odometer's distance limit, one in hours the hours limit, and one in any
 * other unit (litres, cycles, lifts) asks nothing: no limit fits every unit,
 * and a question on most visits teaches people to say yes without reading.
 *
 * Pure, so the forms and the technician API share one rule.
 */
import { MUCH_HIGHER_READING, type ReadingKind } from '@/features/vehicles/Lib/vehicleReading'

/** Distance units as workshops write them, lower case, without a trailing dot. */
const DISTANCE_UNITS = new Set([
  'km',
  'kms',
  'kilometre',
  'kilometres',
  'kilometer',
  'kilometers',
  'км',
  'mi',
  'mile',
  'miles',
  'nm',
  'nmi',
  'nautical mile',
  'nautical miles',
])

/**
 * Hours units as workshops write them, lower case, without a trailing dot:
 * English, and the short forms the app's own languages use for engine hours
 * (Std., t, u, sa, val., godz., ч) with their long forms.
 */
const HOURS_UNITS = new Set([
  'h',
  'hr',
  'hrs',
  'hour',
  'hours',
  'std',
  'stunden',
  't',
  'timer',
  'u',
  'uur',
  'uren',
  'sa',
  'saat',
  'val',
  'valandos',
  'godz',
  'godziny',
  'ч',
  'час',
  'часы',
  'часов',
  'heures',
  'horas',
  'ore',
])

/** The unit as compared: trimmed, lower case, spaces collapsed, no trailing dot. */
function normalUnit(unit: string | null | undefined): string {
  return (unit ?? '').trim().toLocaleLowerCase().replace(/\s+/g, ' ').replace(/\.$/, '')
}

/** Whether a meter's unit is a distance or hours, or null for any other unit. */
export function meterReadingKind(unit: string | null | undefined): ReadingKind | null {
  const text = normalUnit(unit)
  if (DISTANCE_UNITS.has(text)) return 'distance'
  if (HOURS_UNITS.has(text)) return 'hours'
  return null
}

/**
 * How far above the last reading a new one may go before the screen asks
 * whether a digit slipped in, for a meter in this unit; null asks nothing.
 */
export function meterAskLimit(unit: string | null | undefined): number | null {
  const kind = meterReadingKind(unit)
  return kind ? MUCH_HIGHER_READING[kind] : null
}
