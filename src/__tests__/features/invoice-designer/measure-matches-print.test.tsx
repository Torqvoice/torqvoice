// @vitest-environment node
/**
 * The height the layout reserves for a block is measured without a browser
 * (measure.ts, estimateHeights.ts) and has to be at least what the PDF then
 * draws, or the next block is placed on top of the last lines. Measured
 * here against real prints: a long serial number breaking one character at
 * a time in a narrow equipment column used to measure by dividing its width
 * by the column's, and a glyph cannot be split, so a column of 60 W's
 * printed nine lines and measured eight.
 */
import { Document, Page, Text, View, renderToBuffer } from '@react-pdf/renderer'
import { getDocumentProxy } from 'unpdf'
import { describe, expect, it } from 'vitest'
import '@/features/vehicles/Components/invoice-pdf/fonts'
import { RenderNodePdf } from '@/features/invoice-designer/Pdf/renderPdf'
import { lineCount } from '@/features/invoice-designer/Pdf/measure'
import { nodeHeight } from '@/features/invoice-designer/Pdf/estimateHeights'
import type { Node } from '@/features/invoice-designer/Spec/documentSpec'

const BASE = { fontSize: 9, fontFamily: 'Helvetica' }
const MARK = 'ZZENDMARKZZ'

/** Where the text after the node starts, printed with and without the node. */
async function markY(node: Node | null, width: number): Promise<number> {
  const buffer = await renderToBuffer(
    <Document>
      <Page size="A4" style={{ padding: 40 }}>
        <View style={{ width }}>
          {node ? <RenderNodePdf node={node} base={BASE} /> : null}
          <Text style={{ fontSize: 9 }}>{MARK}</Text>
        </View>
      </Page>
    </Document>
  )
  const pdf = await getDocumentProxy(new Uint8Array(buffer))
  const content = await (await pdf.getPage(1)).getTextContent()
  const mark = content.items.find((item) => 'str' in item && item.str === MARK) as
    | { transform: number[] }
    | undefined
  if (!mark) throw new Error('marker not printed')
  return mark.transform[5]
}

/** The height the node printed at, in points. */
async function printedHeight(node: Node, width: number): Promise<number> {
  return (await markY(null, width)) - (await markY(node, width))
}

/** A one-column table whose text has exactly `room` points of width. */
const column = (text: string, room: number, breakLongWords = true): Node => ({
  kind: 'table',
  columns: [{ key: 'v', label: 'V', width: room }],
  rows: [{ v: text }],
  breakLongWords,
})

const SERIAL = 'WDB9066331S123456789'
const FLEET = 'FLEET-0001-ABCDEFGHIJKLMNOPQRSTUVW-0042'

describe('a long unbroken value in a narrow column', () => {
  it('measures 60 W characters at 9 pt in a 60 pt column as the nine lines they print', async () => {
    const style = { fontFamily: 'Helvetica', fontSize: 9 }
    expect(lineCount('W'.repeat(60), 60, style, 9, true)).toBe(9)
    const node = column('W'.repeat(60), 60)
    expect(nodeHeight(node, 76, BASE)).toBeGreaterThanOrEqual(await printedHeight(node, 76))
  })

  it.each([
    ['a serial number', SERIAL, 50],
    ['a 40-character fleet number', FLEET, 70],
    ['narrow letters', 'i'.repeat(45), 30],
    ['wide letters in a column one letter wide', 'W'.repeat(10), 12],
    ['a long word between short ones', `S/N ${'W'.repeat(20)} ok`, 40],
    ['ordinary words', 'Model 12 heavy duty with a crane on the back', 60],
    ['a second paragraph', `${SERIAL}\nLine two of it`, 50],
  ])('is never measured shorter than it prints: %s', async (_name, text, room) => {
    const node = column(text, room)
    const printed = await printedHeight(node, room + 16)
    const measured = nodeHeight(node, room + 16, BASE)
    expect(measured).toBeGreaterThanOrEqual(printed - 0.5)
    // And not padded out either: within one line of what prints.
    expect(measured - printed).toBeLessThan(9 * 1.4)
  })
})

describe('the equipment table as an invoice prints it', () => {
  const equipment = (serial: string, model: string): Node => ({
    kind: 'table',
    columns: [
      { key: 'type', label: 'Type', width: 'flex' },
      { key: 'model', label: 'Model', width: 'flex' },
      { key: 'year', label: 'Produksjonsår', width: 44 },
      { key: 'serial', label: 'Serial no.', width: 'flex' },
      { key: 'next', label: 'Next examination', width: 66 },
    ],
    rows: [
      { type: 'Tail lift', model, year: '2019', serial, next: '02/01/2027' },
      { type: 'Crane', model: 'X-HiPro 232', year: '2021', serial: 'SN-1', next: '-' },
    ],
    columnGap: 6,
    breakLongWords: true,
  })

  it.each([
    ['a very long serial', `SN-${'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'.repeat(3)}`, 'Model 12'],
    ['a very long model', 'SN-42', `MEGALIFT${'W'.repeat(40)}`],
    ['both, with ordinary words', `S/N ${SERIAL}${SERIAL}`, 'Model 12 heavy duty extra long'],
  ])('reserves at least the height it prints with %s', async (_name, serial, model) => {
    const node = equipment(serial, model)
    const printed = await printedHeight(node, 515)
    expect(nodeHeight(node, 515, BASE)).toBeGreaterThanOrEqual(printed - 0.5)
  })
})
