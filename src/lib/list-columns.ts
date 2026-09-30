/**
 * Which optional columns a list shows.
 *
 * A work order table already carries eight columns on a laptop, so anything
 * not everyone needs is off until someone asks for it. The choice is per
 * browser and per list, stored the way the remembered sort is: a cookie, so
 * the server renders the right columns on the first paint instead of the page
 * flickering from the default set to the chosen one.
 */

import type { ListKey } from './list-sort-preference'

export const LIST_COLUMNS_COOKIE = 'listColumns'
/** A year, like the sort cookie. */
export const LIST_COLUMNS_COOKIE_MAX_AGE = 60 * 60 * 24 * 365

/** Optional columns of the work order list, and whether they start on. */
export const WORK_ORDER_COLUMNS = {
  invoice: true,
  customer: true,
  tech: true,
  /**
   * When the customer was told the vehicle would be ready. Off by default:
   * most shops promise nothing, and a full timestamp in every row crowds out
   * the columns that are read on every job.
   */
  promised: false,
} as const

export type WorkOrderColumn = keyof typeof WORK_ORDER_COLUMNS

/** The columns of a list that are on when nobody has chosen. */
export function defaultColumns(available: Record<string, boolean>): string[] {
  return Object.entries(available)
    .filter(([, on]) => on)
    .map(([column]) => column)
}

/**
 * Parses the cookie: `{"workOrders":["promised","tech"]}`. Anything malformed
 * reads as no choice at all rather than throwing, because a hand-edited or
 * truncated cookie must never break a page render.
 */
export function parseListColumnsCookie(
  value: string | undefined
): Partial<Record<ListKey, string[]>> {
  if (!value) return {}
  try {
    const parsed = JSON.parse(decodeURIComponent(value))
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    const out: Partial<Record<ListKey, string[]>> = {}
    for (const [list, columns] of Object.entries(parsed as Record<string, unknown>)) {
      if (Array.isArray(columns) && columns.every((c) => typeof c === 'string')) {
        out[list as ListKey] = columns as string[]
      }
    }
    return out
  } catch {
    return {}
  }
}

/**
 * The columns to render: the remembered choice, narrowed to the columns this
 * list actually has (a stored name that no longer exists is dropped), or the
 * defaults when there is no choice to read.
 */
export function columnsFrom(
  stored: string[] | undefined,
  available: Record<string, boolean>
): string[] {
  if (!stored) return defaultColumns(available)
  return stored.filter((column) => column in available)
}
