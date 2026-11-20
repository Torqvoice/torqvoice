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
 * What was typed as a number, or null when it is not one. Takes the
 * decimal mark the person uses: "4256.7", "4256,7", "4,256.7" and
 * "4 256,7" all read as 4256.7. More than two decimals are refused rather
 * than rounded: a reading is copied off a meter, not worked out.
 */
export function parseMeterValue(text: string | number | null | undefined): number | null {
  if (typeof text === 'number') return validMeterValue(text) ? text : null
  const raw = (text ?? '').replace(/[\s  ']/g, '')
  if (raw === '' || !/^[0-9.,]+$/.test(raw)) return null
  const lastDot = raw.lastIndexOf('.')
  const lastComma = raw.lastIndexOf(',')
  let normalized: string
  if (lastDot >= 0 && lastComma >= 0) {
    // Both marks: the last one is the decimal mark, the other groups.
    const decimal = lastDot > lastComma ? '.' : ','
    const group = decimal === '.' ? ',' : '.'
    normalized = raw.split(group).join('').replace(decimal, '.')
  } else if (lastComma >= 0) {
    // A comma alone is a decimal mark. Several group thousands ("1,234,567");
    // one followed by three digits ("4,256") could be either, and is refused
    // like "12.345" below: a reading is never guessed.
    const parts = raw.split(',')
    if (parts.length === 2 && parts[1].length === 3) return null
    normalized = parts.length > 2 ? parts.join('') : raw.replace(',', '.')
  } else {
    const parts = raw.split('.')
    // Several dots group thousands ("1.234.567").
    normalized = parts.length > 2 ? parts.join('') : raw
  }
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null
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
