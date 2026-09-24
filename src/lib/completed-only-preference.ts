/**
 * Remembered "completed only" switch for billing and reports.
 *
 * A workshop that only wants finished jobs in its invoice list and its figures
 * wants that every time, not once per visit. A cookie, like the remembered
 * sort, so the billing page can read it on the server and render the right
 * list first time.
 */

export type CompletedOnlyKey = 'billing' | 'reports'

export const COMPLETED_ONLY_COOKIE = 'completedOnly'

/** A year, the same as the remembered sort. */
const MAX_AGE = 60 * 60 * 24 * 365

/** `billing,reports`: the pages the switch is on for. Anything else reads as off. */
export function parseCompletedOnlyCookie(raw: string | undefined): Set<CompletedOnlyKey> {
  const on = new Set<CompletedOnlyKey>()
  for (const part of (raw ?? '').split(',')) {
    if (part === 'billing' || part === 'reports') on.add(part)
  }
  return on
}

/** Remembers the switch for one page, keeping what the other page has. */
export function rememberCompletedOnly(key: CompletedOnlyKey, value: boolean): void {
  if (typeof document === 'undefined') return
  const raw = document.cookie
    .split('; ')
    .find((c) => c.startsWith(`${COMPLETED_ONLY_COOKIE}=`))
    ?.slice(COMPLETED_ONLY_COOKIE.length + 1)
  const on = parseCompletedOnlyCookie(raw ? decodeURIComponent(raw) : undefined)
  if (value) on.add(key)
  else on.delete(key)
  document.cookie = `${COMPLETED_ONLY_COOKIE}=${encodeURIComponent([...on].join(','))}; path=/; max-age=${MAX_AGE}; samesite=lax`
}

/** Reads the switch in the browser, for pages that fetch their data there. */
export function readCompletedOnly(key: CompletedOnlyKey): boolean {
  if (typeof document === 'undefined') return false
  const raw = document.cookie
    .split('; ')
    .find((c) => c.startsWith(`${COMPLETED_ONLY_COOKIE}=`))
    ?.slice(COMPLETED_ONLY_COOKIE.length + 1)
  return parseCompletedOnlyCookie(raw ? decodeURIComponent(raw) : undefined).has(key)
}
