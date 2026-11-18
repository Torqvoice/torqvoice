/**
 * What this person opened from the palette lately, kept in this browser.
 * Shown before they type, so the setting they keep coming back to is one
 * keystroke away. Local items are stored by id and resolved against the
 * live index when read, so a page that no longer exists simply drops out;
 * records keep their own words, since the index knows nothing about them.
 */
const KEY = 'torqvoice.search.recent'
const MAX = 8

export type RecentPick = {
  id: string
  href: string
  title: string
  subtitle?: string
  kind: 'local' | 'record'
  at: number
}

export function readRecent(): RecentPick[] {
  try {
    const raw = window.localStorage.getItem(KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (p): p is RecentPick =>
        !!p && typeof p === 'object' && typeof p.id === 'string' && typeof p.href === 'string'
    )
  } catch {
    return []
  }
}

export function pushRecent(pick: Omit<RecentPick, 'at'>): void {
  try {
    const next = [
      { ...pick, at: Date.now() },
      ...readRecent().filter((p) => p.id !== pick.id),
    ].slice(0, MAX)
    window.localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    // Private mode or a full store: the palette works without a memory.
  }
}

export function clearRecent(): void {
  try {
    window.localStorage.removeItem(KEY)
  } catch {
    // Nothing to clear.
  }
}
