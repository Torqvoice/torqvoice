/**
 * A customer address is written on two or three lines and has to print that
 * way. The sheet has two renderers with two different ideas of height: the
 * HTML one measures the rendered DOM, the PDF one estimates from the font
 * metrics. An estimate that counted a two-line address as one would overlap
 * the block below it, so both halves are pinned here.
 */
import { describe, expect, it } from 'vitest'
import { buildDocumentSpec } from '@/features/invoice-designer/Spec/buildSpec'
import { buildSampleData } from '@/features/invoice-designer/Components/sample'
import { mergeWithDefaults } from '@/features/settings/Schema/invoiceLayoutSchema'
import { themeOf } from '@/features/invoice-designer/Components/designTheme'
import { lineCount } from '@/features/invoice-designer/Pdf/measure'

/* eslint-disable @typescript-eslint/no-explicit-any */
const ADDRESS = '12 Harbour Road\nApartment 4\nSpringfield'

function customerBlockText(address: string): string[] {
  const data = buildSampleData(
    { name: 'Shop', address: '', phone: '', email: '', logoUrl: null } as any,
    [],
    ((key: string) => key) as any,
    {},
    'invoice'
  )
  data.fields.customer_address = address
  const layout = mergeWithDefaults({})
  const spec = buildDocumentSpec(layout, themeOf({} as any, layout), data)
  const block = spec.blocks.find((b: any) => b.content?.id === 'customer')?.content

  const out: string[] = []
  const walk = (n: any) => {
    if (!n || typeof n !== 'object') return
    if (n.kind === 'text' && n.text) out.push(n.text)
    for (const child of n.children ?? []) walk(child.node ?? child)
  }
  walk(block)
  return out
}

describe('a customer address that runs to several lines', () => {
  it('reaches the sheet with its breaks intact', () => {
    expect(customerBlockText(ADDRESS)).toContain(ADDRESS)
  })

  it('is not flattened into one line on the way', () => {
    const printed = customerBlockText(ADDRESS)
    expect(printed.some((text) => text.includes('12 Harbour Road Springfield'))).toBe(false)
  })

  it('is measured as three lines by the PDF, not one', () => {
    // Wide enough that nothing wraps on its own, so the count is the breaks.
    expect(lineCount(ADDRESS, 400, undefined, 9)).toBe(3)
    expect(lineCount('12 Harbour Road', 400, undefined, 9)).toBe(1)
  })

  it('still measures a long line that has to wrap on its own', () => {
    // Many short words rather than one long one: the estimator wraps at
    // spaces and deliberately leaves an over-long word on its own line.
    const long = 'Harbour Road '.repeat(12)
    expect(lineCount(long, 60, undefined, 9)).toBeGreaterThan(1)
  })
})
