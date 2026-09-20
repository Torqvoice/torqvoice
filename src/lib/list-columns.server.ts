import 'server-only'

import { cookies } from 'next/headers'
import { columnsFrom, LIST_COLUMNS_COOKIE, parseListColumnsCookie } from './list-columns'
import type { ListKey } from './list-sort-preference'

/**
 * The optional columns a list page should render with, read on the server so
 * the first paint already has them. No URL form on purpose: which columns you
 * keep is a habit of the person, not something to share in a link.
 */
export async function resolveListColumns(
  list: ListKey,
  available: Record<string, boolean>
): Promise<string[]> {
  const store = await cookies()
  const stored = parseListColumnsCookie(store.get(LIST_COLUMNS_COOKIE)?.value)[list]
  return columnsFrom(stored, available)
}
