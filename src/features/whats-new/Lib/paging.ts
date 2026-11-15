/**
 * How many highlights the panel is given at a time. The first ten arrive
 * with the page; older ones are asked for as the reader scrolls to them, so
 * a long history costs nothing to the people who never open the panel.
 */
export const WHATS_NEW_PAGE_SIZE = 10

/** How long an entry keeps its New or Improved label after it is published. */
export const WHATS_NEW_FRESH_DAYS = 21

/**
 * Whether an entry is recent enough to be labelled. The panel keeps every
 * entry, so without a limit a feature from last year would still say "New".
 */
export function isFreshEntry(publishedAt: string, now: number = Date.now()): boolean {
  const published = Date.parse(publishedAt)
  if (Number.isNaN(published)) return false
  return now - published < WHATS_NEW_FRESH_DAYS * 24 * 60 * 60 * 1000
}
