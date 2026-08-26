import type { TimeWindow } from '../../utils/layout'

/**
 * The timeline positions everything as a percentage of its own height.
 *
 * The first version measured the board in pixels and divided that height among
 * the hours. That made every position depend on a ResizeObserver having fired
 * with a sensible number, and when it had not, the board collapsed and the zoom
 * control did nothing. Percentages let CSS own the height: the grid row is
 * `1fr` and blocks sit at a fraction of it, so the board is correct on the
 * first paint with nothing measured at all.
 */

/** Minutes a job gets when it lands on the week with no duration of its own. */
export const DEFAULT_JOB_MINUTES = 60

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

export function windowMinutes(window: TimeWindow): number {
  return Math.max(window.endMins - window.startMins, 1)
}

/** How far down the column a time of day sits, as a percentage. */
export function percentForMinutes(mins: number, window: TimeWindow): number {
  return ((mins - window.startMins) / windowMinutes(window)) * 100
}

/** How tall a span of minutes is, as a percentage of the column. */
export function percentForSpan(minutes: number, window: TimeWindow): number {
  return (minutes / windowMinutes(window)) * 100
}

/**
 * The time of day a pointer is over.
 *
 * Derived from the column's own box, so it stays right whatever height the
 * board ended up with, including mid-zoom and mid-resize.
 */
export function minutesAtPoint(clientY: number, rect: DOMRect, window: TimeWindow): number {
  if (rect.height <= 0) return window.startMins
  const ratio = (clientY - rect.top) / rect.height
  return window.startMins + ratio * windowMinutes(window)
}

/** Pixels per minute implied by a rendered column, for turning drags into time. */
export function pxPerMinuteOf(rect: DOMRect, window: TimeWindow): number {
  return rect.height > 0 ? rect.height / windowMinutes(window) : 0
}

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
