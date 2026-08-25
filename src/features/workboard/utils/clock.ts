/**
 * Times as the workshop reads them.
 *
 * The board is a grid of clock faces, so it has to speak the shop's convention:
 * a shop set to 12-hour time should never see 13:00 on its own planner. The
 * short forms matter as much as the correctness, because these labels sit in a
 * 60px gutter and inside blocks that can be one line tall.
 */

export type ClockFormat = '12h' | '24h'

/** Minutes from midnight to a label: "07:00", or "7 AM" / "7:30 AM". */
export function formatClock(mins: number, format: ClockFormat): string {
  const clamped = Math.max(0, Math.min(1440, Math.round(mins)))
  const hours = Math.floor(clamped / 60)
  const minutes = clamped % 60

  if (format === '24h') {
    return `${String(hours % 24).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
  }

  const suffix = hours < 12 || hours === 24 ? 'AM' : 'PM'
  const hour12 = hours % 12 === 0 ? 12 : hours % 12
  // On the hour the minutes are noise; the gutter has room for four characters.
  return minutes === 0
    ? `${hour12} ${suffix}`
    : `${hour12}:${String(minutes).padStart(2, '0')} ${suffix}`
}

/** A start and end pair, as shown on a block being dragged. */
export function formatClockRange(startMins: number, endMins: number, format: ClockFormat): string {
  return `${formatClock(startMins, format)} – ${formatClock(endMins, format)}`
}
