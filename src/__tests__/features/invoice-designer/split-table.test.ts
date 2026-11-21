/**
 * A long table on the on-screen sheet (share pages, portal, preview) is cut
 * between its rows across pages, as the PDF cuts it, rather than jumping
 * whole to the next page and running off its foot. Every row prints once,
 * in order; each later piece starts a page under its column headings; a
 * short table still moves whole; and a sheet that does not ask for cutting
 * (the designer canvas, the PDF's own layout) lays out as it always did.
 */
import { describe, expect, it } from 'vitest'
import type { Block, DocumentSpec } from '@/features/invoice-designer/Spec/documentSpec'
import { SPLIT_MIN_HEIGHT, layoutDocument } from '@/features/invoice-designer/Render/layoutEngine'
import { sliceBlock, type TableSplit } from '@/features/invoice-designer/Render/splitTable'

const MARGIN = 40
const PAGE = { width: 595, height: 842 }
const FLOW_LIMIT = PAGE.height - MARGIN

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

const rows = (n: number) => Array.from({ length: n }, (_, i) => ({ serial: `SN-${i + 1}` }))

const table = (id: string, order: number, n: number): Block => ({
  id,
  label: id,
  placement: { mode: 'flow', order },
  content: {
    kind: 'stack',
    children: [
      { kind: 'text', text: 'Equipment' },
      {
        kind: 'table',
        columns: [{ key: 'serial', label: 'Serial no.', width: 'flex' }],
        rows: rows(n),
        stripe: '#f4f4f5',
      },
    ],
  },
})

const text = (id: string, order: number): Block => ({
  id,
  label: id,
  placement: { mode: 'flow', order },
  content: { kind: 'text', text: id },
})

/** 20 points a row under a 40 point head (title and column headings). */
const measured = (n: number): TableSplit => ({
  head: 40,
  header: 18,
  rows: Array(n).fill(20),
  tail: 2,
})

function layoutOf(blocks: Block[], heights: Record<string, number>, splits = true) {
  const spec = specOf(blocks)
  const splitOf = (id: string) => (id === 'equipment' ? measured(60) : null)
  return layoutDocument(spec, (id) => heights[id] ?? 0, splits ? { splitOf } : {})
}

describe('a long table on the on-screen sheet', () => {
  // A letterhead most of a page tall, then 60 rows: 1,242 points of table.
  const blocks = [text('header', 0), table('equipment', 1, 60)]
  const heights = { header: 500, equipment: 40 + 60 * 20 + 2 }

  it('starts under what is above it instead of leaving the page empty', () => {
    const pieces = layoutOf(blocks, heights).rows.filter((r) => r.row.type === 'single' && r.slice)
    expect(pieces[0].page).toBe(1)
    expect(pieces[0].slice).toMatchObject({ from: 0, first: true })
  })

  it('prints every row once, in order, each piece inside its page', () => {
    const pieces = layoutOf(blocks, heights).rows.filter((r) => r.slice)
    expect(pieces.length).toBeGreaterThan(1)
    let next = 0
    for (const [i, piece] of pieces.entries()) {
      expect(piece.slice?.from).toBe(next)
      next = piece.slice?.to ?? next
      expect(piece.page).toBe(pieces[0].page + i)
      expect(piece.y + piece.height).toBeLessThanOrEqual(FLOW_LIMIT)
    }
    expect(next).toBe(60)
    expect(pieces.slice(1).every((piece) => piece.slice?.first === false)).toBe(true)
  })

  it('starts each later piece at the top of its page under the headings again', () => {
    const pieces = layoutOf(blocks, heights).rows.filter((r) => r.slice)
    const second = pieces[1]
    expect(second.y).toBe(MARGIN)
    const rowsOnIt = (second.slice?.to ?? 0) - (second.slice?.from ?? 0)
    // The headings and its rows, nothing else: the title stays on the first page.
    expect(second.height).toBe(18 + rowsOnIt * 20 + (second.slice?.to === 60 ? 2 : 0))
  })

  it('pushes what follows below its last piece', () => {
    const layout = layoutOf([...blocks, text('totals', 2)], { ...heights, totals: 60 })
    const last = layout.rows.filter((r) => r.slice).at(-1)
    const totals = layout.rows.find((r) => r.row.type === 'single' && r.row.block.id === 'totals')
    expect(totals?.page).toBe(last?.page)
    expect(totals?.y).toBeGreaterThan((last?.y ?? 0) + (last?.height ?? 0))
  })

  it('moves a short table whole, as the PDF does', () => {
    const short = { header: 700, equipment: SPLIT_MIN_HEIGHT - 10 }
    const layout = layoutOf(blocks, short)
    const placed = layout.rows.filter(
      (r) => r.row.type === 'single' && r.row.block.id === 'equipment'
    )
    expect(placed).toHaveLength(1)
    expect(placed[0].slice).toBeUndefined()
    expect(placed[0].page).toBe(2)
  })

  it('lays out as before on a sheet that does not ask for cutting', () => {
    const layout = layoutOf(blocks, heights, false)
    const placed = layout.rows.filter(
      (r) => r.row.type === 'single' && r.row.block.id === 'equipment'
    )
    expect(placed).toHaveLength(1)
    expect(placed[0].slice).toBeUndefined()
  })
})

describe('a piece of a cut table', () => {
  const block = table('equipment', 1, 6)

  it('keeps the title on the first piece and only the table on a later one', () => {
    const first = sliceBlock(block, { from: 0, to: 3, first: true })
    expect(first.content.kind).toBe('stack')
    const later = sliceBlock(block, { from: 3, to: 6, first: false })
    expect(later.content.kind).toBe('table')
    expect(later.content.kind === 'table' && later.content.rows).toEqual(rows(6).slice(3))
  })

  it('carries the banding on from the rows above it', () => {
    const later = sliceBlock(block, { from: 3, to: 6, first: false })
    expect(later.content.kind === 'table' && later.content.bandStart).toBe(3)
  })
})
