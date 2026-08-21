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

/** Pixels gained or lost by changing a card's height by one grid row. */
const ROW_STEP = GRID_ROW_HEIGHT + GRID_MARGIN[1]

/** Long enough for the grid's 200ms height transition to finish first. */
const SETTLE_MS = 260

/**
 * The dashboard's 12-column drag/resize grid (react-grid-layout v2).
 * Purely presentational: card positions come in via `cards`, commits go out
 * through `onCardsCommit` when the user rearranges or resizes in edit mode.
 * Below the lg breakpoint the grid renders a compacted single column and is
 * never interactive.
 *
 * Cards are drawn no taller than they need to be. A stored height is a
 * ceiling, not a target: once the grid has settled, any card with a whole
 * grid row of unused space below its content gives that space back, and a
 * card whose content later outgrows its tile takes it back up to the stored
 * height. `collapsedIds` covers the one case measurement cannot see — an
 * empty state fills its box by design, so it reports no slack — by dropping
 * those cards straight to COLLAPSED_CARD_H.
 *
 * Both are display-only: the user's stored height is never overwritten by a
 * height they did not choose, and neither shrinking nor collapsing is paused
 * in edit mode, so opening it never makes the page jump.
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
  /** Heights measurement has settled on, keyed by card id. */
  const [fitted, setFitted] = useState<Record<string, number>>({})

  /** The height a card is actually drawn at, which is never its full one. */
  const drawnHeight = (id: string) => {
    const stored = cards[id].h
    if (collapsed.has(id)) return Math.min(stored, COLLAPSED_CARD_H)
    return Math.min(stored, fitted[id] ?? stored)
  }

  // Measure once the grid has stopped moving. The answer is absolute rather
  // than a nudge in one direction, so a card lands on its height in a single
  // pass; returning the previous state unchanged ends the loop, since
  // `fitted` is what re-runs this.
  const idsKey = visibleIds.join('|')
  const collapsedKey = collapsedIds.join('|')
  useEffect(() => {
    if (!ready || editing) return
    const timer = setTimeout(() => {
      const root = containerRef.current
      if (!root) return
      setFitted((prev) => {
        const next = { ...prev }
        let changed = false
        for (const id of visibleIds) {
          const stored = cards[id]
          if (!stored || collapsed.has(id)) continue
          const wrap = root.querySelector<HTMLElement>(`[data-card-id="${CSS.escape(id)}"]`)
          const scroller = wrap && contentRegion(wrap)
          if (!scroller) continue
          const current = prev[id] ?? stored.h
          const needed = neededRows(wrap, scroller)
          if (needed === null) continue
          const want = Math.max(CARD_MIN_H, Math.min(stored.h, needed))
          if (want !== current) {
            next[id] = want
            changed = true
          }
        }
        return changed ? next : prev
      })
    }, SETTLE_MS)
    return () => clearTimeout(timer)
    // Keyed on joined ids rather than the arrays themselves, so a parent
    // re-render does not restart the timer before it can fire.
  }, [ready, editing, idsKey, collapsedKey, cards, fitted])

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
      // A card is drawn at its fitted height, not its stored one. Coming
      // back at exactly that height means nothing was resized, so keep what
      // is stored; any other value is the user having pulled the handle,
      // and that is a real choice.
      const h = item.h === drawnHeight(id) ? prev.h : item.h
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
            <div key={id} data-card-id={id} className="dashboard-card-wrap relative">
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

/**
 * Grid rows this card needs to show everything it has, or null if that
 * cannot be worked out.
 *
 * Deliberately not `scrollHeight`: that never reports less than the box it
 * is in, so a card with room to spare looks exactly like one filled to the
 * brim. The content is measured from the top of its first child to the
 * bottom of its last instead, which also picks up the margins between them,
 * and the card's fixed furniture — header, tabs, footer — is added on top.
 *
 * An empty state is the case this still cannot see: it fills its box on
 * purpose, so it measures as exactly full. Those cards come through
 * `collapsedIds` instead.
 */
function neededRows(wrap: HTMLElement, scroller: HTMLElement): number | null {
  const card = wrap.firstElementChild
  if (!card) return null

  let furniturePx = 0
  for (const part of card.children) {
    if (part !== scroller) furniturePx += part.getBoundingClientRect().height
  }

  const style = getComputedStyle(scroller)
  const paddingPx = Number.parseFloat(style.paddingTop) + Number.parseFloat(style.paddingBottom)
  const kids = scroller.children
  const contentPx =
    kids.length === 0
      ? 0
      : kids[kids.length - 1].getBoundingClientRect().bottom - kids[0].getBoundingClientRect().top

  // h rows measure h * GRID_ROW_HEIGHT + (h - 1) * marginY pixels.
  const needed = furniturePx + paddingPx + contentPx + GRID_MARGIN[1]
  return Math.ceil(needed / ROW_STEP)
}

/**
 * The scrolling region of whichever card markup this tile holds: AppCard
 * names its own, and legacy Card markup leaves it as the last child that is
 * not a footer — the same rule the grid's CSS uses to pick the scroll area.
 */
function contentRegion(wrap: HTMLElement): HTMLElement | null {
  const named = wrap.querySelector<HTMLElement>('[data-slot="app-card-content"]')
  if (named) return named
  const last = wrap.firstElementChild?.lastElementChild
  if (!(last instanceof HTMLElement)) return null
  return last.dataset.slot === 'app-card-footer' ? null : last
}
