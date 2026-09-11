/**
 * A part described over several lines makes its table row taller, and the
 * estimate the PDF lays the page out with has to know that.
 *
 * The row height used to be the whole cell's text width divided by the column
 * width, which counts three short lines as one. The table then measured
 * shorter than it printed, and whatever the layout engine placed after it —
 * the totals, the notes, the footer — was put where the last rows would end
 * up. The counterpart for a customer address is in multiline-address.test.ts.
 */
import { describe, expect, it } from 'vitest'
import { estimateBlockHeights } from '@/features/invoice-designer/Pdf/estimateHeights'
import type { DocumentSpec } from '@/features/invoice-designer/Spec/documentSpec'

/* eslint-disable @typescript-eslint/no-explicit-any */

/** One table block on an A4 page, holding a single row with the given description. */
function specWithDescription(desc: string): DocumentSpec {
  return {
    // A4 in points, as the spec builder writes it. Without a width the
    // content width is NaN and no wrap is ever detected.
    page: {
      width: 595,
      height: 842,
      margin: { top: 40, right: 40, bottom: 40, left: 40 },
      fontFamily: 'Helvetica',
      fontSize: 9,
    },
    frame: undefined,
    blocks: [
      {
        id: 'items',
        placement: { mode: 'flow', order: 1 },
        content: {
          id: 'items',
          kind: 'table',
          columns: [
            { key: 'desc', width: 'flex', align: 'left' },
            { key: 'total', width: 60, align: 'right' },
          ],
          rows: [{ desc, total: '1 450.00' }],
          rowPadding: 5,
        },
      },
    ],
  } as unknown as DocumentSpec
}

const heightOf = (desc: string) => estimateBlockHeights(specWithDescription(desc)).get('items') ?? 0

describe('a line item described over several lines', () => {
  it('is taller than the same text on one line', () => {
    const oneLine = heightOf('Timing belt kit')
    const threeLines = heightOf('Timing belt kit\nGates K015603XS\nincludes tensioner')
    expect(threeLines).toBeGreaterThan(oneLine)
  })

  it('grows by roughly a line per break, not by a fraction', () => {
    const one = heightOf('Timing belt kit')
    const two = heightOf('Timing belt kit\nGates K015603XS')
    const three = heightOf('Timing belt kit\nGates K015603XS\nincludes tensioner')
    // Each break adds the same line, so the two steps are the same size.
    expect(three - two).toBeCloseTo(two - one, 5)
    expect(two - one).toBeGreaterThan(9)
  })

  it('counts a run that has to wrap on its own as well', () => {
    // No breaks typed: the estimate still has to see more than one line.
    const long = heightOf('Harbour Road '.repeat(20))
    expect(long).toBeGreaterThan(heightOf('Harbour Road'))
  })
})
