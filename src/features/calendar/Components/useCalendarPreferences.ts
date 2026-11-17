'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  type CalendarPreferences,
  DEFAULT_CALENDAR_PREFERENCES,
  LEGACY_STORAGE_KEY,
  parseCalendarPreferences,
  rememberCalendarPreferences,
} from '../Lib/calendar-preferences'

export type { CalendarPreferences } from '../Lib/calendar-preferences'

/**
 * The calendar's viewing preferences. `initial` is what the page read from
 * the cookie on the server, so the first paint matches what was chosen;
 * null when there is no cookie yet.
 */
export function useCalendarPreferences(initial: CalendarPreferences | null = null) {
  const [preferences, setPreferences] = useState<CalendarPreferences>(
    initial ?? DEFAULT_CALENDAR_PREFERENCES
  )

  // No cookie yet: carry over what an earlier build kept in local storage,
  // once, and from then on the cookie is what counts.
  useEffect(() => {
    if (initial) return
    let legacy: CalendarPreferences | null = null
    try {
      legacy = parseCalendarPreferences(window.localStorage.getItem(LEGACY_STORAGE_KEY))
    } catch {
      // Storage blocked: stay on the defaults.
    }
    if (legacy) {
      setPreferences(legacy)
      rememberCalendarPreferences(legacy)
    }
  }, [])

  const change = useCallback(
    (patchFor: (current: CalendarPreferences) => Partial<CalendarPreferences>) => {
      setPreferences((current) => {
        const next = { ...current, ...patchFor(current) }
        rememberCalendarPreferences(next)
        return next
      })
    },
    []
  )

  const update = useCallback((patch: Partial<CalendarPreferences>) => change(() => patch), [change])

  /** Ticks or unticks one kind in the sidebar list and remembers it. */
  const setTypeShown = useCallback(
    (type: string, shown: boolean) =>
      change((current) => {
        const others = current.hiddenTypes.filter((hidden) => hidden !== type)
        return { hiddenTypes: shown ? others : [...others, type] }
      }),
    [change]
  )

  return { preferences, update, setTypeShown }
}
