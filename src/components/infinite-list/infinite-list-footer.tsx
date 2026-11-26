'use client'

import { useTranslations } from 'next-intl'
import { type RefObject, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { TableCell, TableRow } from '@/components/ui/table'
import { cn } from '@/lib/utils'
import type { InfiniteRowsState } from './use-infinite-rows'

/**
 * The end of an infinite list, inside its scroll box: the marker that asks for
 * the next batch about a screen before the rows run out, the placeholders
 * while one is slow, a quiet Retry when one failed, and a last line once
 * everything is shown. It also remembers how far its box was scrolled, so
 * Back to the list lands where it was left.
 *
 * `InfiniteTableFooter` goes last in a `<TableBody>`, `InfiniteListFooter`
 * last in a list of cards. A page with both gives each its own `slot`.
 */

/**
 * Where each list's boxes were scrolled to, for as long as the tab lives:
 * how far the box was scrolled past the top of the list, so that something
 * above the list that is drawn a moment later than the list itself (the
 * classic vehicle page's invitation banner) does not move the place.
 */
const scrollMemory = new Map<string, number>()

/**
 * Which list each scroll box last showed, per slot. A page that swaps its
 * rows for placeholders while a search loads (the vehicles grid) unmounts
 * the footer but keeps the box, scrolled where it was; the footer that
 * mounts with the new list finds the old one recorded here and starts at the
 * top, as a footer that stayed mounted would.
 */
const boxShowed = new WeakMap<Element, Map<string, string>>()

/**
 * Back to the top of a new list. When the box holds more than the list (a
 * settings pane with a card above it), the top is where the element marked
 * `data-infinite-list` starts, and the box only moves up to it, never down.
 */
function scrollToListTop(box: HTMLElement, marker: HTMLElement | null) {
  const start = marker?.closest<HTMLElement>('[data-infinite-list]')
  if (!start) {
    box.scrollTop = 0
    return
  }
  box.scrollTop = Math.max(0, Math.min(box.scrollTop, topInBox(box, start)))
}

/** Where `el` starts in the scrolled content of `box`. */
function topInBox(box: HTMLElement, el: HTMLElement) {
  const boxTop = box === document.scrollingElement ? 0 : box.getBoundingClientRect().top
  return el.getBoundingClientRect().top - boxTop + box.scrollTop
}

/**
 * Keeps a restored place for a moment while the page settles: a browser
 * without scroll anchoring (Safari) would otherwise let content drawn above
 * the list after the restore push the rows down. Anyone scrolling, tapping or
 * typing ends it at once.
 */
function holdPlace(box: HTMLElement, list: HTMLElement, offset: number) {
  let frame = 0
  const until = performance.now() + 1000
  const inputs = ['wheel', 'touchstart', 'pointerdown', 'keydown'] as const
  const stop = () => {
    cancelAnimationFrame(frame)
    for (const type of inputs) window.removeEventListener(type, stop, true)
  }
  const tick = () => {
    if (performance.now() > until || !list.isConnected) return stop()
    const want = topInBox(box, list) + offset
    if (Math.abs(box.scrollTop - want) > 1) box.scrollTop = want
    frame = requestAnimationFrame(tick)
  }
  for (const type of inputs) window.addEventListener(type, stop, { capture: true, passive: true })
  frame = requestAnimationFrame(tick)
  return stop
}

/** The nearest ancestor that scrolls, which is what the marker is watched against. */
function scrollParent(el: HTMLElement | null): HTMLElement | null {
  let node = el?.parentElement ?? null
  while (node) {
    const { overflowY } = getComputedStyle(node)
    if (overflowY === 'auto' || overflowY === 'scroll') return node
    node = node.parentElement
  }
  return null
}

/** True only once `on` has stayed true for `delay` ms, so a quick batch shows nothing. */
function useDelayedFlag(on: boolean, delay = 300) {
  const [shown, setShown] = useState(false)
  useEffect(() => {
    if (!on) {
      setShown(false)
      return
    }
    const timer = setTimeout(() => setShown(true), delay)
    return () => clearTimeout(timer)
  }, [on, delay])
  return shown
}

function useListEnd<T extends HTMLElement>(state: InfiniteRowsState, slot: string) {
  const marker = useRef<T>(null)
  const { reportNearEnd, listKey } = state

  useEffect(() => {
    const el = marker.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[entries.length - 1]
        if (entry) reportNearEnd(slot, entry.isIntersecting)
      },
      // A screen's height ahead of the end, so the next rows are usually there
      // before anyone reaches them.
      { root: scrollParent(el), rootMargin: '0px 0px 100% 0px' }
    )
    observer.observe(el)
    return () => {
      observer.disconnect()
      reportNearEnd(slot, false)
    }
  }, [slot, reportNearEnd])

  // Back to the list restores where it was scrolled; another filter, search
  // or sort starts at the top. Before paint, so neither shows a frame of the
  // wrong place.
  const shownKey = useRef<string | null>(null)
  useLayoutEffect(() => {
    // A list on a page that scrolls as a whole has no box of its own: the
    // window is its box, and the window is what sends its scroll events.
    const own = scrollParent(marker.current)
    const box = own ?? (document.scrollingElement as HTMLElement | null)
    const list = marker.current?.parentElement
    if (!marker.current || !list || !box) return
    const events: EventTarget = own ?? window
    const key = `${listKey}|${slot}`
    // Only a box of the list's own: the window outlives every page, and a
    // page that has just opened starts at its top anyway.
    let showed = own ? boxShowed.get(own) : undefined
    if (own && !showed) {
      showed = new Map()
      boxShowed.set(own, showed)
    }
    const before = shownKey.current ?? showed?.get(slot) ?? null
    const saved = scrollMemory.get(key)
    let release: (() => void) | undefined
    if (shownKey.current === null && saved !== undefined) {
      box.scrollTop = topInBox(box, list) + saved
      release = holdPlace(box, list, saved)
    } else if (before !== null && before !== listKey) {
      scrollToListTop(box, marker.current)
      scrollMemory.delete(key)
    }
    shownKey.current = listKey
    showed?.set(slot, listKey)
    const remember = () => scrollMemory.set(key, box.scrollTop - topInBox(box, list))
    events.addEventListener('scroll', remember, { passive: true })
    return () => {
      release?.()
      events.removeEventListener('scroll', remember)
    }
  }, [listKey, slot])

  return { marker, showSkeleton: useDelayedFlag(state.loadingMore) }
}

function FailedLine({ onRetry }: { onRetry: () => void }) {
  const t = useTranslations('common.infiniteList')
  return (
    <p className="flex items-center justify-center gap-1 text-sm text-muted-foreground">
      {t('loadFailed')}
      <span aria-hidden="true">·</span>
      <Button variant="link" size="sm" className="h-auto p-0" onClick={onRetry}>
        {t('retry')}
      </Button>
    </p>
  )
}

function AllShownLine({ total }: { total: number }) {
  const t = useTranslations('common.infiniteList')
  return <p className="text-center text-xs text-muted-foreground">{t('allShown', { total })}</p>
}

const PLACEHOLDERS = [0, 1, 2]

/**
 * How many columns the table shows at its present width. Columns that drop
 * out on a narrow screen are hidden cells, and a fixed-layout table still
 * makes room for every column a row spans: spanning the hidden ones too left
 * empty columns at the right and squeezed the ones on screen.
 */
function useShownColumns(marker: RefObject<HTMLTableRowElement | null>, colSpan: number) {
  const [shown, setShown] = useState(colSpan)
  useLayoutEffect(() => {
    const table = marker.current?.closest('table')
    if (!table) return
    const count = () => {
      const head = table.tHead?.rows[0]
      if (!head) return colSpan
      let n = 0
      for (const cell of Array.from(head.cells)) {
        if (getComputedStyle(cell).display !== 'none') n += cell.colSpan
      }
      return Math.min(n || colSpan, colSpan)
    }
    setShown(count())
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => setShown(count()))
    observer.observe(table)
    return () => observer.disconnect()
  }, [marker, colSpan])
  return shown
}

export function InfiniteTableFooter({
  state,
  colSpan,
  slot = 'table',
}: {
  state: InfiniteRowsState
  /** Every column the table shows, so the footer rows span the whole width. */
  colSpan: number
  slot?: string
}) {
  const { marker, showSkeleton } = useListEnd<HTMLTableRowElement>(state, slot)
  const span = useShownColumns(marker, colSpan)
  const plain = 'border-0 hover:bg-transparent'
  return (
    <>
      {showSkeleton &&
        !state.failed &&
        PLACEHOLDERS.map((i) => (
          <TableRow key={`placeholder-${i}`} aria-hidden="true" className={plain}>
            <TableCell colSpan={span} className="py-3">
              <Skeleton className="h-7 w-full" />
            </TableCell>
          </TableRow>
        ))}
      {state.failed && (
        <TableRow className={plain}>
          <TableCell colSpan={span} className="py-3">
            <FailedLine onRetry={state.retry} />
          </TableCell>
        </TableRow>
      )}
      {!state.hasMore && state.grown && (
        <TableRow className={plain}>
          <TableCell colSpan={span} className="py-3">
            <AllShownLine total={state.total} />
          </TableCell>
        </TableRow>
      )}
      {/* One cell only: the marker is in the server's HTML, before anything
          can count the columns on screen, and spans nothing it would widen. */}
      <tr ref={marker} data-infinite-marker="">
        <td className="h-px p-0" />
      </tr>
    </>
  )
}

export function InfiniteListFooter({
  state,
  slot = 'cards',
  placeholderClassName = 'h-[88px] rounded-lg',
}: {
  state: InfiniteRowsState
  slot?: string
  /** The size of one card, so the placeholders stand where the rows will. */
  placeholderClassName?: string
}) {
  const { marker, showSkeleton } = useListEnd<HTMLDivElement>(state, slot)
  return (
    <>
      {showSkeleton &&
        !state.failed &&
        PLACEHOLDERS.map((i) => (
          <Skeleton
            key={`placeholder-${i}`}
            aria-hidden="true"
            className={cn('w-full', placeholderClassName)}
          />
        ))}
      {state.failed && (
        <div className="py-3">
          <FailedLine onRetry={state.retry} />
        </div>
      )}
      {!state.hasMore && state.grown && (
        <div className="py-3">
          <AllShownLine total={state.total} />
        </div>
      )}
      <div ref={marker} aria-hidden="true" data-infinite-marker="" className="h-px" />
    </>
  )
}

/**
 * How much of the list is on screen, read politely to a screen reader as
 * batches arrive: "120 of 1,284", or the plain count once all are shown.
 */
export function InfiniteListCount({
  shown,
  total,
  className,
}: {
  shown: number
  total: number
  className?: string
}) {
  const t = useTranslations('common.infiniteList')
  if (total === 0) return null
  return (
    <p
      aria-live="polite"
      aria-atomic="true"
      className={cn('whitespace-nowrap text-xs tabular-nums text-muted-foreground', className)}
    >
      {shown >= total ? t('countAll', { total }) : t('count', { shown, total })}
    </p>
  )
}
