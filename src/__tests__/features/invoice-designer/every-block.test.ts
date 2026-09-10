/**
 * Every block on the sheet, and whether it does what the designer says it
 * will.
 *
 * The designer offers the same handful of switches for eighteen sections, so
 * the risk is not that one switch is wrong: it is that one *section* ignores
 * the switch every other section obeys. A section that quietly prints while
 * hidden puts a customer's address on a sheet somebody took it off, and a
 * heading that will not go away is the kind of thing nobody notices until a
 * workshop asks why. So the visibility rule is asserted for all of them by
 * name, from the list the designer itself reads.
 */
import { describe, expect, it } from 'vitest'
import { buildSampleData } from '@/features/invoice-designer/Components/sample'
import { themeOf } from '@/features/invoice-designer/Components/designTheme'
import { buildDocumentSpec } from '@/features/invoice-designer/Spec/buildSpec'
import {
  BUILTIN_SECTIONS,
  type InvoiceLayoutConfig,
  type InvoiceSection,
  mergeWithDefaults,
} from '@/features/settings/Schema/invoiceLayoutSchema'

/* eslint-disable @typescript-eslint/no-explicit-any */

const sample = () =>
  buildSampleData(
    {
      name: 'Shop',
      address: 'A road',
      phone: '555',
      email: 'shop@example.com',
      logoUrl: null,
    } as any,
    [],
    ((key: string) => key) as any,
    {},
    'invoice'
  )

/** The sheet a layout prints, with the given sections patched. */
function specWith(patch: (section: InvoiceSection) => Partial<InvoiceSection> | undefined) {
  const layout = mergeWithDefaults({}) as InvoiceLayoutConfig
  layout.sections = layout.sections.map((section) => ({ ...section, ...patch(section) }))
  return buildDocumentSpec(layout, themeOf({} as any, layout), sample()) as any
}

const printed = (spec: any): string[] => spec.blocks.map((block: any) => block.content?.id)

function blockOf(spec: any, id: string) {
  return spec.blocks.find((block: any) => block.content?.id === id)?.content
}

/** Every string a block prints, in order. */
function textsOf(node: any): string[] {
  const out: string[] = []
  const walk = (n: any) => {
    if (!n || typeof n !== 'object') return
    if (n.kind === 'text' && n.text) out.push(String(n.text))
    for (const child of n.children ?? []) walk(child.node ?? child)
  }
  walk(node)
  return out
}

const DEFAULT_SHEET = printed(specWith(() => undefined))

describe('the sections a default sheet prints', () => {
  it('is the list the designer shows, minus the ones off by default', () => {
    // If this list changes, the tests below are testing something else.
    expect(DEFAULT_SHEET).toEqual([
      'header',
      'document_title',
      'slogan',
      'customer',
      'vehicle',
      'service',
      'parts_table',
      'labor_table',
      'findings',
      'totals',
      'notes',
      'attached_documents',
      'warranty',
      'bank_account',
      'footer',
    ])
  })

  it.each(DEFAULT_SHEET)('hides %s when its switch is off, and nothing else', (id) => {
    const spec = specWith((section) => (section.id === id ? { visible: false } : undefined))
    expect(printed(spec)).not.toContain(id)
    expect(printed(spec)).toEqual(DEFAULT_SHEET.filter((other) => other !== id))
  })

  it('brings the combined items table back when it is switched on', () => {
    // Off by default because the parts and labour tables cover the same
    // ground; the designer warns that they are exclusive.
    expect(DEFAULT_SHEET).not.toContain('items_table')
    const spec = specWith((section) =>
      section.id === 'items_table' ? { visible: true } : undefined
    )
    expect(printed(spec)).toContain('items_table')
  })

  it.each(['telegram_qr', 'general'])('leaves %s off the sheet with nothing to print', (id) => {
    // Visible and empty is a real state — a QR code with no bot connected, a
    // custom-fields block with no fields — and the designer's rail says
    // "empty" beside it rather than printing a blank panel.
    const spec = specWith((section) => (section.id === id ? { visible: true } : undefined))
    expect(printed(spec)).not.toContain(id)
  })
})

describe('the switches a section carries', () => {
  it('drops the heading and keeps what is under it', () => {
    const on = textsOf(
      blockOf(
        specWith(() => undefined),
        'customer'
      )
    )
    expect(on[0]).toBe('Bill To')

    const off = textsOf(
      blockOf(
        specWith((section) => (section.id === 'customer' ? { heading: false } : undefined)),
        'customer'
      )
    )
    expect(off).not.toContain('Bill To')
    // The customer is still billed; only the words over the panel are gone.
    expect(off[0]).toBe(on[1])
  })

  it('prints the name a workshop gives the document in place of its own', () => {
    // A business registered for GST has to head the sheet "Tax Invoice"; one
    // that is not registered must not. It cannot wait for a translation.
    const spec = specWith((section) =>
      section.id === 'document_title' ? { text: 'TAX INVOICE' } : undefined
    )
    const title = textsOf(blockOf(spec, 'document_title'))
    expect(title[0]).toBe('TAX INVOICE')
    expect(title).not.toContain('INVOICE')
  })

  it('takes the panel away from a section told not to draw one', () => {
    const boxed = blockOf(
      specWith(() => undefined),
      'customer'
    )
    expect(boxed.style?.background).toBeTruthy()
    expect(boxed.style?.borderWidth).toBeGreaterThan(0)

    const bare = blockOf(
      specWith((section) => (section.id === 'customer' ? { boxed: false } : undefined)),
      'customer'
    )
    expect(bare.style?.background).toBeFalsy()
    expect(bare.style?.borderWidth).toBe(0)
  })

  it('moves a section where its order puts it', () => {
    // The rail is a running order: dragging a section up has to move it on
    // the sheet, not only in the list.
    const spec = specWith((section) => (section.id === 'notes' ? { order: 0 } : undefined))
    const order = printed(spec)
    expect(order.indexOf('notes')).toBeLessThan(order.indexOf('document_title'))
  })

  it('pairs two sections into one row when both are given a side', () => {
    const spec = specWith((section) =>
      section.id === 'notes'
        ? { column: 'right' }
        : section.id === 'warranty'
          ? { column: 'left' }
          : undefined
    )
    const notes = spec.blocks.find((b: any) => b.content?.id === 'notes')
    const warranty = spec.blocks.find((b: any) => b.content?.id === 'warranty')
    expect(notes.placement.column).toBe('right')
    expect(warranty.placement.column).toBe('left')
  })

  it('lifts a section out of the flow when it is placed by hand', () => {
    const layout = mergeWithDefaults({}) as InvoiceLayoutConfig
    layout.anchors = { totals: { x: 300, y: 500, width: 200 } }
    const spec = buildDocumentSpec(layout, themeOf({} as any, layout), sample()) as any
    const totals = spec.blocks.find((b: any) => b.content?.id === 'totals')
    expect(totals.placement.mode).toBe('anchored')
    expect(totals.placement.anchor).toMatchObject({ x: 300, y: 500, width: 200 })
  })
})

describe('the fields inside a section', () => {
  const customerFieldsOff = (offId: string) => {
    const layout = mergeWithDefaults({}) as InvoiceLayoutConfig
    layout.sections = layout.sections.map((section) =>
      section.id === 'customer'
        ? {
            ...section,
            fields: (section.fields ?? []).map((field) =>
              field.id === offId ? { ...field, visible: false } : field
            ),
          }
        : section
    )
    return textsOf(
      blockOf(buildDocumentSpec(layout, themeOf({} as any, layout), sample()) as any, 'customer')
    )
  }

  it('drops the one line switched off and keeps its neighbours', () => {
    const all = customerFieldsOff('nothing_is_off')
    expect(all).toContain('alex@example.com')
    expect(all).toContain('+1 555 0134')

    const withoutEmail = customerFieldsOff('customer_email')
    expect(withoutEmail).not.toContain('alex@example.com')
    expect(withoutEmail).toContain('+1 555 0134')
    expect(withoutEmail).toContain('Alex Carter')
  })
})
