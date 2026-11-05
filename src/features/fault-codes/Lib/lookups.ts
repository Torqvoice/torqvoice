/**
 * The codes this person opened and the words they searched for lately on
 * the fault code pages, kept in this browser like the search palette's
 * recent picks. Shown on the lookup page before anything is typed, so the
 * code a technician is chasing all day is one click away.
 */
const KEY = 'torqvoice.faultCodes.recent'
const MAX = 10

/** A lookup as it is recorded: a code that was opened, or words that were searched. */
export type NewLookup =
  | { kind: 'code'; code: string; title: string | null }
  | { kind: 'words'; query: string }

export type RecentLookup = NewLookup & { at: number }

const sameAs = (a: RecentLookup, b: NewLookup) =>
  a.kind === 'code' && b.kind === 'code'
    ? a.code === b.code
    : a.kind === 'words' && b.kind === 'words'
      ? a.query.toLowerCase() === b.query.toLowerCase()
      : false

function valid(x: unknown): x is RecentLookup {
  if (!x || typeof x !== 'object') return false
  const r = x as Record<string, unknown>
  if (typeof r.at !== 'number') return false
  if (r.kind === 'code') return typeof r.code === 'string'
  if (r.kind === 'words') return typeof r.query === 'string'
  return false
}

export function readRecentLookups(): RecentLookup[] {
  try {
    const raw = window.localStorage.getItem(KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter(valid).slice(0, MAX) : []
  } catch {
    return []
  }
}

/** Puts a lookup first, once: opening P0420 again moves it to the top. */
export function pushRecentLookup(lookup: NewLookup): RecentLookup[] {
  const next: RecentLookup[] = [
    { ...lookup, at: Date.now() },
    ...readRecentLookups().filter((r) => !sameAs(r, lookup)),
  ].slice(0, MAX)
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    // Private mode or a full store: the page works without a memory.
  }
  return next
}

export function clearRecentLookups(): void {
  try {
    window.localStorage.removeItem(KEY)
  } catch {
    // Nothing to clear.
  }
}
