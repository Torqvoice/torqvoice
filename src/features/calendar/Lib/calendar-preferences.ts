/**
 * How this person likes the calendar drawn. Kept in the browser: these are
 * viewing habits, not workshop data, and a planner on the front desk PC and
 * a phone in the pit may well want different ones.
 *
 * A cookie rather than local storage, so the calendar page reads it on the
 * server and the first paint already has the right kinds ticked and hidden.
 */
export interface CalendarPreferences {
  showWeekends: boolean
  showCompleted: boolean
  showWeekNumbers: boolean
  sidebarOpen: boolean
  /**
   * The kinds unticked in the sidebar list. What is hidden, not what is
   * shown, so a kind added to the calendar later starts out visible.
   */
  hiddenTypes: string[]
}

export const CALENDAR_PREFERENCES_COOKIE = 'calendarPreferences'

/** Where the preferences lived before the cookie; read once to carry them over. */
export const LEGACY_STORAGE_KEY = 'torqvoice.calendar.preferences'

/** A year, the same as the other remembered view choices. */
const MAX_AGE = 60 * 60 * 24 * 365

/** More than the calendar has kinds; a longer list is not one this app wrote. */
const MAX_HIDDEN = 32

export const DEFAULT_CALENDAR_PREFERENCES: CalendarPreferences = {
  showWeekends: true,
  showCompleted: true,
  showWeekNumbers: false,
  sidebarOpen: true,
  hiddenTypes: [],
}

const BOOLEAN_KEYS = ['showWeekends', 'showCompleted', 'showWeekNumbers', 'sidebarOpen'] as const

/**
 * Reads stored preferences, taking only values of the right shape. Anything
 * else, written by an older build or by hand, falls back to the default
 * instead of breaking the page. Null when nothing usable is stored.
 */
export function parseCalendarPreferences(
  raw: string | null | undefined
): CalendarPreferences | null {
  if (!raw) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null
  const stored = parsed as Record<string, unknown>
  const next: CalendarPreferences = { ...DEFAULT_CALENDAR_PREFERENCES }
  for (const key of BOOLEAN_KEYS) {
    if (typeof stored[key] === 'boolean') next[key] = stored[key]
  }
  if (Array.isArray(stored.hiddenTypes)) {
    next.hiddenTypes = stored.hiddenTypes
      .filter((v): v is string => typeof v === 'string' && v.length <= 32)
      .slice(0, MAX_HIDDEN)
  }
  return next
}

export function rememberCalendarPreferences(preferences: CalendarPreferences): void {
  if (typeof document === 'undefined') return
  document.cookie = `${CALENDAR_PREFERENCES_COOKIE}=${encodeURIComponent(
    JSON.stringify(preferences)
  )}; path=/; max-age=${MAX_AGE}; samesite=lax`
}
