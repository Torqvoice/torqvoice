'use client'

import { useCallback, useEffect, useState } from 'react'

/**
 * How this person likes the calendar drawn. Kept in the browser: these are
 * viewing habits, not workshop data, and a planner on the front desk PC and
 * a phone in the pit may well want different ones.
 */
export interface CalendarPreferences {
  showWeekends: boolean
  showCompleted: boolean
  showWeekNumbers: boolean
  sidebarOpen: boolean
}

const STORAGE_KEY = 'torqvoice.calendar.preferences'

const DEFAULTS: CalendarPreferences = {
  showWeekends: true,
  showCompleted: true,
  showWeekNumbers: false,
  sidebarOpen: true,
}

function read(): CalendarPreferences {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULTS
    const parsed = JSON.parse(raw) as Partial<CalendarPreferences>
    return { ...DEFAULTS, ...parsed }
  } catch {
    return DEFAULTS
  }
}

export function useCalendarPreferences() {
  // Defaults on the server and the first client paint, so hydration agrees;
  // the stored values land right after.
  const [preferences, setPreferences] = useState<CalendarPreferences>(DEFAULTS)

  useEffect(() => {
    setPreferences(read())
  }, [])

  const update = useCallback((patch: Partial<CalendarPreferences>) => {
    setPreferences((current) => {
      const next = { ...current, ...patch }
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
      } catch {
        // Private mode or a full store: the choice still applies for the session.
      }
      return next
    })
  }, [])

  return { preferences, update }
}
