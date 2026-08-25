'use client'

import { useCallback, useEffect, useState } from 'react'
import { type LaneGrouping, isLaneGrouping } from '../utils/lanes'

/**
 * How far the week timeline is zoomed in, as a multiple of the height that
 * fits the whole day on screen.
 *
 * A continuous number rather than named steps, because the gesture that drives
 * it is a wheel: 1 fills the board exactly, and anything above it makes the
 * hours taller and scrolls.
 */
export const MIN_ZOOM = 1
export const MAX_ZOOM = 6
export const ZOOM_STEP = 0.15

export function clampZoom(value: number): number {
  if (!Number.isFinite(value)) return MIN_ZOOM
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round(value * 100) / 100))
}

/**
 * How the week draws itself.
 *
 * `timeline` puts every lane on a clock, which is what a shop planning by the
 * hour wants and what the whole feature was asked for. `cards` is a row per
 * lane and a column per day: no times, but it fits a fifteen-technician shop on
 * one screen, which the timeline cannot.
 */
export type BoardLayout = 'timeline' | 'cards'

export const BOARD_LAYOUTS: BoardLayout[] = ['timeline', 'cards']

export function isBoardLayout(value: unknown): value is BoardLayout {
  return typeof value === 'string' && (BOARD_LAYOUTS as string[]).includes(value)
}

/** Minutes a drag snaps to. Kept separate from the visible slot lines. */
export const SNAP_CHOICES = [5, 10, 15, 30] as const
export type SnapMinutes = (typeof SNAP_CHOICES)[number]

export type BoardPreferences = {
  grouping: LaneGrouping
  layout: BoardLayout
  zoom: number
  /** Saturday and Sunday columns. Most shops do not want them. */
  showWeekends: boolean
  snapMinutes: SnapMinutes
  /**
   * Lanes this person has taken off their board.
   *
   * A fifteen-technician shop is seventy-five columns across a week, which is
   * three screens of sideways scrolling and names truncated to nothing. Most of
   * the time someone is looking at their own half of the shop, so the board
   * lets them say which lanes those are.
   */
  hiddenLaneIds: string[]
}

export const DEFAULT_PREFERENCES: BoardPreferences = {
  grouping: 'technician',
  layout: 'timeline',
  zoom: MIN_ZOOM,
  showWeekends: false,
  snapMinutes: 15,
  hiddenLaneIds: [],
}

const STORAGE_KEY = 'workboard.preferences'

function readStored(): Partial<BoardPreferences> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as Record<string, unknown>
    const out: Partial<BoardPreferences> = {}
    if (isLaneGrouping(parsed.grouping)) out.grouping = parsed.grouping
    if (isBoardLayout(parsed.layout)) out.layout = parsed.layout
    if (typeof parsed.zoom === 'number') out.zoom = clampZoom(parsed.zoom)
    if (typeof parsed.showWeekends === 'boolean') out.showWeekends = parsed.showWeekends
    if (SNAP_CHOICES.includes(parsed.snapMinutes as SnapMinutes)) {
      out.snapMinutes = parsed.snapMinutes as SnapMinutes
    }
    if (Array.isArray(parsed.hiddenLaneIds)) {
      out.hiddenLaneIds = parsed.hiddenLaneIds.filter((id): id is string => typeof id === 'string')
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
