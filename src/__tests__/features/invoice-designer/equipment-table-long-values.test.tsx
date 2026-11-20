// @vitest-environment node
/**
 * An equipment list printed on A4: seven narrow columns side by side. A
 * 60-character serial number ran across the next columns and off the page,
 * and a model that filled its column printed flush against the year beside
 * it ("Model 12 heavy duty2019"). The equipment table keeps a gap between
 * its columns and wraps a long word inside its own column, without adding a
 * hyphen to a serial number. The parts and labour tables are not touched.
 */
import { Document, Page, renderToBuffer } from '@react-pdf/renderer'
import { getDocumentProxy } from 'unpdf'
import { describe, expect, it } from 'vitest'
import '@/features/vehicles/Components/invoice-pdf/fonts'
import { RenderNodePdf, wrapPieces } from '@/features/invoice-designer/Pdf/renderPdf'
import { lineCount } from '@/features/invoice-designer/Pdf/measure'
import type { Node } from '@/features/invoice-designer/Spec/documentSpec'

const SERIAL = 'SN-ABCDEFGHIJKLMNOPQRSTUVWXYZ-0123456789-ABCDEFGHIJKLMNOPQRS'
const PAGE_WIDTH = 595.28
const MARGIN = 40

const table = (flags: { columnGap?: number; breakLongWords?: boolean }): Node => ({
  kind: 'table',
  columns: [
    { key: 'type', label: 'Type', width: 'flex' },
    { key: 'make', label: 'Make', width: 'flex' },
    { key: 'model', label: 'Model', width: 'flex' },
    { key: 'year', label: 'Year', width: 44 },
    { key: 'serial', label: 'Serial no.', width: 'flex' },
    { key: 'next', label: 'Next examination', width: 66 },
    { key: 'meters', label: 'Meter readings', width: 'flex' },
  ],
  rows: [
    {
      type: 'Tail lift',
      make: 'Dhollandia',
      model: 'Model 12 heavy duty',
      year: '2019',
      serial: SERIAL,
      next: '02/01/2027',
      meters: '-',
    },
  ],
  ...flags,
})

/** Every piece of text on the page with where it starts and ends. */
async function textOnPage(node: Node) {
  const buffer = await renderToBuffer(
    <Document>
      <Page size="A4" style={{ padding: MARGIN }}>
        <RenderNodePdf node={node} base={{ fontSize: 9, fontFamily: 'Roboto', color: '#111827' }} />
      </Page>
    </Document>
  )
  const pdf = await getDocumentProxy(new Uint8Array(buffer))
  const page = await pdf.getPage(1)
  const content = await page.getTextContent()
  return content.items
    .filter((item) => 'str' in item && item.str.trim())
    .map((item) => {
      const i = item as { str: string; transform: number[]; width: number }
      return { str: i.str, x: i.transform[4], y: i.transform[5], right: i.transform[4] + i.width }
    })
}

describe('a long value in the equipment table', () => {
  it('stays inside the page and inside its own column, as typed, with no hyphen added', async () => {
    const items = await textOnPage(table({ columnGap: 6, breakLongWords: true }))
    // Nothing reaches past the right margin.
    for (const item of items) expect(item.right).toBeLessThanOrEqual(PAGE_WIDTH - MARGIN + 0.5)
    // The serial's characters all start before the next column's date.
    const date = items.find((item) => item.str.includes('02/01/2027'))
    expect(date).toBeDefined()
    const serialPieces = items.filter((item) => item !== date && item.x > (date?.x ?? 0) - 120)
    const serialRight = Math.max(
      ...items
        .filter((item) => /^[A-Z0-9-]+$/.test(item.str) && item.x < (date?.x ?? 0))
        .map((item) => item.right)
    )
    expect(serialRight).toBeLessThanOrEqual((date?.x ?? 0) + 0.5)
    expect(serialPieces.length).toBeGreaterThan(0)
    // Read back in order it is the serial, with only its own three hyphens.
    const text = items
      .filter((item) => item.x < (date?.x ?? 0) && /^[A-Z0-9-]+$/.test(item.str))
      .sort((a, b) => b.y - a.y || a.x - b.x)
      .map((item) => item.str)
      .join('')
    expect(text).toContain(SERIAL)
    expect(text.split('-').length - 1).toBe(SERIAL.split('-').length - 1)
  })

  it('keeps a model that fills its column clear of the year beside it', async () => {
    const items = await textOnPage(table({ columnGap: 6, breakLongWords: true }))
    const year = items.find((item) => item.str === '2019')
    const model = items.filter((item) => /Model|heavy|duty/.test(item.str))
    expect(year).toBeDefined()
    for (const piece of model) expect(piece.right).toBeLessThanOrEqual((year?.x ?? 0) - 5)
  })

  it('ran off the page before, which is what the test above guards against', async () => {
    const items = await textOnPage(table({}))
    expect(Math.max(...items.map((item) => item.right))).toBeGreaterThan(PAGE_WIDTH - MARGIN)
  })
})

describe('the pieces a long word wraps between', () => {
  it('keeps short words whole with their space, and a long word one character at a time', () => {
    expect(wrapPieces('Model 12 heavy duty')).toEqual(['Model ', '12 ', 'heavy ', 'duty'])
    const pieces = wrapPieces(`S/N ${SERIAL}`)
    expect(pieces[0]).toBe('S/N ')
    expect(pieces.slice(1).join('')).toBe(SERIAL)
    expect(pieces.slice(1).every((piece) => piece.length === 1)).toBe(true)
  })

  it('counts the lines a long word takes when it wraps, and one line when it may not', () => {
    const style = { fontFamily: 'Helvetica' }
    expect(lineCount(SERIAL, 60, style, 9)).toBe(1)
    expect(lineCount(SERIAL, 60, style, 9, true)).toBeGreaterThan(3)
    expect(lineCount('Model 12 heavy duty', 200, style, 9, true)).toBe(1)
  })
})
