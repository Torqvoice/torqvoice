/**
 * The geometry the designer drags against is computed here, not measured from
 * the DOM, so it can be held to account: rows land where the numbers say,
 * page breaks fall between rows, the flow steps around what was placed by
 * hand, and the pinned footer keeps the foot of the sheet to itself.
 */
import { describe, expect, it } from 'vitest'
import type { Block, DocumentSpec } from '@/features/invoice-designer/Spec/documentSpec'
import { BLOCK_GAP, layoutDocument } from '@/features/invoice-designer/Render/layoutEngine'

const MARGIN = 40
const PAGE = { width: 595, height: 842 }
const CONTENT_WIDTH = PAGE.width - MARGIN * 2

function specOf(blocks: Block[]): DocumentSpec {
  return {
    page: {
      ...PAGE,
      margin: { top: MARGIN, right: MARGIN, bottom: MARGIN, left: MARGIN },
      text: '#111827',
      muted: '#6b7280',
      accent: '#d97706',
      fontFamily: 'Helvetica',
      fontSize: 9,
    },
    blocks,
  }
}

const flow = (id: string, order: number, column?: 'left' | 'right'): Block => ({
  id,
  label: id,
  placement: { mode: 'flow', order, column },
  content: { kind: 'text', text: id },
})

const anchoredAt = (id: string, x: number, y: number, width: number, page = 1): Block => ({
  id,
  label: id,
  placement: { mode: 'anchored', anchor: { x, y, width, page } },
  content: { kind: 'text', text: id },
})

const pinnedFooter = (id = 'footer'): Block => ({
  id,
  label: id,
  placement: { mode: 'pinned', edge: 'bottom' },
  content: { kind: 'text', text: id },
})

const heights = (map: Record<string, number>) => (id: string) => map[id] ?? 0

describe('flow placement', () => {
  it('stacks rows from the top margin with the gap between them', () => {
    const layout = layoutDocument(specOf([flow('a', 0), flow('b', 1)]), heights({ a: 100, b: 50 }))
    expect(layout.rows.map((r) => [r.page, r.y, r.height])).toEqual([
      [1, MARGIN, 100],
      [1, MARGIN + 100 + BLOCK_GAP, 50],
    ])
  })

  it('offers a gap before every row and one past the end', () => {
    const layout = layoutDocument(specOf([flow('a', 0), flow('b', 1)]), heights({ a: 100, b: 50 }))
    expect(layout.gaps.map((g) => g.index)).toEqual([0, 1, 2])
  })

  it('moves a row that does not fit whole to the next sheet', () => {
    const layout = layoutDocument(specOf([flow('a', 0), flow('b', 1)]), heights({ a: 700, b: 200 }))
    expect(layout.rows.map((r) => r.page)).toEqual([1, 2])
    expect(layout.pageCount).toBe(2)
  })

  it('gives paired columns one row as tall as the taller lane', () => {
    const layout = layoutDocument(
      specOf([flow('customer', 0, 'left'), flow('vehicle', 1, 'right')]),
      heights({ customer: 80, vehicle: 120 })
    )
    expect(layout.rows).toHaveLength(1)
    expect(layout.rows[0].height).toBe(120)
    const customer = layout.rects.get('customer')
    const vehicle = layout.rects.get('vehicle')
    expect(customer?.x).toBe(MARGIN)
    expect(vehicle?.x).toBe(MARGIN + layout.colWidth + BLOCK_GAP)
  })
})

describe('making room', () => {
  it('pushes the flow below a block placed over the column', () => {
    const card = anchoredAt('customer', 100, 60, 200)
    const layout = layoutDocument(specOf([flow('a', 0), card]), heights({ a: 100, customer: 90 }))
    // The row starts below the card and the gap that separates them.
    expect(layout.rows[0].y).toBe(60 + 90 + BLOCK_GAP)
  })

  it('leaves the flow alone when the placed block misses the column', () => {
    const outside = anchoredAt('stamp', 0, 60, 30)
    const layout = layoutDocument(specOf([flow('a', 0), outside]), heights({ a: 100, stamp: 90 }))
    expect(layout.rows[0].y).toBe(MARGIN)
  })

  it('drops only the lane a placed block covers, not its neighbour', () => {
    // The card sits over the right lane; the left lane keeps its place.
    const card = anchoredAt('note', 340, 50, 180)
    const layout = layoutDocument(
      specOf([flow('customer', 0, 'left'), flow('vehicle', 1, 'right'), card]),
      heights({ customer: 80, vehicle: 80, note: 60 })
    )
    const row = layout.rows[0]
    expect(row.laneOffsets.left).toBe(0)
    expect(row.laneOffsets.right).toBeGreaterThan(0)
  })

  it('adapts live to the space a lifted block would take', () => {
    const layout = layoutDocument(
      specOf([flow('a', 0), flow('b', 1)]),
      heights({ a: 100, b: 50 }),
      {
        liftedId: 'b',
        band: { page: 1, x: MARGIN, y: 40, width: CONTENT_WIDTH, height: 60 },
      }
    )
    expect(layout.rows).toHaveLength(1)
    expect(layout.rows[0].y).toBe(40 + 60 + BLOCK_GAP)
  })

  it('opens a slot where an insertion would land', () => {
    const layout = layoutDocument(
      specOf([flow('a', 0), flow('b', 1)]),
      heights({ a: 100, b: 50 }),
      {
        gapInsert: { index: 1, height: 30 },
      }
    )
    expect(layout.rows[1].y).toBe(MARGIN + 100 + BLOCK_GAP + 30 + BLOCK_GAP)
  })
})

describe('a section with margin', () => {
  it('keeps the asked-for room around a full-width block', () => {
    const roomy: Block = {
      ...flow('a', 0),
      margin: { top: 20, right: 30, bottom: 10, left: 15 },
    }
    const layout = layoutDocument(specOf([roomy, flow('b', 1)]), heights({ a: 100, b: 50 }))
    const rect = layout.rects.get('a')
    expect(rect).toMatchObject({ x: MARGIN + 15, y: MARGIN + 20, width: CONTENT_WIDTH - 45 })
    // The next row starts after the block plus its top and bottom margins.
    expect(layout.rows[1].y).toBe(MARGIN + 20 + 100 + 10 + BLOCK_GAP)
  })

  it('keeps the room inside a lane as well', () => {
    const roomy: Block = {
      ...flow('customer', 0, 'left'),
      margin: { top: 8, right: 0, bottom: 0, left: 0 },
    }
    const layout = layoutDocument(
      specOf([roomy, flow('vehicle', 1, 'right')]),
      heights({ customer: 80, vehicle: 80 })
    )
    expect(layout.rects.get('customer')?.y).toBe(MARGIN + 8)
    expect(layout.rows[0].height).toBe(88)
  })
})

describe('the foot of the sheet', () => {
  it('stops the flow above the pinned footer', () => {
    const layout = layoutDocument(
      specOf([flow('a', 0), flow('b', 1), pinnedFooter()]),
      heights({ a: 700, b: 60, footer: 40 })
    )
    // Without the footer both would fit; with it the second row must move on.
    expect(layout.rows.map((r) => r.page)).toEqual([1, 2])
  })

  it('places the footer against the bottom on every sheet', () => {
    const layout = layoutDocument(
      specOf([flow('a', 0), pinnedFooter()]),
      heights({ a: 100, footer: 40 })
    )
    const rect = layout.rects.get('footer')
    expect(rect?.page).toBe(-1)
    expect(rect?.y).toBe(PAGE.height - MARGIN / 2 - 40)
  })
})

describe('a lifted block', () => {
  it('is laid out as absent, so its slot closes', () => {
    const layout = layoutDocument(
      specOf([flow('a', 0), flow('b', 1), flow('c', 2)]),
      heights({ a: 100, b: 50, c: 50 }),
      { liftedId: 'b' }
    )
    expect(layout.rows.map((r) => r.row.type === 'single' && r.row.block.id)).toEqual(['a', 'c'])
    expect(layout.rows[1].y).toBe(MARGIN + 100 + BLOCK_GAP)
  })

  it('casts no band from where it used to be', () => {
    const layout = layoutDocument(
      specOf([flow('a', 0), anchoredAt('card', 100, 60, 200)]),
      heights({ a: 100, card: 90 }),
      { liftedId: 'card' }
    )
    expect(layout.rows[0].y).toBe(MARGIN)
  })
})

describe('sheets', () => {
  it('counts the sheet an anchored block was carried to', () => {
    const layout = layoutDocument(
      specOf([flow('a', 0), anchoredAt('card', 100, 100, 200, 3)]),
      heights({ a: 100, card: 90 })
    )
    expect(layout.pageCount).toBe(3)
  })
})
