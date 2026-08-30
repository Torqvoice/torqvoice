import React from 'react'
import { Page, View } from '@react-pdf/renderer'
import type { Style } from '@react-pdf/types'
import type { Block, DocumentSpec, TextStyle } from '../Spec/documentSpec'
import { BLOCK_GAP, layoutDocument, marginOf, type PlacedRow } from '../Render/layoutEngine'
import { estimateBlockHeights } from './estimateHeights'
import { pdfFamily, RenderNodePdf } from './renderPdf'

/**
 * The printed sheet, assembled from the same pieces as the one on screen.
 *
 * The spec is laid out by the same engine the designer uses, fed estimated
 * heights instead of measured ones. Flow rows keep react-pdf's natural
 * wrapping, so a long table still breaks across pages; the engine's geometry
 * only decides the extra room between rows, which is how the flow steps
 * around anything placed by hand. Anchored blocks print at exactly the spot
 * and width the designer shows, and the pinned footer holds the foot of
 * every sheet.
 */

const SHADOW_SHADES = ['rgba(0,0,0,0.13)', 'rgba(0,0,0,0.07)', 'rgba(0,0,0,0.03)']
const SHADOW_ALPHAS = [0.13, 0.07, 0.03]

/** A shadow shade as opaque ink over the sheet, for fills that must stack. */
function shadeOn(background: string | undefined, alpha: number): string {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(background || '#ffffff')
  const [r, g, b] = m
    ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)]
    : [255, 255, 255]
  const mix = (v: number) => Math.round(v * (1 - alpha))
  return `rgb(${mix(r)}, ${mix(g)}, ${mix(b)})`
}

function baseFor(spec: DocumentSpec, block: Block): TextStyle {
  return {
    color: block.text?.color ?? spec.page.text,
    fontFamily: block.text?.fontFamily ?? spec.page.fontFamily,
    fontSize: block.text?.fontSize ?? spec.page.fontSize,
  }
}

function blockMargin(block: Block): Style {
  const m = marginOf(block)
  return block.margin
    ? { marginTop: m.top, marginRight: m.right, marginBottom: m.bottom, marginLeft: m.left }
    : {}
}

export function SpecPdfPage({
  spec,
  children,
}: {
  spec: DocumentSpec
  children?: React.ReactNode
}) {
  const heightMap = estimateBlockHeights(spec)
  const heightOf = (id: string) => heightMap.get(id) ?? 0
  const layout = layoutDocument(spec, heightOf, {})
  const { page, frame } = spec
  const contentWidth = layout.contentWidth

  const anchored = spec.blocks.filter((b) => b.placement.mode === 'anchored')
  const pinned = spec.blocks.filter((b) => b.placement.mode === 'pinned')
  const pinnedHeight = pinned.reduce((max, b) => Math.max(max, heightOf(b.id)), 0)

  // The engine starts page one at the top margin and later pages at the
  // bottom margin; react-pdf pads every page the same, so the page padding is
  // the recurring inset and page one gets the difference as leading room.
  const flowTop = (p: number) => (p === 1 ? page.margin.top : page.margin.bottom)
  const basePadTop = Math.min(page.margin.top, page.margin.bottom)
  const paddingBottom = pinned.length
    ? page.margin.bottom / 2 + pinnedHeight + BLOCK_GAP
    : page.margin.bottom

  const pageStyle: Style = {
    paddingTop: basePadTop,
    paddingLeft: page.margin.left,
    paddingRight: page.margin.right,
    paddingBottom,
    fontFamily: pdfFamily(page.fontFamily),
    fontSize: page.fontSize,
    color: page.text,
    ...(page.background && page.background !== '#ffffff'
      ? { backgroundColor: page.background }
      : {}),
  }

  /** The band and rail of a framed sheet: chrome the page owns. */
  const chrome = (pageNumber: number) => {
    if (!frame) return null
    const { side, railWidth, bandHeight, color, borderColor, shadow, radius } = frame
    return (
      <>
        <View
          style={{
            position: 'absolute',
            top: 0,
            [side]: 0,
            width: railWidth,
            height: page.height,
            backgroundColor: color,
          }}
        />
        {pageNumber === 1 && (
          <View
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: page.width,
              height: bandHeight,
              backgroundColor: color,
            }}
          />
        )}
        {pageNumber === 1 && radius > 0 && (
          /* The fillet where the rail meets the band. react-pdf strokes
             partial borders poorly around a radius, so the curve is built
             from stacked rounded fills: border ink, then each shadow band,
             then the sheet, each inset by the band before it. */
          <View
            style={{
              position: 'absolute',
              [side]: railWidth,
              top: bandHeight,
              width: radius,
              height: radius,
              backgroundColor: color,
            }}
          >
            {(() => {
              const step = shadow > 0 ? shadow / SHADOW_ALPHAS.length : 0
              const layers: { inset: number; fill: string }[] = []
              if (borderColor) layers.push({ inset: 0, fill: borderColor })
              const borderInset = borderColor ? 0.6 : 0
              if (shadow > 0) {
                SHADOW_ALPHAS.forEach((alpha, i) => {
                  layers.push({
                    inset: borderInset + i * step,
                    fill: shadeOn(page.background, alpha),
                  })
                })
              } else if (!borderColor) {
                layers.push({ inset: 0, fill: page.background || '#ffffff' })
              }
              layers.push({
                inset: borderInset + (shadow > 0 ? shadow : 0),
                fill: page.background || '#ffffff',
              })
              return layers.map((layer, i) => {
                const size = radius - layer.inset
                if (size <= 0) return null
                return (
                  <View
                    key={`${layer.fill}-${i}`}
                    style={{
                      position: 'absolute',
                      top: layer.inset,
                      [side]: layer.inset,
                      width: size,
                      height: size,
                      backgroundColor: layer.fill,
                      [side === 'left' ? 'borderTopLeftRadius' : 'borderTopRightRadius']: size,
                    }}
                  />
                )
              })
            })()}
          </View>
        )}
        <View
          style={{
            position: 'absolute',
            [side]: railWidth,
            top: pageNumber === 1 ? bandHeight + radius : 0,
            height: page.height,
            flexDirection: side === 'right' ? 'row-reverse' : 'row',
          }}
        >
          {borderColor ? <View style={{ width: 0.6, backgroundColor: borderColor }} /> : null}
          {shadow > 0
            ? SHADOW_SHADES.map((shade) => (
                <View
                  key={shade}
                  style={{ width: shadow / SHADOW_SHADES.length, backgroundColor: shade }}
                />
              ))
            : null}
        </View>
        {pageNumber === 1 && (
          <View
            style={{
              position: 'absolute',
              left: side === 'left' ? railWidth + radius : 0,
              width: page.width - railWidth - radius,
              top: bandHeight,
            }}
          >
            {borderColor ? <View style={{ height: 0.6, backgroundColor: borderColor }} /> : null}
            {shadow > 0
              ? SHADOW_SHADES.map((shade) => (
                  <View
                    key={shade}
                    style={{ height: shadow / SHADOW_SHADES.length, backgroundColor: shade }}
                  />
                ))
              : null}
          </View>
        )}
      </>
    )
  }

  /** The extra room above a flow row: the gap, plus whatever bands opened. */
  const leadFor = (row: PlacedRow, prev: PlacedRow | null) => {
    if (!prev) return page.margin.top - basePadTop + (row.y - flowTop(1))
    if (row.page === prev.page) return row.y - (prev.y + prev.height)
    return BLOCK_GAP + Math.max(0, row.y - flowTop(row.page))
  }

  const rowViews: React.ReactNode[] = []
  let prev: PlacedRow | null = null
  for (const placed of layout.rows) {
    const lead = leadFor(placed, prev)
    prev = placed
    const row = placed.row
    rowViews.push(
      // A short block moves whole to the next sheet rather than printing half
      // a panel on each; only something taller than half a page may split.
      <View
        key={placed.index}
        wrap={placed.height > 300}
        style={lead > 0 ? { marginTop: lead } : {}}
      >
        {row.type === 'single' ? (
          <View style={blockMargin(row.block)}>
            <RenderNodePdf node={row.block.content} base={baseFor(spec, row.block)} />
          </View>
        ) : (
          <View style={{ flexDirection: 'row', gap: BLOCK_GAP }}>
            {(['left', 'right'] as const).map((side) => (
              <View
                key={side}
                style={{
                  flex: 1,
                  ...(placed.laneOffsets[side] ? { paddingTop: placed.laneOffsets[side] } : {}),
                }}
              >
                {row[side].map((block, i) => {
                  // The lane gap and the block's own margin add up, exactly
                  // as the engine sums them; spreading the margin over the
                  // gap used to erase it for any block with spacing set.
                  const m = marginOf(block)
                  return (
                    <View
                      key={block.id}
                      style={{
                        marginTop: (i > 0 ? BLOCK_GAP : 0) + m.top,
                        marginRight: m.right,
                        marginBottom: m.bottom,
                        marginLeft: m.left,
                      }}
                    >
                      <RenderNodePdf node={block.content} base={baseFor(spec, block)} />
                    </View>
                  )
                })}
              </View>
            ))}
          </View>
        )}
      </View>
    )
  }

  const lastFlowPage = layout.rows.reduce((max, row) => Math.max(max, row.page), 1)

  // Hand placements. First-sheet ones render as real absolute views, emitted
  // before the flow so they belong to page one: react-pdf only fetches images
  // it can see in the element tree, and the children of a render callback are
  // invisible to that pass, so a logo placed through one would silently not
  // print. Later sheets keep the callback, which text survives.
  const anchoredViews = anchored.map((block) => {
    if (block.placement.mode !== 'anchored') return null
    const anchor = block.placement.anchor
    const onPage = anchor.page ?? 1
    const at: Style = {
      position: 'absolute',
      left: anchor.x,
      top: anchor.y,
      width: anchor.width ?? contentWidth,
    }
    if (onPage === 1) {
      return (
        <View key={block.id} style={at}>
          <RenderNodePdf node={block.content} base={baseFor(spec, block)} />
        </View>
      )
    }
    return (
      <View
        key={block.id}
        fixed
        style={at}
        render={({ pageNumber }) =>
          pageNumber === onPage ? (
            <RenderNodePdf node={block.content} base={baseFor(spec, block)} />
          ) : null
        }
      />
    )
  })

  return (
    <Page size="A4" style={pageStyle} wrap>
      {frame && (
        <View
          fixed
          style={{ position: 'absolute', top: 0, left: 0, width: page.width, height: page.height }}
          render={({ pageNumber }) => chrome(pageNumber)}
        />
      )}

      {anchoredViews}

      {rowViews}

      {/* A hand placement on a sheet the flow never reaches still gets its
          sheet. */}
      {Array.from({ length: Math.max(0, layout.pageCount - lastFlowPage) }, (_, i) => (
        <View key={`extra-${i}`} break />
      ))}

      {pinned.map((block) => (
        <View
          key={block.id}
          fixed
          style={{
            position: 'absolute',
            left: page.margin.left,
            bottom: page.margin.bottom / 2,
            width: contentWidth,
          }}
        >
          <RenderNodePdf node={block.content} base={baseFor(spec, block)} />
        </View>
      ))}

      {children}
    </Page>
  )
}
