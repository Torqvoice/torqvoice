/**
 * Domain vocabulary for the tire hotel.
 *
 * Everything here is deliberately market-neutral. Seasons are named by what
 * the tire is for rather than by a regional legal category, measurements are
 * stored in one unit and converted for display, and nothing assumes a set is
 * four tires or that a shelf holds a whole number of sets.
 */

export const TIRE_SEASONS = ['summer', 'winter', 'all_season', 'other'] as const
export type TireSeason = (typeof TIRE_SEASONS)[number]

export const TIRE_SET_STATUSES = ['stored', 'released', 'disposed'] as const
export type TireSetStatus = (typeof TIRE_SET_STATUSES)[number]

export const TIRE_POSITIONS = [
  'front_left',
  'front_right',
  'rear_left',
  'rear_right',
  'spare',
  'unspecified',
] as const
export type TirePosition = (typeof TIRE_POSITIONS)[number]

/** The four road positions, in the order a technician walks around a car. */
export const TIRE_ROAD_POSITIONS = ['front_left', 'front_right', 'rear_left', 'rear_right'] as const

export const TIRE_CONDITIONS = ['good', 'fair', 'replace'] as const
export type TireCondition = (typeof TIRE_CONDITIONS)[number]

export const TIRE_MOVEMENT_TYPES = ['check_in', 'check_out', 'relocate', 'dispose'] as const
export type TireMovementType = (typeof TIRE_MOVEMENT_TYPES)[number]

/** Tailwind token per condition, so the grade reads the same everywhere. */
export const CONDITION_TOKENS: Record<TireCondition, { badge: string; bar: string; dot: string }> =
  {
    good: {
      badge: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20',
      bar: 'bg-emerald-500',
      dot: 'bg-emerald-500',
    },
    fair: {
      badge: 'bg-amber-500/10 text-amber-600 border-amber-500/20',
      bar: 'bg-amber-500',
      dot: 'bg-amber-500',
    },
    replace: {
      badge: 'bg-red-500/10 text-red-600 border-red-500/20',
      bar: 'bg-red-500',
      dot: 'bg-red-500',
    },
  }

export const STATUS_TOKENS: Record<TireSetStatus, string> = {
  stored: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
  released: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20',
  disposed: 'bg-muted text-muted-foreground border-border',
}

/**
 * Occupancy bands for the shelf overview. A location past `full` is over its
 * stated capacity. That is legal but worth flagging, since it usually means
 * a set was placed without checking, or the capacity was set too low.
 */
export const OCCUPANCY_BANDS = {
  empty: 0,
  comfortable: 0.7,
  tight: 0.9,
  full: 1,
} as const

export function occupancyBand(
  used: number,
  capacity: number
): 'empty' | 'comfortable' | 'tight' | 'full' | 'over' {
  if (capacity <= 0) return used > 0 ? 'over' : 'empty'
  const ratio = used / capacity
  if (used === 0) return 'empty'
  if (ratio > 1) return 'over'
  if (ratio >= OCCUPANCY_BANDS.full) return 'full'
  if (ratio >= OCCUPANCY_BANDS.tight) return 'tight'
  return 'comfortable'
}

export const OCCUPANCY_TOKENS: Record<
  ReturnType<typeof occupancyBand>,
  { bar: string; text: string; ring: string }
> = {
  empty: { bar: 'bg-muted-foreground/20', text: 'text-muted-foreground', ring: 'ring-border' },
  comfortable: { bar: 'bg-emerald-500', text: 'text-emerald-600', ring: 'ring-emerald-500/30' },
  tight: { bar: 'bg-amber-500', text: 'text-amber-600', ring: 'ring-amber-500/40' },
  full: { bar: 'bg-orange-500', text: 'text-orange-600', ring: 'ring-orange-500/40' },
  over: { bar: 'bg-red-500', text: 'text-red-600', ring: 'ring-red-500/50' },
}

// --- Unit conversion -------------------------------------------------------
// Tread and pressure are stored in one unit each (mm, bar) and converted at
// the edges. Workshops on imperial units read 32nds and psi; everyone else
// reads mm and bar. The stored number never changes meaning.

export const MM_PER_32ND = 25.4 / 32
export const PSI_PER_BAR = 14.5037738
export const KPA_PER_BAR = 100

export function mmToThirtySeconds(mm: number): number {
  return mm / MM_PER_32ND
}

export function thirtySecondsToMm(thirtySeconds: number): number {
  return thirtySeconds * MM_PER_32ND
}

export function barToPsi(bar: number): number {
  return bar * PSI_PER_BAR
}

export function psiToBar(psi: number): number {
  return psi / PSI_PER_BAR
}

export function barToKpa(bar: number): number {
  return bar * KPA_PER_BAR
}

/**
 * Legal minimum tread varies by country and by season, so this is a display
 * hint rather than a compliance check: the workshop sets its own replace
 * threshold and these are only the fallbacks used before it does.
 */
export type TreadThresholds = {
  /** Below this, most jurisdictions consider a summer tire worn out. */
  summerReplace: number
  /** Winter tires lose grip well above the summer limit. */
  winterReplace: number
  /** Approaching the limit, so worth telling the customer at pickup. */
  warnMargin: number
}

export const DEFAULT_TREAD_THRESHOLDS_MM: TreadThresholds = {
  summerReplace: 1.6,
  winterReplace: 4,
  warnMargin: 1,
}

export function gradeTread(
  treadDepthMm: number | null | undefined,
  season: string,
  thresholds: TreadThresholds = DEFAULT_TREAD_THRESHOLDS_MM
): TireCondition | null {
  if (treadDepthMm == null) return null
  const limit = season === 'winter' ? thresholds.winterReplace : thresholds.summerReplace
  if (treadDepthMm < limit) return 'replace'
  if (treadDepthMm < limit + thresholds.warnMargin) return 'fair'
  return 'good'
}

/**
 * Builds the location code shown on labels from whichever parts the workshop
 * filled in. A shop that only uses shelves gets "S12"; one that uses the full
 * hierarchy gets "B-04-2-A".
 */
export function buildLocationCode(parts: {
  zone?: string | null
  rack?: string | null
  shelf?: string | null
  position?: string | null
}): string {
  return [parts.zone, parts.rack, parts.shelf, parts.position]
    .map((p) => p?.trim())
    .filter((p): p is string => !!p)
    .join('-')
}

/** Worst condition across a set of readings, for the set-level badge. */
export function worstCondition(conditions: string[]): TireCondition {
  if (conditions.includes('replace')) return 'replace'
  if (conditions.includes('fair')) return 'fair'
  return 'good'
}
