'use client'

import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { Responsive, useContainerWidth, type Layout } from 'react-grid-layout'
import { cn } from '@/lib/utils'
import { Skeleton } from '@/components/ui/skeleton'
import {
  CARD_MIN_H,
  CARD_MIN_W,
  COLLAPSED_CARD_H,
  DEFAULT_LAYOUT,
  GRID_COLS,
  GRID_MARGIN,
  GRID_ROW_HEIGHT,
  gridHeightPx,
  type CardLayout,
} from '../dashboard-grid-config'

/**
 * The dashboard's 12-column drag/resize grid (react-grid-layout v2).
 * Purely presentational: card positions come in via `cards`, commits go out
 * through `onCardsCommit` when the user rearranges or resizes in edit mode.
 * Below the lg breakpoint the grid renders a compacted single column and is
 * never interactive.
 *
 * `collapsedIds` are cards with nothing to show. They are drawn at
 * COLLAPSED_CARD_H rather than their stored height so a quiet dashboard is
 * not mostly blank. Collapsing stays on in edit mode, so entering it never
 * makes the page jump; simply moving a collapsed card leaves its stored
 * height alone, and only pulling its resize handle sets a new one.
 */
export function DashboardGrid({
  cards,
  visibleIds,
  editing,
  onCardsCommit,
  cardNodes,
  collapsedIds = [],
}: {
  cards: Record<string, CardLayout>
  visibleIds: string[]
  editing: boolean
  onCardsCommit: (cards: Record<string, CardLayout>) => void
  cardNodes: Partial<Record<string, ReactNode>>
  /** Ids of cards that currently have no rows to show. */
  collapsedIds?: string[]
}) {
  const { width, containerRef, mounted } = useContainerWidth()
  const [breakpoint, setBreakpoint] = useState('lg')
  // The container width keeps moving briefly after mount (sidebar mount /
  // collapse transition, scrollbar appearance). The grid stays invisible and
  // unanimated until the measured width has been stable for a beat, then
  // fades in at its final layout — `width` in the deps restarts the timer on
  // every change, and once ready it stays ready.
  const [ready, setReady] = useState(false)
  useEffect(() => {
    if (!mounted || ready) return
    const timer = setTimeout(() => setReady(true), 300)
    return () => clearTimeout(timer)
  }, [mounted, width, ready])
  const interactive = editing && breakpoint === 'lg'

  const collapsed = new Set(collapsedIds)
  /** The height a card is actually drawn at, collapsed or not. */
  const drawnHeight = (id: string) =>
    collapsed.has(id) ? Math.min(cards[id].h, COLLAPSED_CARD_H) : cards[id].h

  const layout: Layout = visibleIds.map((id) => ({
    i: id,
    ...cards[id],
    h: drawnHeight(id),
    minW: CARD_MIN_W,
    minH: CARD_MIN_H,
  }))

  const handleLayoutChange = (next: Layout) => {
    // Only user edits on the full grid are persisted; the generated
    // single-column layout on small screens never overwrites saved positions.
    if (!editing || breakpoint !== 'lg') return
    const merged = { ...cards }
    let changed = false
    for (const item of next) {
      const id = item.i
      const prev = merged[id]
      if (!prev) continue
      // A collapsed card is drawn shorter than it is stored. Coming back
      // from the grid at exactly that drawn height means nothing was
      // resized, so keep the stored height; any other value is the user
      // having pulled the handle, and that is a real choice.
      const h = collapsed.has(id) && item.h === drawnHeight(id) ? prev.h : item.h
      if (prev.x !== item.x || prev.y !== item.y || prev.w !== item.w || prev.h !== h) {
        merged[id] = { x: item.x, y: item.y, w: item.w, h }
        changed = true
      }
    }
    if (changed) onCardsCommit(merged)
  }

  return (
    <div ref={containerRef}>
      {!ready && (
        // Placeholder mirroring the default two-column card layout while the
        // container width settles; the real grid mounts only at stable width.
        // Height comes from the grid model, so the skeleton and the card that
        // replaces it are the same size and nothing reflows on mount.
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton
              key={i}
              className="rounded-xl"
              style={{ height: gridHeightPx(DEFAULT_LAYOUT.cards.maintenance.h) }}
            />
          ))}
        </div>
      )}
      {ready && (
        <Responsive
          className={cn(
            'dashboard-grid animate-in fade-in duration-200',
            editing && 'dashboard-grid-editing'
          )}
          width={width}
          layouts={{ lg: layout }}
          breakpoints={{ lg: 900, xs: 0 }}
          cols={{ lg: GRID_COLS, xs: 1 }}
          rowHeight={GRID_ROW_HEIGHT}
          margin={GRID_MARGIN}
          containerPadding={[0, 0]}
          dragConfig={{ enabled: interactive, cancel: '.dashboard-no-drag' }}
          resizeConfig={{ enabled: interactive, handles: ['se'] }}
          onBreakpointChange={(bp) => setBreakpoint(bp)}
          onLayoutChange={handleLayoutChange}
        >
          {visibleIds.map((id) => (
            <div key={id} className="dashboard-card-wrap relative">
              {cardNodes[id]}
              {editing && (
                // Wiggle-mode overlay: makes the whole tile the drag surface
                // and shields the card's own links/buttons while rearranging
                <div className="absolute inset-0 z-10 cursor-grab rounded-xl ring-2 ring-primary/40 transition-shadow hover:ring-primary active:cursor-grabbing" />
              )}
            </div>
          ))}
        </Responsive>
      )}
    </div>
  )
}
