import 'server-only'

import { cookies } from 'next/headers'
import {
  LIST_SORT_COOKIE,
  parseListSortCookie,
  parseStoredSort,
  type ListKey,
  type ListSort,
} from './list-sort-preference'

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
