import type { TimeWindow } from '../../utils/layout'

/** Columns are addressed by the day and lane they belong to. */
export function columnKey(date: string, laneId: string): string {
  return `${date}::${laneId}`
}

export function parseColumnKey(key: string): { date: string; laneId: string } {
  const separator = key.indexOf('::')
  return {
    date: key.slice(0, separator),
    laneId: key.slice(separator + 2),
  }
}

/** Pixels from the top of a column body for a given time of day. */
export function offsetForMinutes(mins: number, window: TimeWindow, pxPerMinute: number): number {
  return (mins - window.startMins) * pxPerMinute
}

/** The time of day a pointer is over, in minutes from midnight. */
export function minutesAtPoint(
  clientY: number,
  rect: DOMRect,
  window: TimeWindow,
  pxPerMinute: number
): number {
  return window.startMins + (clientY - rect.top) / pxPerMinute
}

export function totalHeight(window: TimeWindow, pxPerMinute: number): number {
  return (window.endMins - window.startMins) * pxPerMinute
}
