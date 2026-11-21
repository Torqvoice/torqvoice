/**
 * Meter readings: engine hours, PTO hours and whatever else a workshop
 * reads besides the odometer. Unlike the odometer they carry decimals
 * ("4,256.7 hrs"), stored to two places.
 *
 * Pure, so the forms, the server and the technician API share one rule.
 */

/** The largest reading the column holds, well past any meter. */
export const METER_VALUE_MAX = 999_999_999_999.99

/**
 * What was typed as a number, or null when it is not a well-formed one.
 * Takes the decimal mark the person uses and thousands grouped in threes:
 * "4256.7", "4256,7", "4,256.7", "4.256,7", "4 256,7" and "1,234,567" all
 * read. Anything else is refused rather than guessed: more than two
 * decimals ("12.345"), a lone group that could be either ("4,256"), groups
 * not of three ("1,5,0") or one mark used for both ("4.256.7"). A reading is
 * copied off a meter, so a typo is better caught than saved as another number.
 */
export function parseMeterValue(text: string | number | null | undefined): number | null {
  if (typeof text === 'number') {
    // The same rule as typed text: no more than two decimals, never rounded.
    if (!validMeterValue(text) || Math.abs(text * 100 - Math.round(text * 100)) > 1e-7) return null
    return text
  }
  const raw = (text ?? '').trim().replace(/[\u00a0\u202f]/g, ' ')
  if (raw === '') return null
  // Plain: digits, then a decimal mark and one or two decimals.
  const plain = /^(\d+)(?:[.,](\d{1,2}))?$/.exec(raw)
  if (plain) {
    // "4,256" or "4.256" alone could be thousands or three decimals.
    return finish(`${plain[1]}${plain[2] ? `.${plain[2]}` : ''}`)
  }
  // Grouped: one to three digits, then groups of three, all with one mark,
  // then a different decimal mark. "4,256" is not here: a single group with
  // no decimals could be either and is refused above.
  const grouped = /^(\d{1,3})((?:([,. ']) ?\d{3})(?:\3\d{3})*)(?:([.,])(\d{1,2}))?$/.exec(raw)
  if (!grouped) return null
  const [, head, rest, group, decimal, decimals] = grouped
  if (decimal && decimal === group) return null
  const groups = rest.split(group).filter(Boolean)
  if (groups.some((g) => !/^ ?\d{3}$/.test(g))) return null
  if (groups.length === 1 && !decimal) return null
  return finish(`${head}${groups.map((g) => g.trim()).join('')}${decimal ? `.${decimals}` : ''}`)
}

function finish(normalized: string): number | null {
  const value = Number(normalized)
  return validMeterValue(value) ? value : null
}

function validMeterValue(value: number): boolean {
  return Number.isFinite(value) && value >= 0 && value <= METER_VALUE_MAX
}

/** Two decimal places, as the column keeps them: no float noise in what is stored. */
export function roundMeterValue(value: number): number {
  return Math.round(value * 100) / 100
}

/** A reading as one of the meter's own lines reads it: "Engine hours: 4,256.7 hrs". */
export function meterLine(
  meter: { name: string; unit: string; value: number },
  format: (value: number) => string
): string {
  const unit = meter.unit.trim()
  return `${meter.name}: ${format(meter.value)}${unit ? ` ${unit}` : ''}`
}

/** One stored reading, as the rules below need it. */
export interface MeterReadingLike {
  id: string
  value: number
  readAt: Date
  createdAt: Date
  /** Set on the first reading of a meter fitted in place of another. */
  replacedFrom: number | null
  wrongAt: Date | null
  serviceRecordId?: string | null
}

/** Oldest first: by when it was read, then by when it was typed. */
export function byReadingTime<T extends Pick<MeterReadingLike, 'readAt' | 'createdAt'>>(
  a: T,
  b: T
): number {
  return a.readAt.getTime() - b.readAt.getTime() || a.createdAt.getTime() - b.createdAt.getTime()
}

/**
 * What a meter's readings come to:
 *
 * - `current`: the newest reading that counts (one marked wrong does not).
 * - `total`: the running total across replaced meters. Each replacement
 *   carries the old counter on: what it had reached, less what the new one
 *   started at. A vehicle whose old meter came off at 9,800 hours and whose
 *   new one now reads 120 has run 9,920. Equal to `current` until a meter is
 *   replaced.
 */
export function meterState(readings: MeterReadingLike[]): {
  current: MeterReadingLike | null
  total: number | null
} {
  const counted = readings.filter((r) => !r.wrongAt).sort(byReadingTime)
  const current = counted.at(-1) ?? null
  if (!current) return { current: null, total: null }
  const carried = counted.reduce(
    (sum, r) => (r.replacedFrom != null ? sum + (r.replacedFrom - r.value) : sum),
    0
  )
  return { current, total: roundMeterValue(current.value + carried) }
}

/**
 * The reading a new one should not be below: the newest that counts, read
 * before `before` and on the meter as it is now (a reading from before a
 * replacement belongs to another counter). Null when there is none, and then
 * nothing is said.
 */
export function lastMeterValueBefore(
  readings: MeterReadingLike[],
  before: { readAt: Date; excludeId?: string | null }
): number | null {
  const counted = readings
    .filter((r) => !r.wrongAt && r.id !== before.excludeId)
    .sort(byReadingTime)
  let last: number | null = null
  for (const reading of counted) {
    if (reading.readAt.getTime() > before.readAt.getTime()) break
    if (reading.replacedFrom != null) last = null
    last = reading.value
  }
  return last
}

/** Whether a typed reading is below the last known one: said, never refused. */
export function isLowerMeterValue(entered: string, last: number | null | undefined): boolean {
  if (last == null) return false
  const value = parseMeterValue(entered)
  return value !== null && value < last
}
