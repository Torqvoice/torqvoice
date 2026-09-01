import { groupFlowBlocks, type Block, type DocumentSpec, type FlowRow } from '../Spec/documentSpec'

/**
 * Where everything on the sheet goes, computed rather than measured.
 *
 * The browser measures how tall each block is at the width it prints at; from
 * those heights this lays the document out in plain numbers: which page a row
 * falls on, where it sits, and how the flow steps around anything placed by
 * hand. Because the geometry is computed, the editor can re-run it with a
 * hypothetical — a lifted block, the space a drag would take — and show the
 * page adapting before anything is committed.
 */

export const BLOCK_GAP = 14
/** A runaway anchor cannot conjure endless sheets. */
const MAX_PAGES = 8

export interface PlacedRect {
  /** 1-based sheet, or -1 for a block that repeats on every sheet. */
  page: number
  x: number
  y: number
  width: number
  height: number
}

export interface PlacedRow {
  /** Position among the flow rows, which is what a drop inserts before. */
  index: number
  row: FlowRow
  page: number
  y: number
  height: number
  /** Headroom above each lane of a pair where a placed block pushed it down. */
  laneOffsets: { left: number; right: number }
}

/** A line a drop can go into: before the row at `index`, or past the end. */
export interface GapLine {
  index: number
  page: number
  y: number
}

export interface LayoutOptions {
  /** A block held by the pointer: laid out as absent, so its slot closes. */
  liftedId?: string
  /** The space the held block would take, displacing the flow live. */
  band?: { page: number; x: number; y: number; width: number; height: number }
  /** Room opened before this flow row, previewing an insertion. */
  gapInsert?: { index: number; height: number }
}

export interface DocumentLayout {
  rows: PlacedRow[]
  gaps: GapLine[]
  /** Every block's computed rectangle, keyed by block id. */
  rects: Map<string, PlacedRect>
  pageCount: number
  contentWidth: number
  colWidth: number
}

interface Band {
  x: number
  width: number
  start: number
  end: number
}

const overlaps = (aStart: number, aSize: number, bStart: number, bSize: number) =>
  aStart < bStart + bSize && aStart + aSize > bStart

const NO_MARGIN = { top: 0, right: 0, bottom: 0, left: 0 }

/** The room a block keeps around itself in the flow. */
export const marginOf = (block: Block) => block.margin ?? NO_MARGIN

export function layoutDocument(
  spec: DocumentSpec,
  heightOf: (id: string) => number,
  opts: LayoutOptions = {}
): DocumentLayout {
  const { page } = spec
  const contentWidth = page.width - page.margin.left - page.margin.right
  const colWidth = (contentWidth - BLOCK_GAP) / 2

  const blocks = spec.blocks.filter((b) => b.id !== opts.liftedId)
  const flowRows = groupFlowBlocks(blocks)
  const anchored = blocks.filter((b) => b.placement.mode === 'anchored')
  const pinned = blocks.filter((b) => b.placement.mode === 'pinned')

  const rects = new Map<string, PlacedRect>()

  // The foot of the sheet the pinned blocks own; the flow stops above it.
  const pinnedHeight = pinned.reduce((max, b) => Math.max(max, heightOf(b.id)), 0)
  const flowLimit = pinned.length
    ? page.height - page.margin.bottom / 2 - pinnedHeight - BLOCK_GAP
    : page.height - page.margin.bottom
  // The framed letterhead's band only exists on the first sheet, so later
  // sheets start at the plain margin.
  const flowTop = (p: number) => (p === 1 ? page.margin.top : page.margin.bottom)

  // The vertical bands the flow must leave open: blocks placed by hand, and
  // the live drag when there is one. This is what "make room" is.
  const bandsByPage = new Map<number, Band[]>()
  const addBand = (p: number, x: number, y: number, width: number, height: number) => {
    if (height <= 0) return
    if (!overlaps(x, width, page.margin.left, contentWidth)) return
    const list = bandsByPage.get(p) ?? []
    list.push({ x, width, start: y - BLOCK_GAP, end: y + height + BLOCK_GAP })
    bandsByPage.set(p, list)
  }
  for (const b of anchored) {
    if (b.placement.mode !== 'anchored') continue
    const a = b.placement.anchor
    addBand(a.page ?? 1, a.x, a.y, a.width ?? contentWidth, heightOf(b.id))
  }
  if (opts.band) {
    addBand(opts.band.page, opts.band.x, opts.band.y, opts.band.width, opts.band.height)
  }
  for (const list of bandsByPage.values()) list.sort((a, b) => a.start - b.start)

  /** The top a thing of this width can start at, once past every band. */
  const clearOf = (p: number, y: number, height: number, x: number, width: number) => {
    let top = y
    for (const band of bandsByPage.get(p) ?? []) {
      if (!overlaps(band.x, band.width, x, width)) continue
      if (band.start < top + height && band.end > top) top = band.end
    }
    return top
  }

  /** A block's outer height in the flow: its content plus the room it keeps. */
  const outerHeight = (block: Block) => {
    const m = marginOf(block)
    return m.top + heightOf(block.id) + m.bottom
  }

  const laneHeight = (laneBlocks: Block[]) =>
    laneBlocks.reduce((sum, b, i) => sum + outerHeight(b) + (i ? BLOCK_GAP : 0), 0)

  const laneX = (side: 'left' | 'right') =>
    side === 'left' ? page.margin.left : page.margin.left + colWidth + BLOCK_GAP

  /** Place one row at or below `y` on page `p`, stepping lanes past bands. */
  const placeAt = (p: number, y: number, row: FlowRow) => {
    if (row.type === 'single') {
      const height = outerHeight(row.block)
      const top = clearOf(p, y, height, page.margin.left, contentWidth)
      return { top, height, bottom: top + height, laneOffsets: { left: 0, right: 0 } }
    }
    const leftH = laneHeight(row.left)
    const rightH = laneHeight(row.right)
    const top = Math.min(
      leftH ? clearOf(p, y, leftH, laneX('left'), colWidth) : Infinity,
      rightH ? clearOf(p, y, rightH, laneX('right'), colWidth) : Infinity
    )
    const start = Number.isFinite(top) ? top : y
    const leftTop = leftH ? clearOf(p, start, leftH, laneX('left'), colWidth) : start
    const rightTop = rightH ? clearOf(p, start, rightH, laneX('right'), colWidth) : start
    const bottom = Math.max(leftTop + leftH, rightTop + rightH, start)
    return {
      top: start,
      height: bottom - start,
      bottom,
      laneOffsets: { left: leftTop - start, right: rightTop - start },
    }
  }

  const placedRows: PlacedRow[] = []
  const gaps: GapLine[] = []
  let p = 1
  let y = flowTop(1)

  flowRows.forEach((row, index) => {
    if (opts.gapInsert?.index === index) y += opts.gapInsert.height + BLOCK_GAP

    let placed = placeAt(p, y, row)
    // A row that does not fit moves whole to the next sheet, unless it is
    // taller than a sheet, in which case it prints where it is and overflows.
    if (placed.bottom > flowLimit && placedRows.some((r) => r.page === p) && p < MAX_PAGES) {
      p += 1
      y = flowTop(p)
      placed = placeAt(p, y, row)
    }

    gaps.push({ index, page: p, y: placed.top - BLOCK_GAP / 2 })
    placedRows.push({
      index,
      row,
      page: p,
      y: placed.top,
      height: placed.height,
      laneOffsets: placed.laneOffsets,
    })

    if (row.type === 'single') {
      const m = marginOf(row.block)
      rects.set(row.block.id, {
        page: p,
        x: page.margin.left + m.left,
        y: placed.top + m.top,
        width: contentWidth - m.left - m.right,
        height: heightOf(row.block.id),
      })
    } else {
      for (const side of ['left', 'right'] as const) {
        let laneY = placed.top + placed.laneOffsets[side]
        for (const block of row[side]) {
          const m = marginOf(block)
          const height = heightOf(block.id)
          rects.set(block.id, {
            page: p,
            x: laneX(side) + m.left,
            y: laneY + m.top,
            width: colWidth - m.left - m.right,
            height,
          })
          laneY += outerHeight(block) + BLOCK_GAP
        }
      }
    }

    y = placed.bottom + BLOCK_GAP
  })
  gaps.push({ index: flowRows.length, page: p, y: y - BLOCK_GAP / 2 })

  for (const b of anchored) {
    if (b.placement.mode !== 'anchored') continue
    const a = b.placement.anchor
    rects.set(b.id, {
      page: a.page ?? 1,
      x: a.x,
      y: a.y,
      width: a.width ?? contentWidth,
      height: heightOf(b.id),
    })
  }
  for (const b of pinned) {
    const height = heightOf(b.id)
    rects.set(b.id, {
      page: -1,
      x: page.margin.left,
      y: page.height - page.margin.bottom / 2 - height,
      width: contentWidth,
      height,
    })
  }

  const pageCount = Math.max(1, p, ...[...rects.values()].map((r) => r.page), opts.band?.page ?? 1)

  return { rows: placedRows, gaps, rects, pageCount, contentWidth, colWidth }
}
