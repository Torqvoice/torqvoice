import { cookies } from 'next/headers'

/**
 * Remembered sort order for the list pages.
 *
 * Sort lives in the URL, so it survives a refresh but not a trip through the
 * sidebar: coming back to a list lands on a bare path and the order silently
 * reverts to the default. This keeps the last order each list was sorted by,
 * so the choice sticks the way people expect it to.
 *
 * A cookie rather than localStorage because the pages resolve their sort on
 * the server. Reading it there means the first paint is already in the right
 * order, with no flash of default sorting and no client-side redirect.
 */

/** Every list that remembers its sort. Keys are stored, so keep them stable. */
export type ListKey =
  | 'customers'
  | 'vehicles'
  | 'workOrders'
  | 'quotes'
  | 'inventory'
  | 'inspections'
  | 'laborPresets'

export const LIST_SORT_COOKIE = 'listSort'

/** A year: long enough to feel permanent, short enough to age out eventually. */
export const LIST_SORT_COOKIE_MAX_AGE = 60 * 60 * 24 * 365

export type SortOrder = 'asc' | 'desc'

export type ListSort = {
  sortBy: string | undefined
  sortOrder: SortOrder
}

/**
 * Parses the cookie: `{"customers":"name:asc"}`. Anything malformed yields an
 * empty map rather than throwing, since a hand-edited or truncated cookie must
 * never break a page render.
 */
export function parseListSortCookie(raw: string | undefined): Record<string, string> {
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    const out: Record<string, string> = {}
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === 'string') out[key] = value
    }
    return out
  } catch {
    return {}
  }
}

/** Splits a stored `column:direction` pair, rejecting anything else. */
export function parseStoredSort(stored: string | undefined): ListSort | null {
  if (!stored) return null
  const [sortBy, sortOrder] = stored.split(':')
  if (!sortBy) return null
  return { sortBy, sortOrder: sortOrder === 'asc' ? 'asc' : 'desc' }
}

/**
 * The sort a list page should render with: an explicit `?sortBy=` in the URL
 * always wins, then the remembered choice, then the page's own default.
 *
 * The URL taking precedence matters — a shared link, a back button and a
 * column click all put the order in the URL, and none of them should be
 * overridden by what this browser happened to pick last.
 */
export async function resolveListSort(
  list: ListKey,
  params: { sortBy?: string; sortOrder?: string },
  fallback: ListSort = { sortBy: undefined, sortOrder: 'desc' }
): Promise<ListSort> {
  if (params.sortBy) {
    return { sortBy: params.sortBy, sortOrder: params.sortOrder === 'asc' ? 'asc' : 'desc' }
  }

  const store = await cookies()
  const remembered = parseStoredSort(parseListSortCookie(store.get(LIST_SORT_COOKIE)?.value)[list])
  return remembered ?? fallback
}
