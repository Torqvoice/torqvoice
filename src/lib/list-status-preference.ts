/**
 * Remembered status tab for the list pages that have one.
 *
 * The tab lives in the URL (`?status=active`), so it survives a refresh but
 * not a trip through the sidebar: the sidebar opens a bare path and the list
 * fell back to All. This keeps the tab each list was last switched to, so a
 * person who only works the active jobs sees those every time (issue #554).
 *
 * Only a click on the list's own tabs is remembered. A link from elsewhere,
 * such as the dashboard's "Active jobs" card, opens the tab it names without
 * replacing the choice. A cookie, like the remembered sort, so the page reads
 * it on the server and the first paint is already filtered. It is kept per
 * browser, as every viewing preference in the app is.
 */

/**
 * The tabs each list shows, in order. The lists build their buttons from
 * these, so a value can never be remembered that the list does not offer.
 * Values are stored, so keep them stable.
 */
export const LIST_STATUS_TABS = {
  workOrders: ['all', 'active', 'pending', 'in-progress', 'waiting-parts', 'completed'],
  quotes: ['all', 'attention', 'draft', 'sent', 'accepted', 'rejected', 'converted'],
  inspections: ['all', 'in_progress', 'completed'],
  billing: ['all', 'paid', 'partial', 'unpaid'],
} as const

export type StatusListKey = keyof typeof LIST_STATUS_TABS
export type ListStatus<L extends StatusListKey> = (typeof LIST_STATUS_TABS)[L][number]

export const LIST_STATUS_COOKIE = 'listStatus'

/** A year, the same as the remembered sort. */
export const LIST_STATUS_COOKIE_MAX_AGE = 60 * 60 * 24 * 365

function isStatusList(key: string): key is StatusListKey {
  return Object.hasOwn(LIST_STATUS_TABS, key)
}

/** Whether `status` is one of the tabs `list` shows. */
export function isListStatus<L extends StatusListKey>(
  list: L,
  status: string | undefined
): status is ListStatus<L> {
  return !!status && (LIST_STATUS_TABS[list] as readonly string[]).includes(status)
}

/**
 * Parses the cookie: `{"workOrders":"active"}`. Unknown lists and tabs a list
 * no longer has are dropped, and anything malformed is an empty map, since a
 * hand-edited or truncated cookie must never break a page render or leave a
 * list filtered by something it cannot show.
 */
export function parseListStatusCookie(
  raw: string | undefined
): Partial<Record<StatusListKey, string>> {
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    const out: Partial<Record<StatusListKey, string>> = {}
    for (const [key, value] of Object.entries(parsed)) {
      if (isStatusList(key) && typeof value === 'string' && isListStatus(key, value)) {
        out[key] = value
      }
    }
    return out
  } catch {
    return {}
  }
}

/** Remembers the tab a list was switched to, keeping what the other lists have. */
export function rememberListStatus<L extends StatusListKey>(list: L, status: ListStatus<L>): void {
  if (typeof document === 'undefined' || !isListStatus(list, status)) return
  const match = document.cookie.split('; ').find((c) => c.startsWith(`${LIST_STATUS_COOKIE}=`))
  let current: Partial<Record<StatusListKey, string>> = {}
  if (match) {
    try {
      current = parseListStatusCookie(
        decodeURIComponent(match.slice(LIST_STATUS_COOKIE.length + 1))
      )
    } catch {
      current = {}
    }
  }
  const next = { ...current, [list]: status }
  document.cookie = `${LIST_STATUS_COOKIE}=${encodeURIComponent(
    JSON.stringify(next)
  )}; path=/; max-age=${LIST_STATUS_COOKIE_MAX_AGE}; SameSite=Lax`
}
