/**
 * @vitest-environment node
 *
 * A PDF's text has to read back as what it shows: it is searched, copied and
 * read aloud. The fonts draw a colon from the full stop's outline, and a
 * server whose first document had a colon and no full stop used to lose the
 * full stop's character for good: every later sheet showed "$500.00" and read
 * back "$500 00". These render real documents, in that order.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { createElement } from 'react'
import { Document, Page, Text, renderToBuffer } from '@react-pdf/renderer'
import { extractText } from 'unpdf'
import { describe, expect, it } from 'vitest'
import { pdfFontsReady } from '@/features/vehicles/Components/invoice-pdf/fonts'

const FAMILIES = [
  'Roboto',
  'Noto Serif',
  'Noto Sans Mono',
  'Open Sans',
  'Lato',
  'Montserrat',
  'PT Sans',
]

const sheet = (fontFamily: string, lines: string[]) =>
  createElement(
    Document,
    null,
    createElement(
      Page,
      { size: 'A4', style: { fontFamily, fontSize: 9 } },
      lines.map((line) => createElement(Text, { key: line }, line)),
      createElement(Text, { style: { fontFamily: `${fontFamily}-Bold` } }, lines.join(' '))
    )
  )

async function read(fontFamily: string, lines: string[]): Promise<string> {
  const buffer = await renderToBuffer(sheet(fontFamily, lines))
  const { text } = await extractText(new Uint8Array(buffer), { mergePages: true })
  return String(text).replace(/\s+/g, ' ')
}

describe('a full stop on a sheet printed after one that had only colons', () => {
  it.each(FAMILIES)('reads back as a full stop in %s', async (family) => {
    await pdfFontsReady()
    // The first sheet of the day: colons, an ellipsis, a semicolon, no full stop.
    await read(family, ['Engine Hours: 1,250 hrs', 'Registration: NB-4521-E; wait…'])

    const text = await read(family, ['james.mitchell@gmail.com', '$500.00', 'Invoice No. 7'])

    expect(text).toContain('james.mitchell@gmail.com')
    expect(text).toContain('$500.00')
    expect(text).toContain('Invoice No. 7')
    // Regular and bold both.
    expect(text.match(/\$500\.00/g)).toHaveLength(2)
  })
})

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (name === '__tests__' || name === 'generated' || name === 'node_modules') return []
    if (statSync(path).isDirectory()) return sourceFiles(path)
    return /\.tsx?$/.test(name) ? [path] : []
  })
}

describe('every document the server renders', () => {
  it('waits for the fonts first', () => {
    const offenders = sourceFiles('src').filter((path) => {
      const source = readFileSync(path, 'utf8')
      const renders = source.match(/renderTo(Buffer|Stream)\(/g)?.length ?? 0
      const waits = source.match(/await pdfFontsReady\(\)/g)?.length ?? 0
      return renders > waits
    })
    expect(offenders).toEqual([])
  })
})
