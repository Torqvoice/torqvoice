'use client'

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import type { Anchor, Block, DocumentSpec, FlowRow, PageSpec } from '../Spec/documentSpec'
import {
  BLOCK_GAP,
  layoutDocument,
  marginOf,
  type DocumentLayout,
  type PlacedRect,
} from './layoutEngine'
import { RenderNode, textCss } from './renderHtml'
import { fontStack } from '../Components/types'

/**
 * The sheet: A4, always, with the document laid on it.
 *
 * The editor measures each block at the width it prints at and computes the
 * whole layout from those numbers (layoutEngine), so the geometry it drags
 * against is the geometry it draws. A drag holds the block as a ghost under
 * the pointer and shows, live, what release would do: slot into a gap in the
 * flow, sit beside another block in a column, or stay exactly where it was
 * put while the flow makes room around it.
 */

const SHADOW_SHADES = ['rgba(0,0,0,0.13)', 'rgba(0,0,0,0.07)', 'rgba(0,0,0,0.03)']
/** How close a dragged edge has to come before it takes the guide. */
const SNAP = 6
/** How near a gap between rows the pointer must be to mean "insert here". */
const GAP_ZONE = 20
/** How far past a pairable row's edge still reads as joining its column. */
const PAIR_ZONE = 44
/** Inside the column, floats only start this far from any flow target. */
const FLOAT_ZONE = 56
/** Pointer travel, in screen pixels, before a press becomes a drag. */
const DRAG_THRESHOLD = 4

export interface Guide {
  axis: 'x' | 'y'
  at: number
  page: number
}

interface Drag {
  id: string
  origin: 'flow' | 'anchored' | 'pinned'
  /** Moving the block, or pulling one of its edges. */
  mode: 'move' | 'resize-left' | 'resize-right'
  /** Where in the block the pointer took hold, so it does not jump. */
  grabX: number
  grabY: number
  /** Where the pointer went down, for the threshold that separates a click. */
  p0x: number
  p0y: number
  startX: number
  startY: number
  width: number
  height: number
  page: number
  x: number
  y: number
  /** False until the pointer has travelled far enough to mean it. */
  active: boolean
}

/** What release would do, decided from where the pointer is. */
type Preview =
  | { kind: 'gap'; index: number; page: number; y: number }
  | {
      kind: 'pair'
      /** Insert before this lane neighbour, or after the row when null. */
      beforeId: string | null
      afterId: string
      side: 'left' | 'right'
      page: number
      y: number
      height: number
      /** Where the insertion line draws inside the lane. */
      lineY: number
    }
  | { kind: 'float' }

/** Every edge and centre a dragged thing can line up with on this sheet. */
function guidesFor(
  rects: Map<string, PlacedRect>,
  page: PageSpec,
  pageNumber: number,
  exclude: string
) {
  const xs = new Set<number>([page.margin.left, page.width - page.margin.right, page.width / 2])
  const ys = new Set<number>([page.margin.top, page.height - page.margin.bottom, page.height / 2])
  for (const [id, rect] of rects) {
    if (id === exclude) continue
    if (rect.page !== pageNumber && rect.page !== -1) continue
    xs.add(rect.x)
    xs.add(rect.x + rect.width / 2)
    xs.add(rect.x + rect.width)
    ys.add(rect.y)
    ys.add(rect.y + rect.height / 2)
    ys.add(rect.y + rect.height)
  }
  return { xs: [...xs], ys: [...ys] }
}

const PT_PER_MM = 72 / 25.4

/**
 * Centimetre scales along the top and left edge of a sheet, so a hand-placed
 * block can be put at a real distance rather than by eye alone. The dashed
 * outline showing the page margins draws with them.
 */
function SheetRulers({ width, height }: { width: number; height: number }) {
  const strip: React.CSSProperties = {
    position: 'absolute',
    background: 'rgba(255,255,255,0.88)',
    zIndex: 22,
    pointerEvents: 'none',
    fontFamily: "'IBM Plex Sans', sans-serif",
    fontSize: 6.5,
    color: '#8a8f97',
  }
  const ticks = (limit: number) => {
    const out: { at: number; major: boolean; label?: string }[] = []
    for (let mm = 5; mm * PT_PER_MM < limit; mm += 5) {
      const major = mm % 10 === 0
      out.push({ at: mm * PT_PER_MM, major, label: major ? String(mm / 10) : undefined })
    }
    return out
  }
  return (
    <>
      <div
        style={{
          ...strip,
          top: 0,
          left: 0,
          right: 0,
          height: 12,
          borderBottom: '1px solid #d7dade',
        }}
      >
        {ticks(width).map((tick) => (
          <div key={tick.at} style={{ position: 'absolute', left: tick.at, bottom: 0 }}>
            <div
              style={{
                position: 'absolute',
                bottom: 0,
                left: 0,
                width: 1,
                height: tick.major ? 7 : 4,
                background: '#b3b7bd',
              }}
            />
            {tick.label && (
              <span style={{ position: 'absolute', bottom: 3, left: 2 }}>{tick.label}</span>
            )}
          </div>
        ))}
      </div>
      <div
        style={{
          ...strip,
          top: 12,
          left: 0,
          bottom: 0,
          width: 12,
          borderRight: '1px solid #d7dade',
        }}
      >
        {ticks(height).map((tick) => (
          <div key={tick.at} style={{ position: 'absolute', top: tick.at - 12, right: 0 }}>
            <div
              style={{
                position: 'absolute',
                right: 0,
                top: 0,
                height: 1,
                width: tick.major ? 7 : 4,
                background: '#b3b7bd',
              }}
            />
            {tick.label && (
              <span style={{ position: 'absolute', top: 1, right: 3 }}>{tick.label}</span>
            )}
          </div>
        ))}
      </div>
    </>
  )
}

/** The nearest guide within reach, and what it would move the value to. */
function snapTo(value: number, size: number, candidates: number[]) {
  let best: { at: number; delta: number } | null = null
  // A thing lines up by its near edge, its centre or its far edge, whichever
  // comes closest: that is what makes aligning by eye unnecessary.
  const edges = [value, value + size / 2, value + size]
  for (const candidate of candidates) {
    for (const edge of edges) {
      const delta = candidate - edge
      if (Math.abs(delta) <= SNAP && (!best || Math.abs(delta) < Math.abs(best.delta))) {
        best = { at: candidate, delta }
      }
    }
  }
  return best
}

/** The earliest block of a row in flow order: what "insert before" means. */
function firstFlowId(row: FlowRow): string {
  if (row.type === 'single') return row.block.id
  const all = [...row.left, ...row.right]
  return all.reduce((first, b) =>
    b.placement.mode === 'flow' &&
    first.placement.mode === 'flow' &&
    b.placement.order < first.placement.order
      ? b
      : first
  ).id
}

/** The latest block of a row in flow order: what a new neighbour goes after. */
function lastFlowId(row: FlowRow): string {
  if (row.type === 'single') return row.block.id
  const all = [...row.left, ...row.right]
  return all.reduce((last, b) =>
    b.placement.mode === 'flow' &&
    last.placement.mode === 'flow' &&
    b.placement.order > last.placement.order
      ? b
      : last
  ).id
}

export function SpecCanvas({
  spec,
  selected,
  onSelect,
  onAnchor,
  onInsert,
  onPair,
  pairable,
  placeholderIds,
  zoom,
  rulers,
}: {
  spec: DocumentSpec
  selected: string | null
  onSelect: (id: string | null) => void
  /** Left where the drag put it, out of the flow. */
  onAnchor: (id: string, anchor: Anchor | undefined) => void
  /** Dropped back into the flow, before this block (or last, on null). */
  onInsert: (id: string, beforeId: string | null) => void
  /** Dropped into a column: before the named lane neighbour, or after the row. */
  onPair: (id: string, side: 'left' | 'right', beforeId: string | null, afterId: string) => void
  /** Blocks that may share a row in columns. */
  pairable: ReadonlySet<string>
  /**
   * Blocks standing in for something the workshop has not filled in. Marked
   * on the canvas because they read as real content otherwise, and print as
   * nothing at all.
   */
  placeholderIds?: ReadonlySet<string>
  zoom: number
  rulers: boolean
}) {
  const t = useTranslations('settings.designer')
  const placeholderLabel = t('placeholder')
  const measureRef = useRef<HTMLDivElement>(null)
  const pagesRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [heights, setHeights] = useState<number[]>([])
  /** Bumped when a late asset arrives, purely to run the measurement again. */
  const [measureTick, setMeasureTick] = useState(0)
  const [drag, setDrag] = useState<Drag | null>(null)
  const [preview, setPreview] = useState<Preview | null>(null)
  const [guides, setGuides] = useState<Guide[]>([])
  /** A release that was a drag must not read as the click that follows it. */
  const justDraggedRef = useRef(false)

  const contentWidth = spec.page.width - spec.page.margin.left - spec.page.margin.right
  const colWidth = (contentWidth - BLOCK_GAP) / 2
  const laneX = (side: 'left' | 'right') =>
    side === 'left' ? spec.page.margin.left : spec.page.margin.left + colWidth + BLOCK_GAP

  /** The width a block prints at, which is the width it must be measured at. */
  const widthFor = useCallback(
    (block: Block) => {
      if (block.placement.mode === 'anchored') {
        return block.placement.anchor.width ?? contentWidth
      }
      if (block.placement.mode === 'pinned') return contentWidth
      const m = marginOf(block)
      const lane = block.placement.mode === 'flow' && block.placement.column
      return (lane ? colWidth : contentWidth) - m.left - m.right
    },
    [contentWidth, colWidth]
  )

  /** The CSS that puts a flow block inside the room its margin reserves. */
  const marginCss = (block: Block): React.CSSProperties => {
    const m = marginOf(block)
    return block.margin
      ? { marginTop: m.top, marginRight: m.right, marginBottom: m.bottom, marginLeft: m.left }
      : {}
  }

  // Measured at print width, off-screen, so the layout below works in the
  // numbers the paper will use rather than whatever the browser wrapped.
  useLayoutEffect(() => {
    const node = measureRef.current
    if (!node) return
    const next = Array.from(node.children).map((child) => (child as HTMLElement).offsetHeight)
    setHeights((prev) =>
      prev.length === next.length && prev.every((h, i) => h === next[i]) ? prev : next
    )
  })

  // A logo or a webfont arriving after first paint changes the heights without
  // causing a render, so their arrival has to ask for one.
  useEffect(() => {
    const node = measureRef.current
    if (!node) return
    const bump = () => setMeasureTick((t) => t + 1)
    const images = Array.from(node.querySelectorAll('img')).filter((img) => !img.complete)
    for (const img of images) img.addEventListener('load', bump)
    document.fonts?.ready.then(bump).catch(() => {
      // A font that never arrives leaves the fallback metrics, which is fine.
    })
    return () => {
      for (const img of images) img.removeEventListener('load', bump)
    }
  }, [spec])
  void measureTick

  const heightById = useMemo(() => {
    const map = new Map<string, number>()
    spec.blocks.forEach((block, i) => map.set(block.id, heights[i] ?? 0))
    return map
  }, [spec, heights])
  const heightOf = useCallback((id: string) => heightById.get(id) ?? 0, [heightById])

  /** The document as it is, with nothing held by the pointer. */
  const baseLayout = useMemo(() => layoutDocument(spec, heightOf, {}), [spec, heightOf])

  const dragActive = drag !== null && drag.active && drag.mode === 'move'
  const liftedId = dragActive ? drag.id : undefined

  /** The document with the held block absent: what drops are measured against. */
  const liftedLayout: DocumentLayout = useMemo(
    () => (liftedId ? layoutDocument(spec, heightOf, { liftedId }) : baseLayout),
    [spec, heightOf, liftedId, baseLayout]
  )

  /** What is drawn: the lifted layout, adapted live to what release would do. */
  const renderLayout: DocumentLayout = useMemo(() => {
    if (!dragActive || !drag) return baseLayout
    if (preview?.kind === 'gap') {
      return layoutDocument(spec, heightOf, {
        liftedId: drag.id,
        gapInsert: { index: preview.index, height: drag.height },
      })
    }
    if (preview?.kind === 'pair') return liftedLayout
    return layoutDocument(spec, heightOf, {
      liftedId: drag.id,
      band: { page: drag.page, x: drag.x, y: drag.y, width: drag.width, height: drag.height },
    })
  }, [dragActive, drag, preview, spec, heightOf, baseLayout, liftedLayout])

  // Geometry the drag reads, kept in a ref so pointer handlers and the drag
  // itself never work from a stale render. Nothing renders from it.
  const rectsRef = useRef<Map<string, PlacedRect>>(baseLayout.rects)
  rectsRef.current = dragActive ? liftedLayout.rects : baseLayout.rects

  const anchored = spec.blocks.filter((b) => b.placement.mode === 'anchored' && b.id !== liftedId)
  const pinned = spec.blocks.filter((b) => b.placement.mode === 'pinned' && b.id !== liftedId)

  /** The sheet under the pointer, and where on it the pointer is, in points. */
  const locate = useCallback(
    (clientX: number, clientY: number) => {
      const root = pagesRef.current
      if (!root) return null
      let best: { page: number; rect: DOMRect; dist: number } | null = null
      for (const sheet of Array.from(root.querySelectorAll('[data-sheet]'))) {
        const rect = sheet.getBoundingClientRect()
        const page = Number((sheet as HTMLElement).dataset.sheet)
        const dist =
          clientY < rect.top
            ? rect.top - clientY
            : clientY > rect.bottom
              ? clientY - rect.bottom
              : 0
        if (!best || dist < best.dist) best = { page, rect, dist }
      }
      if (!best) return null
      return {
        page: best.page,
        x: (clientX - best.rect.left) / zoom,
        y: Math.min(Math.max((clientY - best.rect.top) / zoom, 0), spec.page.height),
      }
    },
    [zoom, spec.page.height]
  )

  const startDrag = useCallback(
    (event: React.PointerEvent, block: Block, page: number, mode: Drag['mode'] = 'move') => {
      if (event.button !== 0) return
      const rect = rectsRef.current.get(block.id)
      if (!rect) return
      const sheet = (event.currentTarget as HTMLElement).closest('[data-sheet]')
      if (!sheet) return
      const base = sheet.getBoundingClientRect()
      event.stopPropagation()
      event.preventDefault()
      // Focus stays on the canvas so the arrow keys can nudge what was picked.
      containerRef.current?.focus()
      onSelect(block.id)
      const px = (event.clientX - base.x) / zoom
      const py = (event.clientY - base.y) / zoom
      setDrag({
        id: block.id,
        origin: block.placement.mode,
        mode,
        grabX: px - rect.x,
        grabY: py - rect.y,
        p0x: px,
        p0y: py,
        startX: rect.x,
        startY: rect.y,
        width: rect.width,
        height: rect.height,
        page,
        x: rect.x,
        y: rect.y,
        // An edge pull is deliberate from the first pixel; a move must first
        // travel far enough to be more than a click.
        active: mode !== 'move',
      })
    },
    [zoom, onSelect]
  )

  const handleMove = useCallback(
    (event: PointerEvent) => {
      if (!drag) return
      const at = locate(event.clientX, event.clientY)
      if (!at) return

      if (drag.mode !== 'move') {
        // Pulling an edge: the opposite edge stays put, and the edge under the
        // pointer takes the nearest guide, so two boxes line up exactly.
        const { xs } = guidesFor(rectsRef.current, spec.page, drag.page, drag.id)
        let edge = at.x
        const nearest = xs.reduce<{ at: number; delta: number } | null>((best, candidate) => {
          const delta = candidate - edge
          return Math.abs(delta) <= SNAP && (!best || Math.abs(delta) < Math.abs(best.delta))
            ? { at: candidate, delta }
            : best
        }, null)
        setGuides(nearest ? [{ axis: 'x', at: nearest.at, page: drag.page }] : [])
        if (nearest) edge += nearest.delta

        const MIN = 40
        const right = drag.startX + drag.width
        if (drag.mode === 'resize-right') {
          onAnchor(drag.id, {
            x: Math.round(drag.startX),
            y: Math.round(drag.startY),
            width: Math.round(Math.max(MIN, edge - drag.startX)),
            page: drag.page,
          })
        } else {
          const x = Math.min(edge, right - MIN)
          onAnchor(drag.id, {
            x: Math.round(x),
            y: Math.round(drag.startY),
            width: Math.round(right - x),
            page: drag.page,
          })
        }
        return
      }

      if (!drag.active) {
        const travelled = Math.hypot(at.x - drag.p0x, at.y - drag.p0y) * zoom
        if (travelled < DRAG_THRESHOLD) return
      }

      let x = at.x - drag.grabX
      let y = at.y - drag.grabY

      // What would release do here? Near a gap in the flow it inserts; near a
      // row that can share, it joins the column under the pointer, at the spot
      // under the pointer; only clear of both does it stay put as a free
      // placement while the flow makes room.
      let next: Preview = { kind: 'float' }
      const overColumn =
        at.x > spec.page.margin.left - 30 && at.x < spec.page.width - spec.page.margin.right + 30
      if (drag.origin !== 'pinned' && overColumn) {
        const gaps = liftedLayout.gaps.filter((g) => g.page === at.page)
        const gap = gaps.reduce<(typeof gaps)[number] | null>(
          (best, g) => (!best || Math.abs(at.y - g.y) < Math.abs(at.y - best.y) ? g : best),
          null
        )
        const gapDistance = gap ? Math.abs(at.y - gap.y) : Infinity

        // The nearest row a column-eligible block could join, with a reach
        // past its edge: lifting a block shrinks its old row, and the space
        // it vacated must still read as "back into this column".
        let pairHit: { row: (typeof liftedLayout.rows)[number]; distance: number } | null = null
        if (pairable.has(drag.id)) {
          for (const r of liftedLayout.rows) {
            if (r.page !== at.page) continue
            const joinable =
              r.row.type === 'pair' || (r.row.type === 'single' && pairable.has(r.row.block.id))
            if (!joinable) continue
            const distance =
              at.y < r.y ? r.y - at.y : at.y > r.y + r.height ? at.y - (r.y + r.height) : 0
            if (!pairHit || distance < pairHit.distance) pairHit = { row: r, distance }
          }
        }

        if (gap && gapDistance <= GAP_ZONE) {
          next = { kind: 'gap', index: gap.index, page: at.page, y: gap.y }
        } else if (pairHit && pairHit.distance <= PAIR_ZONE) {
          const hit = pairHit.row
          const side =
            at.x < spec.page.margin.left + contentWidth / 2 ? ('left' as const) : ('right' as const)
          // Where in the lane the drop goes: before the first neighbour whose
          // middle the pointer is above, after the last one otherwise.
          const laneBlocks = hit.row.type === 'pair' ? hit.row[side] : [hit.row.block]
          let beforeId: string | null = null
          let lineY = hit.y + hit.height + BLOCK_GAP / 2
          for (const block of laneBlocks) {
            const rect = liftedLayout.rects.get(block.id)
            if (!rect) continue
            if (at.y < rect.y + rect.height / 2) {
              beforeId = block.id
              lineY = rect.y - BLOCK_GAP / 2
              break
            }
            lineY = rect.y + rect.height + BLOCK_GAP / 2
          }
          if (!laneBlocks.length) lineY = hit.y
          next = {
            kind: 'pair',
            beforeId,
            afterId: lastFlowId(hit.row),
            side,
            page: at.page,
            y: hit.y,
            height: hit.height,
            lineY,
          }
        } else if (gap && gapDistance <= FLOAT_ZONE) {
          next = { kind: 'gap', index: gap.index, page: at.page, y: gap.y }
        }
      }

      if (next.kind === 'float') {
        const { xs, ys } = guidesFor(rectsRef.current, spec.page, at.page, drag.id)
        const shown: Guide[] = []
        const snapX = snapTo(x, drag.width, xs)
        if (snapX) {
          x += snapX.delta
          shown.push({ axis: 'x', at: snapX.at, page: at.page })
        }
        const snapY = snapTo(y, drag.height, ys)
        if (snapY) {
          y += snapY.delta
          shown.push({ axis: 'y', at: snapY.at, page: at.page })
        }
        setGuides(shown)
      } else {
        setGuides([])
      }

      setPreview(next)
      setDrag({ ...drag, active: true, page: at.page, x, y })
    },
    [drag, locate, spec.page, zoom, contentWidth, liftedLayout, pairable, onAnchor]
  )

  const endDrag = useCallback(
    (commit: boolean) => {
      if (drag && drag.mode === 'move' && drag.active) {
        // The click that follows this release must not select or deselect;
        // the flag clears itself in case no click arrives at all.
        justDraggedRef.current = true
        setTimeout(() => {
          justDraggedRef.current = false
        }, 0)
        if (commit) {
          if (preview?.kind === 'gap') {
            const target = liftedLayout.rows.find((r) => r.index === preview.index)
            onInsert(drag.id, target ? firstFlowId(target.row) : null)
          } else if (preview?.kind === 'pair') {
            onPair(drag.id, preview.side, preview.beforeId, preview.afterId)
          } else {
            const width = Math.round(drag.width)
            const height = Math.round(drag.height)
            onAnchor(drag.id, {
              x: Math.min(Math.max(0, Math.round(drag.x)), spec.page.width - width),
              y: Math.min(Math.max(0, Math.round(drag.y)), spec.page.height - height),
              width,
              page: drag.page,
            })
          }
        }
      }
      setDrag(null)
      setPreview(null)
      setGuides([])
    },
    [drag, preview, liftedLayout, spec.page, onInsert, onPair, onAnchor]
  )

  // Handlers live on the window while a drag is on, so a fast pointer cannot
  // escape them, and Escape puts the block back where it came from.
  const moveRef = useRef(handleMove)
  moveRef.current = handleMove
  const endRef = useRef(endDrag)
  endRef.current = endDrag
  const dragging = drag !== null
  useEffect(() => {
    if (!dragging) return
    const move = (event: PointerEvent) => moveRef.current(event)
    const up = () => endRef.current(true)
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') endRef.current(false)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('keydown', key)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('keydown', key)
    }
  }, [dragging])

  /** Arrow keys walk a hand-placed block a point at a time; Shift, ten. */
  const nudge = useCallback(
    (event: React.KeyboardEvent) => {
      if (!selected) return
      const block = spec.blocks.find((b) => b.id === selected)
      if (!block || block.placement.mode !== 'anchored') return
      const step = event.shiftKey ? 10 : 1
      const delta: Record<string, [number, number]> = {
        ArrowLeft: [-step, 0],
        ArrowRight: [step, 0],
        ArrowUp: [0, -step],
        ArrowDown: [0, step],
      }
      const move = delta[event.key]
      if (!move) return
      event.preventDefault()
      const anchor = block.placement.anchor
      onAnchor(selected, { ...anchor, x: anchor.x + move[0], y: anchor.y + move[1] })
    },
    [selected, spec.blocks, onAnchor]
  )

  const chrome = (pageNumber: number) => {
    if (!spec.frame) return null
    const { side, railWidth, bandHeight, color, borderColor, shadow, radius } = spec.frame
    const headerSelected = selected === 'header'
    return (
      <>
        {pageNumber === 1 && (
          <div
            onClick={(e) => {
              e.stopPropagation()
              onSelect('header')
            }}
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              top: 0,
              height: bandHeight,
              background: color,
              cursor: 'pointer',
            }}
          />
        )}
        <div
          onClick={(e) => {
            e.stopPropagation()
            onSelect(null)
          }}
          style={{
            position: 'absolute',
            [side]: 0,
            top: 0,
            bottom: 0,
            width: railWidth,
            background: color,
          }}
        />
        {pageNumber === 1 && radius > 0 && (
          /* The fillet where the rail meets the band: a square of frame color
             with the sheet rounded back out of it, the border stroke and the
             shadow bands wrapping the curve so they meet the straight runs. */
          <div
            style={{
              position: 'absolute',
              [side]: railWidth,
              top: bandHeight,
              width: radius,
              height: radius,
              background: color,
              pointerEvents: 'none',
            }}
          >
            <div
              style={{
                position: 'absolute',
                top: 0,
                [side]: 0,
                width: radius,
                height: radius,
                background: spec.page.background || '#ffffff',
                [side === 'left' ? 'borderTopLeftRadius' : 'borderTopRightRadius']: radius,
              }}
            />
            {shadow > 0 &&
              SHADOW_SHADES.map((shade, i) => {
                const step = shadow / SHADOW_SHADES.length
                const inset = (borderColor ? 1 : 0) + i * step
                const size = radius - inset
                if (size <= 0) return null
                return (
                  <div
                    key={shade}
                    style={{
                      position: 'absolute',
                      top: inset,
                      [side]: inset,
                      width: size,
                      height: size,
                      [side === 'left' ? 'borderTopLeftRadius' : 'borderTopRightRadius']: size,
                      borderTop: `${step}px solid ${shade}`,
                      [side === 'left' ? 'borderLeft' : 'borderRight']: `${step}px solid ${shade}`,
                    }}
                  />
                )
              })}
            {borderColor && (
              <div
                style={{
                  position: 'absolute',
                  top: 0,
                  [side]: 0,
                  width: radius,
                  height: radius,
                  [side === 'left' ? 'borderTopLeftRadius' : 'borderTopRightRadius']: radius,
                  borderTop: `1px solid ${borderColor}`,
                  [side === 'left' ? 'borderLeft' : 'borderRight']: `1px solid ${borderColor}`,
                }}
              />
            )}
          </div>
        )}
        <div
          style={{
            position: 'absolute',
            [side]: railWidth,
            top: pageNumber === 1 ? bandHeight + radius : 0,
            bottom: 0,
            display: 'flex',
            flexDirection: side === 'right' ? 'row-reverse' : 'row',
            pointerEvents: 'none',
          }}
        >
          {borderColor && <div style={{ width: 1, background: borderColor }} />}
          {shadow > 0 &&
            SHADOW_SHADES.map((s) => (
              <div key={s} style={{ width: shadow / SHADOW_SHADES.length, background: s }} />
            ))}
        </div>
        {pageNumber === 1 && (
          <div
            style={{
              position: 'absolute',
              left: side === 'left' ? railWidth + radius : 0,
              right: side === 'right' ? railWidth + radius : 0,
              top: bandHeight,
              display: 'flex',
              flexDirection: 'column',
              pointerEvents: 'none',
            }}
          >
            {borderColor && <div style={{ height: 1, background: borderColor }} />}
            {shadow > 0 &&
              SHADOW_SHADES.map((s) => (
                <div key={s} style={{ height: shadow / SHADOW_SHADES.length, background: s }} />
              ))}
          </div>
        )}
        {headerSelected && pageNumber === 1 && (
          <>
            <div
              style={{
                position: 'absolute',
                left: 0,
                right: 0,
                top: 0,
                height: bandHeight,
                outline: '2px solid #2563eb',
                outlineOffset: -2,
                pointerEvents: 'none',
              }}
            />
            <div
              style={{
                position: 'absolute',
                [side]: 0,
                top: bandHeight,
                bottom: 0,
                width: railWidth,
                outline: '2px solid #2563eb',
                outlineOffset: -2,
                pointerEvents: 'none',
              }}
            />
          </>
        )}
      </>
    )
  }

  const blockShell = (
    block: Block,
    page: number,
    style: React.CSSProperties,
    resizable = false
  ) => (
    <div
      key={block.id}
      data-node-id={block.id}
      onPointerDown={(e) => startDrag(e, block, page)}
      onClick={(e) => {
        e.stopPropagation()
        if (justDraggedRef.current) return
        onSelect(block.id)
      }}
      style={{
        position: 'relative',
        cursor: 'grab',
        outline:
          selected === block.id
            ? '2px solid #2563eb'
            : // A stand-in for something the workshop has not filled in. It
              // has to look unlike real content, because it reads as a real
              // line otherwise and prints as nothing at all.
              placeholderIds?.has(block.id)
              ? '1px dashed #c9a227'
              : undefined,
        outlineOffset: 2,
        ...textCss(block.text),
        ...style,
      }}
    >
      {placeholderIds?.has(block.id) && selected !== block.id && !dragActive && (
        <div
          style={{
            position: 'absolute',
            top: -8,
            right: -2,
            background: '#fdf6e3',
            border: '1px solid #e6d8a8',
            color: '#8a6d1f',
            fontFamily: "'IBM Plex Sans', sans-serif",
            fontSize: 9,
            fontWeight: 600,
            padding: '1px 5px',
            borderRadius: 3,
            whiteSpace: 'nowrap',
            pointerEvents: 'none',
            zIndex: 6,
          }}
        >
          {placeholderLabel}
        </div>
      )}
      {selected === block.id && !dragActive && (
        <div
          style={{
            position: 'absolute',
            top: -19,
            left: -2,
            background: '#2563eb',
            color: '#fff',
            fontFamily: "'IBM Plex Sans', sans-serif",
            fontSize: 10,
            fontWeight: 600,
            padding: '2px 7px',
            borderRadius: '3px 3px 0 0',
            whiteSpace: 'nowrap',
            zIndex: 6,
          }}
        >
          {block.label}
        </div>
      )}
      <RenderNode node={block.content} />

      {/* Handles on the edges of anything that has been placed by hand. Width
          is the only dimension worth pulling: a block is as tall as what is in
          it, here and on paper. */}
      {resizable &&
        selected === block.id &&
        (['resize-left', 'resize-right'] as const).map((mode) => (
          <div
            key={mode}
            onPointerDown={(e) => startDrag(e, block, page, mode)}
            style={{
              position: 'absolute',
              top: '50%',
              [mode === 'resize-left' ? 'left' : 'right']: -4,
              marginTop: -5,
              width: 9,
              height: 11,
              borderRadius: 2,
              background: '#fff',
              border: '1.5px solid #2563eb',
              cursor: 'ew-resize',
              zIndex: 7,
            }}
          />
        ))}
    </div>
  )

  const ghost = (pageNumber: number) => {
    if (!drag || !dragActive || drag.page !== pageNumber) return null
    const block = spec.blocks.find((b) => b.id === drag.id)
    if (!block) return null
    const width =
      preview?.kind === 'pair' ? colWidth : preview?.kind === 'gap' ? contentWidth : drag.width
    const label =
      preview?.kind === 'gap'
        ? t('insertHere')
        : preview?.kind === 'pair'
          ? preview.side === 'left'
            ? t('dropLeftColumn')
            : t('dropRightColumn')
          : t('freePosition')
    return (
      <div
        style={{
          position: 'absolute',
          left: drag.x,
          top: drag.y,
          width,
          zIndex: 30,
          pointerEvents: 'none',
          opacity: 0.95,
          background: spec.page.background || '#ffffff',
          boxShadow: '0 14px 34px rgba(26,29,33,0.28)',
          outline: '1.5px solid #2563eb',
          borderRadius: 2,
          transition: 'width 130ms ease',
          ...textCss(block.text),
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: -19,
            left: -2,
            background: '#2563eb',
            color: '#fff',
            fontFamily: "'IBM Plex Sans', sans-serif",
            fontSize: 10,
            fontWeight: 600,
            padding: '2px 7px',
            borderRadius: '3px 3px 0 0',
            whiteSpace: 'nowrap',
          }}
        >
          {block.label} · {label}
        </div>
        <RenderNode node={block.content} />
      </div>
    )
  }

  const sheet = (pageNumber: number) => {
    const placed = renderLayout.rows.filter((r) => r.page === pageNumber)
    return (
      <div key={pageNumber} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div
          data-sheet={pageNumber}
          onClick={() => {
            if (justDraggedRef.current) {
              justDraggedRef.current = false
              return
            }
            onSelect(null)
          }}
          style={{
            position: 'relative',
            width: spec.page.width,
            height: spec.page.height,
            background: spec.page.background,
            boxShadow: '0 12px 32px rgba(26,29,33,0.18)',
            overflow: 'hidden',
            fontFamily: fontStack(spec.page.fontFamily),
            color: spec.page.text,
            fontSize: spec.page.fontSize,
          }}
        >
          {chrome(pageNumber)}

          {rulers && (
            <>
              {/* Where the page margins run: the area the flow lays out in. */}
              <div
                style={{
                  position: 'absolute',
                  top: pageNumber === 1 ? spec.page.margin.top : spec.page.margin.bottom,
                  left: spec.page.margin.left,
                  right: spec.page.margin.right,
                  bottom: spec.page.margin.bottom,
                  border: '1px dashed rgba(37,99,235,0.35)',
                  pointerEvents: 'none',
                }}
              />
              <SheetRulers width={spec.page.width} height={spec.page.height} />
            </>
          )}

          {placed.map((r) => {
            const row = r.row
            return (
              <div
                // Keyed by content, not position, so a row keeps its element
                // and glides when a lift renumbers the rows around it.
                key={firstFlowId(row)}
                style={{
                  position: 'absolute',
                  left: spec.page.margin.left,
                  top: r.y,
                  width: contentWidth,
                  transition: dragActive ? 'top 130ms ease' : undefined,
                }}
              >
                {row.type === 'single' ? (
                  blockShell(row.block, pageNumber, marginCss(row.block))
                ) : (
                  <div style={{ display: 'flex', gap: BLOCK_GAP, alignItems: 'flex-start' }}>
                    {(['left', 'right'] as const).map((side) => (
                      <div
                        key={side}
                        style={{
                          flex: 1,
                          minWidth: 0,
                          display: 'flex',
                          flexDirection: 'column',
                          gap: BLOCK_GAP,
                          marginTop: r.laneOffsets[side] || undefined,
                          transition: dragActive ? 'margin-top 130ms ease' : undefined,
                        }}
                      >
                        {row[side].map((block) => blockShell(block, pageNumber, marginCss(block)))}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}

          {anchored
            .filter(
              (b) =>
                (b.placement.mode === 'anchored' ? (b.placement.anchor.page ?? 1) : 1) ===
                pageNumber
            )
            .map((b) => {
              const anchor = (b.placement as { anchor: Anchor }).anchor
              return blockShell(
                b,
                pageNumber,
                {
                  position: 'absolute',
                  left: anchor.x,
                  top: anchor.y,
                  width: anchor.width,
                },
                true
              )
            })}

          {pinned.map((b) =>
            blockShell(b, pageNumber, {
              position: 'absolute',
              left: spec.page.margin.left,
              right: spec.page.margin.right,
              bottom: spec.page.margin.bottom / 2,
              width: contentWidth,
            })
          )}

          {/* Where a dropped block would slot into the flow. */}
          {preview?.kind === 'gap' && preview.page === pageNumber && (
            <div
              style={{
                position: 'absolute',
                left: spec.page.margin.left - 6,
                width: contentWidth + 12,
                top: preview.y - 1.5,
                height: 3,
                borderRadius: 2,
                background: '#2563eb',
                zIndex: 24,
                pointerEvents: 'none',
              }}
            />
          )}

          {/* The column a dropped block would join, and where in it. */}
          {preview?.kind === 'pair' && preview.page === pageNumber && (
            <>
              <div
                style={{
                  position: 'absolute',
                  left: laneX(preview.side),
                  top: preview.y,
                  width: colWidth,
                  height: Math.max(preview.height, 48),
                  border: '1.5px dashed #2563eb',
                  background: 'rgba(37,99,235,0.07)',
                  borderRadius: 4,
                  zIndex: 24,
                  pointerEvents: 'none',
                }}
              />
              <div
                style={{
                  position: 'absolute',
                  left: laneX(preview.side) - 4,
                  width: colWidth + 8,
                  top: preview.lineY - 1.5,
                  height: 3,
                  borderRadius: 2,
                  background: '#2563eb',
                  zIndex: 25,
                  pointerEvents: 'none',
                }}
              />
            </>
          )}

          {ghost(pageNumber)}

          {guides
            .filter((g) => g.page === pageNumber)
            .map((g) => (
              <div
                key={`${g.axis}-${g.at}`}
                style={{
                  position: 'absolute',
                  background: '#e11d48',
                  pointerEvents: 'none',
                  zIndex: 28,
                  ...(g.axis === 'x'
                    ? { left: g.at, top: 0, bottom: 0, width: 1 }
                    : { top: g.at, left: 0, right: 0, height: 1 }),
                }}
              />
            ))}
        </div>
        <div style={{ textAlign: 'center', fontSize: 12, color: '#8a8f97' }}>
          Page {pageNumber} of {renderLayout.pageCount}
        </div>
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      className="flex flex-1 flex-col items-center overflow-auto bg-[#e4e7eb] px-10 pb-16 pt-9 outline-none"
      tabIndex={0}
      onKeyDown={nudge}
      style={{ cursor: dragActive ? 'grabbing' : undefined }}
    >
      {/* Laid out but not shown, to measure every block at print width. */}
      <div
        ref={measureRef}
        aria-hidden
        style={{
          position: 'absolute',
          top: 0,
          left: -99999,
          visibility: 'hidden',
          fontFamily: fontStack(spec.page.fontFamily),
          fontSize: spec.page.fontSize,
        }}
      >
        {spec.blocks.map((block) => (
          <div key={block.id} style={{ width: widthFor(block), ...textCss(block.text) }}>
            <RenderNode node={block.content} />
          </div>
        ))}
      </div>

      <div style={{ width: spec.page.width * zoom }}>
        <div
          ref={pagesRef}
          style={{
            transform: `scale(${zoom})`,
            transformOrigin: 'top left',
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
          }}
        >
          {Array.from({ length: renderLayout.pageCount }, (_, i) => sheet(i + 1))}
        </div>
      </div>
    </div>
  )
}
