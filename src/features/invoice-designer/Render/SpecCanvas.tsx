'use client'

import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import type { Anchor, Block, DocumentSpec } from '../Spec/documentSpec'
import { RenderNode } from './renderHtml'
import { fontStack } from '../Components/types'

/**
 * The sheet: A4, always, with the document laid on it.
 *
 * Everything the editor needs comes from geometry it measures rather than from
 * anything hand-written. Blocks in flow are measured and dealt into pages that
 * hold them; anchored blocks sit where they were put; pinned blocks are held
 * against the foot of every sheet the way a printed footer is.
 */

const SHADOW_SHADES = ['rgba(0,0,0,0.13)', 'rgba(0,0,0,0.07)', 'rgba(0,0,0,0.03)']
const BLOCK_GAP = 14
/** How close a dragged edge has to come before it takes the guide. */
const SNAP = 6

export interface Guide {
  axis: 'x' | 'y'
  at: number
  page: number
}

interface Drag {
  id: string
  page: number
  /** Where in the block the pointer took hold, so it does not jump. */
  grabX: number
  grabY: number
  width: number
  height: number
}

/** Every edge and centre a dragged thing can line up with. */
function guidesFor(rects: Map<string, DOMRect>, page: DocumentSpec['page'], exclude: string) {
  const xs = new Set<number>([page.margin.left, page.width - page.margin.right, page.width / 2])
  const ys = new Set<number>([page.margin.top, page.height - page.margin.bottom, page.height / 2])
  for (const [id, rect] of rects) {
    if (id === exclude) continue
    xs.add(rect.x)
    xs.add(rect.x + rect.width / 2)
    xs.add(rect.x + rect.width)
    ys.add(rect.y)
    ys.add(rect.y + rect.height / 2)
    ys.add(rect.y + rect.height)
  }
  return { xs: [...xs], ys: [...ys] }
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

export function SpecCanvas({
  spec,
  selected,
  onSelect,
  onAnchor,
  zoom,
  rulers,
}: {
  spec: DocumentSpec
  selected: string | null
  onSelect: (id: string | null) => void
  onAnchor: (id: string, anchor: Anchor | undefined) => void
  zoom: number
  rulers: boolean
}) {
  const measureRef = useRef<HTMLDivElement>(null)
  const pagesRef = useRef<HTMLDivElement>(null)
  const [heights, setHeights] = useState<number[]>([])
  /**
   * Measured geometry, held in a ref rather than in state.
   *
   * Nothing renders from it — it is read when a drag starts and while it moves
   * — and measuring produces a fresh Map every time, so putting it in state
   * meant every render scheduled another one. That is a loop with no way out,
   * and React stopped it for us.
   */
  const rectsRef = useRef<Map<string, DOMRect>>(new Map())
  const [drag, setDrag] = useState<Drag | null>(null)
  const [guides, setGuides] = useState<Guide[]>([])

  const flow = spec.blocks.filter((b) => b.placement.mode === 'flow')
  const anchored = spec.blocks.filter((b) => b.placement.mode === 'anchored')
  const pinned = spec.blocks.filter((b) => b.placement.mode === 'pinned')

  // Measured at the width they print at, so the page break falls where it will
  // fall on paper rather than where the browser happens to wrap.
  useLayoutEffect(() => {
    const node = measureRef.current
    if (!node) return
    const next = Array.from(node.children).map((child) => (child as HTMLElement).offsetHeight)
    setHeights((prev) =>
      prev.length === next.length && prev.every((h, i) => h === next[i]) ? prev : next
    )
  })

  // Page-space rectangles for everything drawn, which is what dragging and
  // snapping read from.
  useLayoutEffect(() => {
    const root = pagesRef.current
    if (!root) return
    const next = rectsRef.current
    next.clear()
    for (const sheet of Array.from(root.querySelectorAll('[data-sheet]'))) {
      const base = sheet.getBoundingClientRect()
      for (const element of Array.from(sheet.querySelectorAll('[data-node-id]'))) {
        const id = (element as HTMLElement).dataset.nodeId
        if (!id) continue
        const box = element.getBoundingClientRect()
        next.set(
          id,
          new DOMRect(
            (box.x - base.x) / zoom,
            (box.y - base.y) / zoom,
            box.width / zoom,
            box.height / zoom
          )
        )
      }
    }
  })

  const contentWidth = spec.page.width - spec.page.margin.left - spec.page.margin.right

  const pages: number[][] = []
  {
    let page: number[] = []
    let used = 0
    let budget = spec.page.height - spec.page.margin.top - spec.page.margin.bottom
    flow.forEach((_, i) => {
      const height = (heights[i] ?? 0) + (page.length ? BLOCK_GAP : 0)
      if (page.length && used + height > budget) {
        pages.push(page)
        page = []
        used = 0
        budget = spec.page.height - spec.page.margin.bottom * 2
      }
      page.push(i)
      used += height
    })
    pages.push(page)
  }
  const anchoredPages = anchored.map((b) =>
    b.placement.mode === 'anchored' ? (b.placement.anchor.page ?? 1) : 1
  )
  const pageCount = Math.max(pages.length, ...anchoredPages, 1)

  const startDrag = useCallback(
    (event: React.PointerEvent, id: string, page: number) => {
      const rect = rectsRef.current.get(id)
      if (!rect) return
      const sheet = (event.currentTarget as HTMLElement).closest('[data-sheet]')
      if (!sheet) return
      const base = sheet.getBoundingClientRect()
      event.stopPropagation()
      event.preventDefault()
      onSelect(id)
      setDrag({
        id,
        page,
        grabX: (event.clientX - base.x) / zoom - rect.x,
        grabY: (event.clientY - base.y) / zoom - rect.y,
        width: rect.width,
        height: rect.height,
      })
    },
    [zoom, onSelect]
  )

  const onPointerMove = useCallback(
    (event: React.PointerEvent) => {
      if (!drag) return
      const sheet = document.querySelector(`[data-sheet="${drag.page}"]`)
      if (!sheet) return
      const base = sheet.getBoundingClientRect()
      let x = (event.clientX - base.x) / zoom - drag.grabX
      let y = (event.clientY - base.y) / zoom - drag.grabY

      const { xs, ys } = guidesFor(rectsRef.current, spec.page, drag.id)
      const shown: Guide[] = []
      const snapX = snapTo(x, drag.width, xs)
      if (snapX) {
        x += snapX.delta
        shown.push({ axis: 'x', at: snapX.at, page: drag.page })
      }
      const snapY = snapTo(y, drag.height, ys)
      if (snapY) {
        y += snapY.delta
        shown.push({ axis: 'y', at: snapY.at, page: drag.page })
      }

      setGuides(shown)
      onAnchor(drag.id, {
        x: Math.round(x),
        y: Math.round(y),
        width: Math.round(drag.width),
        page: drag.page,
      })
    },
    [drag, spec.page, zoom, onAnchor]
  )

  const endDrag = useCallback(() => {
    setDrag(null)
    setGuides([])
  }, [])

  const chrome = (pageNumber: number) => {
    if (!spec.frame) return null
    const { side, railWidth, bandHeight, color, borderColor, shadow } = spec.frame
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
        <div
          style={{
            position: 'absolute',
            [side]: railWidth,
            top: pageNumber === 1 ? bandHeight : 0,
            bottom: 0,
            display: 'flex',
            flexDirection: side === 'right' ? 'row-reverse' : 'row',
            pointerEvents: 'none',
          }}
        >
          {borderColor && <div style={{ width: 1, background: borderColor }} />}
          {shadow &&
            SHADOW_SHADES.map((s) => <div key={s} style={{ width: 1.5, background: s }} />)}
        </div>
        {pageNumber === 1 && (
          <div
            style={{
              position: 'absolute',
              left: side === 'left' ? railWidth : 0,
              right: side === 'right' ? railWidth : 0,
              top: bandHeight,
              display: 'flex',
              flexDirection: 'column',
              pointerEvents: 'none',
            }}
          >
            {borderColor && <div style={{ height: 1, background: borderColor }} />}
            {shadow &&
              SHADOW_SHADES.map((s) => <div key={s} style={{ height: 1.5, background: s }} />)}
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

  const blockShell = (block: Block, page: number, style: React.CSSProperties) => (
    <div
      key={block.id}
      data-node-id={block.id}
      onPointerDown={(e) => startDrag(e, block.id, page)}
      onClick={(e) => {
        e.stopPropagation()
        onSelect(block.id)
      }}
      style={{
        position: 'relative',
        cursor: 'grab',
        outline: selected === block.id ? '2px solid #2563eb' : undefined,
        outlineOffset: 2,
        ...style,
      }}
    >
      {selected === block.id && (
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
    </div>
  )

  const sheet = (pageNumber: number) => {
    const indices = pages[pageNumber - 1] ?? []
    return (
      <div key={pageNumber} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div
          data-sheet={pageNumber}
          onClick={() => onSelect(null)}
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
          )}

          <div
            style={{
              position: 'absolute',
              top: pageNumber === 1 ? spec.page.margin.top : spec.page.margin.bottom,
              left: spec.page.margin.left,
              width: contentWidth,
              display: 'flex',
              flexDirection: 'column',
              gap: BLOCK_GAP,
            }}
          >
            {indices.map((i) => blockShell(flow[i], pageNumber, {}))}
          </div>

          {anchored
            .filter(
              (b) =>
                (b.placement.mode === 'anchored' ? (b.placement.anchor.page ?? 1) : 1) ===
                pageNumber
            )
            .map((b) => {
              const anchor = (b.placement as { anchor: Anchor }).anchor
              return blockShell(b, pageNumber, {
                position: 'absolute',
                left: anchor.x,
                top: anchor.y,
                width: anchor.width,
              })
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

          {guides
            .filter((g) => g.page === pageNumber)
            .map((g) => (
              <div
                key={`${g.axis}-${g.at}`}
                style={{
                  position: 'absolute',
                  background: '#e11d48',
                  pointerEvents: 'none',
                  ...(g.axis === 'x'
                    ? { left: g.at, top: 0, bottom: 0, width: 1 }
                    : { top: g.at, left: 0, right: 0, height: 1 }),
                }}
              />
            ))}
        </div>
        <div style={{ textAlign: 'center', fontSize: 12, color: '#8a8f97' }}>
          Page {pageNumber} of {pageCount}
        </div>
      </div>
    )
  }

  return (
    <div
      className="flex flex-1 flex-col items-center overflow-auto bg-[#e4e7eb] px-10 pb-16 pt-9"
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerLeave={endDrag}
    >
      {/* Laid out but not shown, to measure at print width. */}
      <div
        ref={measureRef}
        aria-hidden
        style={{
          position: 'absolute',
          top: 0,
          left: -99999,
          width: contentWidth,
          fontFamily: fontStack(spec.page.fontFamily),
          fontSize: spec.page.fontSize,
          display: 'flex',
          flexDirection: 'column',
          gap: BLOCK_GAP,
        }}
      >
        {flow.map((block) => (
          <div key={block.id}>
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
          {Array.from({ length: pageCount }, (_, i) => sheet(i + 1))}
        </div>
      </div>
    </div>
  )
}
