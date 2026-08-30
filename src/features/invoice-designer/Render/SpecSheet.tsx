'use client'

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { Anchor, Block, DocumentSpec } from '../Spec/documentSpec'
import { BLOCK_GAP, layoutDocument, marginOf } from './layoutEngine'
import { RenderNode, textCss } from './renderHtml'
import { fontStack } from '../Components/types'
import './documentFonts.css'

/**
 * The document, drawn to be read: the same measuring and the same layout
 * engine as the designer's canvas, with nothing to drag. This is what a
 * customer opening a shared invoice sees, and it is the saved design to the
 * point, hand placements and all, because it is built from the same spec.
 *
 * The sheet scales to the width it is given, the way a PDF viewer fits a
 * page.
 */

const SHADOW_SHADES = ['rgba(0,0,0,0.13)', 'rgba(0,0,0,0.07)', 'rgba(0,0,0,0.03)']

export function SpecSheet({ spec }: { spec: DocumentSpec }) {
  const measureRef = useRef<HTMLDivElement>(null)
  const frameRef = useRef<HTMLDivElement>(null)
  const [heights, setHeights] = useState<number[]>([])
  const [, setMeasureTick] = useState(0)
  const [scale, setScale] = useState(1)

  const contentWidth = spec.page.width - spec.page.margin.left - spec.page.margin.right
  const colWidth = (contentWidth - BLOCK_GAP) / 2

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

  useLayoutEffect(() => {
    const node = measureRef.current
    if (!node) return
    const next = Array.from(node.children).map((child) => (child as HTMLElement).offsetHeight)
    setHeights((prev) =>
      prev.length === next.length && prev.every((h, i) => h === next[i]) ? prev : next
    )
  })

  // Late images and webfonts change the heights without causing a render.
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

  // Fit the sheet to the container, like a PDF viewer fits a page: smaller
  // screens shrink it, wider pages grow it, so it always spans the content.
  useEffect(() => {
    const frame = frameRef.current
    if (!frame) return
    const fit = () => setScale(frame.clientWidth / spec.page.width || 1)
    fit()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(fit)
    observer.observe(frame)
    return () => observer.disconnect()
  }, [spec.page.width])

  const heightOf = (id: string) => {
    const index = spec.blocks.findIndex((b) => b.id === id)
    return heights[index] ?? 0
  }
  const layout = layoutDocument(spec, heightOf, {})

  const anchored = spec.blocks.filter((b) => b.placement.mode === 'anchored')
  const pinned = spec.blocks.filter((b) => b.placement.mode === 'pinned')

  const marginCss = (block: Block): React.CSSProperties => {
    const m = marginOf(block)
    return block.margin
      ? { marginTop: m.top, marginRight: m.right, marginBottom: m.bottom, marginLeft: m.left }
      : {}
  }

  const chrome = (pageNumber: number) => {
    if (!spec.frame) return null
    const { side, railWidth, bandHeight, color, borderColor, shadow } = spec.frame
    return (
      <>
        {pageNumber === 1 && (
          <div
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              top: 0,
              height: bandHeight,
              background: color,
            }}
          />
        )}
        <div
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
          }}
        >
          {borderColor && <div style={{ width: 1, background: borderColor }} />}
          {shadow > 0 &&
            SHADOW_SHADES.map((shade) => (
              <div
                key={shade}
                style={{ width: shadow / SHADOW_SHADES.length, background: shade }}
              />
            ))}
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
            }}
          >
            {borderColor && <div style={{ height: 1, background: borderColor }} />}
            {shadow > 0 &&
              SHADOW_SHADES.map((shade) => (
                <div
                  key={shade}
                  style={{ height: shadow / SHADOW_SHADES.length, background: shade }}
                />
              ))}
          </div>
        )}
      </>
    )
  }

  const blockBody = (block: Block, extra: React.CSSProperties = {}) => (
    <div key={block.id} style={{ ...textCss(block.text), ...extra }}>
      <RenderNode node={block.content} />
    </div>
  )

  const sheet = (pageNumber: number) => (
    <div
      key={pageNumber}
      style={{
        position: 'relative',
        width: spec.page.width,
        height: spec.page.height,
        background: spec.page.background || '#ffffff',
        overflow: 'hidden',
        fontFamily: fontStack(spec.page.fontFamily),
        color: spec.page.text,
        fontSize: spec.page.fontSize,
        // The sheet is its own paper on the page; it carries its own shadow
        // rather than being set inside a card.
        boxShadow: '0 1px 3px rgba(26,29,33,0.12), 0 10px 28px rgba(26,29,33,0.14)',
        borderRadius: 2,
      }}
    >
      {chrome(pageNumber)}

      {layout.rows
        .filter((r) => r.page === pageNumber)
        .map((r) => {
          const row = r.row
          return (
            <div
              key={r.index}
              style={{
                position: 'absolute',
                left: spec.page.margin.left,
                top: r.y,
                width: contentWidth,
              }}
            >
              {row.type === 'single' ? (
                blockBody(row.block, marginCss(row.block))
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
                      }}
                    >
                      {row[side].map((block) => blockBody(block, marginCss(block)))}
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
            (b.placement.mode === 'anchored' ? (b.placement.anchor.page ?? 1) : 1) === pageNumber
        )
        .map((b) => {
          const anchor = (b.placement as { anchor: Anchor }).anchor
          return blockBody(b, {
            position: 'absolute',
            left: anchor.x,
            top: anchor.y,
            width: anchor.width,
          })
        })}

      {pinned.map((b) =>
        blockBody(b, {
          position: 'absolute',
          left: spec.page.margin.left,
          bottom: spec.page.margin.bottom / 2,
          width: contentWidth,
        })
      )}
    </div>
  )

  return (
    <div ref={frameRef}>
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

      <div
        style={{
          height: layout.pageCount * spec.page.height * scale + (layout.pageCount - 1) * 12 * scale,
        }}
      >
        <div
          style={{
            transform: `scale(${scale})`,
            transformOrigin: 'top left',
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
            width: spec.page.width,
          }}
        >
          {Array.from({ length: layout.pageCount }, (_, i) => sheet(i + 1))}
        </div>
      </div>
    </div>
  )
}
