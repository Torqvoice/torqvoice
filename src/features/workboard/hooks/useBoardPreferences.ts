'use client'

import { useCallback, useEffect, useState } from 'react'
import { type LaneGrouping, isLaneGrouping } from '../utils/lanes'

/**
 * How tall an hour is on the week timeline. A shop booking half-hour slots
 * wants the rows tight enough to see Monday to Friday at once; one booking
 * quarter-hour slots needs the room.
 */
export type BoardDensity = 'compact' | 'comfortable' | 'spacious'

export const HOUR_HEIGHT: Record<BoardDensity, number> = {
  compact: 40,
  comfortable: 60,
  spacious: 88,
}

export const DENSITY_ORDER: BoardDensity[] = ['compact', 'comfortable', 'spacious']

/** Minutes a drag snaps to. Kept separate from the visible slot lines. */
export const SNAP_CHOICES = [5, 10, 15, 30] as const
export type SnapMinutes = (typeof SNAP_CHOICES)[number]

export type BoardPreferences = {
  grouping: LaneGrouping
  density: BoardDensity
  /** Saturday and Sunday columns. Most shops do not want them. */
  showWeekends: boolean
  snapMinutes: SnapMinutes
}

export const DEFAULT_PREFERENCES: BoardPreferences = {
  grouping: 'technician',
  density: 'comfortable',
  showWeekends: false,
  snapMinutes: 15,
}

const STORAGE_KEY = 'workboard.preferences'

function readStored(): Partial<BoardPreferences> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as Record<string, unknown>
    const out: Partial<BoardPreferences> = {}
    if (isLaneGrouping(parsed.grouping)) out.grouping = parsed.grouping
    if (DENSITY_ORDER.includes(parsed.density as BoardDensity)) {
      out.density = parsed.density as BoardDensity
    }
    if (typeof parsed.showWeekends === 'boolean') out.showWeekends = parsed.showWeekends
    if (SNAP_CHOICES.includes(parsed.snapMinutes as SnapMinutes)) {
      out.snapMinutes = parsed.snapMinutes as SnapMinutes
    }
    return out
  } catch {
    return {}
  }
}

/**
 * Board preferences, kept on the device.
 *
 * These are how one person likes to look at the week, not shop configuration,
 * so they live in localStorage next to the fullscreen preference rather than in
 * workshop settings. They are read after mount so the server-rendered markup
 * and the first client render agree.
 */
export function useBoardPreferences(overrides?: Partial<BoardPreferences>) {
  const [preferences, setPreferences] = useState<BoardPreferences>({
    ...DEFAULT_PREFERENCES,
    ...overrides,
  })

  useEffect(() => {
    const stored = readStored()
    if (Object.keys(stored).length === 0) return
    setPreferences((current) => ({ ...current, ...stored, ...overrides }))
    // Overrides come from the URL and are fixed for the life of the page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const update = useCallback((patch: Partial<BoardPreferences>) => {
    setPreferences((current) => {
      const next = { ...current, ...patch }
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
      } catch {
        // A browser refusing storage should not stop the board from changing.
      }
      return next
    })
  }, [])

  return { preferences, update }
}
