import 'server-only'

import { cookies } from 'next/headers'
import {
  LIST_STATUS_COOKIE,
  parseListStatusCookie,
  type StatusListKey,
} from './list-status-preference'

/**
 * The status tab a list page should render with: a `?status=` in the URL
 * always wins, then the tab this browser last switched the list to, then All.
 *
 * The URL winning matters: a dashboard card, a shared link and the back
 * button all put the tab in the URL, and none of them should be overridden by
 * what was picked last.
 */
export async function resolveListStatus(
  list: StatusListKey,
  status: string | undefined
): Promise<string> {
  if (status) return status
  const store = await cookies()
  return parseListStatusCookie(store.get(LIST_STATUS_COOKIE)?.value)[list] ?? 'all'
}
