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

/** Minutes a job gets when it lands on the week with no duration of its own. */
export const DEFAULT_JOB_MINUTES = 60

/**
 * Where a dnd-kit drag currently is, in client coordinates.
 *
 * `activatorEvent` is the pointer-down that started the drag and `delta` is how
 * far it has moved since, so the two together are the live pointer. Shared by
 * the drop-preview and the drop itself: if these ever disagreed, jobs would
 * land somewhere other than the ghost the person was aiming with.
 */
export function pointerFromDndEvent(event: {
  activatorEvent: Event
  delta: { x: number; y: number }
}): { x: number; y: number } | null {
  const activator = event.activatorEvent as { clientX?: number; clientY?: number }
  if (activator?.clientX === undefined || activator.clientY === undefined) return null
  return { x: activator.clientX + event.delta.x, y: activator.clientY + event.delta.y }
}
