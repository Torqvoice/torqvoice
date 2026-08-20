/**
 * Reads the feature hint ids a workshop has already been shown.
 *
 * Lives outside the action file because a 'use server' module may only export
 * async functions, and both the server layout and the action need this one.
 */
export function parseSeenHints(value: string | null | undefined): string[] {
  if (!value) return []
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : []
  } catch {
    // Hand-edited, or written by something older. An unreadable list means
    // nothing has been seen, which shows a hint again at worst.
    return []
  }
}
