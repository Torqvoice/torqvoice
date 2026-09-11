/**
 * The designer's field list is a running order, not just a set of switches.
 * Two blocks used to read it as a set and print their rows in the order they
 * happened to build them, so dragging a row in the inspector moved nothing on
 * the sheet.
 *
 * Those two are pinned in detail below. The first suite asks the same question
 * of every section that has a field list, because "dragging does nothing" is
 * a bug that lives in one block at a time: it was fixed in the payment panel
 * and the title strip, and nothing was keeping the other five honest.
 */
import { describe, expect, it } from 'vitest'
import { buildSampleData } from '@/features/invoice-designer/Components/sample'
import { mergeWithDefaults } from '@/features/settings/Schema/invoiceLayoutSchema'
import { buildDocumentSpec } from '@/features/invoice-designer/Spec/buildSpec'
import { themeOf } from '@/features/invoice-designer/Components/designTheme'
import type { InvoiceFieldConfig } from '@/features/settings/Schema/invoiceLayoutSchema'

/* eslint-disable @typescript-eslint/no-explicit-any */
const sample = () =>
  buildSampleData(
    { name: 'Shop', address: '', phone: '', email: '', logoUrl: null } as any,
    [],
    ((key: string) => key) as any,
    {},
    'invoice'
  )

/** The spec a layout prints, with one section's field list rewritten. */
function specWithFields(sectionId: string, fields: InvoiceFieldConfig[]) {
  const layout = mergeWithDefaults({})
  layout.sections = layout.sections.map((s) => (s.id === sectionId ? { ...s, fields } : s))
  return buildDocumentSpec(layout, themeOf({} as any, layout), sample())
}

function blockContent(spec: any, sectionId: string) {
  return spec.blocks.find((b: any) => b.content?.id === sectionId)?.content
}

/** Ids of the rows inside a block, in the order they print. */
function rowIds(node: any, skip: string): string[] {
  const ids: string[] = []
  const walk = (n: any) => {
    if (!n || typeof n !== 'object') return
    if (n.id && n.id !== skip) ids.push(n.id)
    for (const child of n.children ?? []) walk(child.node ?? child)
  }
  walk(node)
  return ids
}

/** Text of every string the block prints, in order. */
function texts(node: any): string[] {
  const out: string[] = []
  const walk = (n: any) => {
    if (!n || typeof n !== 'object') return
    if (n.kind === 'text' && n.text) out.push(n.text)
    for (const child of n.children ?? []) walk(child.node ?? child)
  }
  walk(node)
  return out
}

const on = (ids: string[]): InvoiceFieldConfig[] => ids.map((id) => ({ id, visible: true }))

describe('payment information order', () => {
  const defaults = ['bank_account', 'org_number', 'payment_terms', 'due_date']

  it('prints the rows in the order the field list is in', () => {
    const spec = specWithFields('bank_account', on(defaults))
    expect(rowIds(blockContent(spec, 'bank_account'), 'bank_account')).toEqual(
      defaults.filter((id) => id !== 'bank_account')
    )
  })

  it('follows a row dragged to the top', () => {
    const moved = ['due_date', 'bank_account', 'org_number', 'payment_terms']
    const spec = specWithFields('bank_account', on(moved))
    const ids = rowIds(blockContent(spec, 'bank_account'), 'bank_account')
    expect(ids[0]).toBe('due_date')
    expect(ids).toEqual(moved.filter((id) => id !== 'bank_account'))
  })

  it('still leaves out a row that is switched off', () => {
    const spec = specWithFields('bank_account', [
      { id: 'due_date', visible: true },
      { id: 'bank_account', visible: false },
      { id: 'org_number', visible: true },
      { id: 'payment_terms', visible: false },
    ])
    const printed = texts(blockContent(spec, 'bank_account'))
    expect(printed.join(' ')).not.toContain('Bank Account')
    expect(printed.join(' ')).not.toContain('Payment Terms')
  })
})

describe('document title strip order', () => {
  it('prints the cells in the order the field list is in', () => {
    const spec = specWithFields(
      'document_title',
      on(['title', 'due_date', 'date', 'invoice_number'])
    )
    const printed = texts(blockContent(spec, 'document_title'))
    expect(printed.indexOf('Due')).toBeLessThan(printed.indexOf('Date'))
    expect(printed.indexOf('Date')).toBeLessThan(printed.indexOf('Invoice No.'))
  })

  it('keeps the old order when nobody has dragged anything', () => {
    const spec = specWithFields(
      'document_title',
      on(['title', 'invoice_number', 'date', 'due_date'])
    )
    const printed = texts(blockContent(spec, 'document_title'))
    expect(printed.indexOf('Invoice No.')).toBeLessThan(printed.indexOf('Date'))
    expect(printed.indexOf('Date')).toBeLessThan(printed.indexOf('Due'))
  })
})

/**
 * Every section whose fields the inspector lets a workshop drag.
 *
 * One named pair per section, because a section's list is not always one run:
 * the header joins its details into a single line, the title strip draws its
 * own word above the cells, and the footer prints its note under everything.
 * The pair is named; what the pair prints is discovered, so the test does not
 * depend on the sample data's wording.
 */
describe('every section with a field list follows its order', () => {
  const sectionsWithFields = mergeWithDefaults({}).sections.filter(
    (section) => (section.fields ?? []).length > 1
  )

  /**
   * A workshop with its details filled in. The sample above deliberately
   * leaves them blank, and a header with no address, telephone or address to
   * print says nothing about the order it would print them in.
   */
  const filled = () =>
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

  const specOf = (sectionId: string, fields: InvoiceFieldConfig[]) => {
    const layout = mergeWithDefaults({})
    layout.sections = layout.sections.map((section) =>
      section.id === sectionId ? { ...section, fields } : section
    )
    return buildDocumentSpec(layout, themeOf({} as any, layout), filled())
  }

  /** Two fields of each section that share one running order. */
  const ORDERED_PAIRS: Record<string, [string, string]> = {
    header: ['company_address', 'company_phone'],
    document_title: ['invoice_number', 'date'],
    customer: ['customer_name', 'customer_company'],
    vehicle: ['vehicle_name', 'vin'],
    service: ['service_title', 'service_type'],
    bank_account: ['bank_account', 'org_number'],
    footer: ['company_name', 'company_address'],
  }

  it('has a pair named for every section that offers a list', () => {
    // A section that gains a field list has to be given a pair here, rather
    // than quietly going untested.
    expect(sectionsWithFields.map((section) => section.id).sort()).toEqual(
      Object.keys(ORDERED_PAIRS).sort()
    )
  })

  /** Everything a section prints, as one string: some sections join their rows. */
  const printedRun = (sectionId: string, order: string[]) =>
    texts(
      blockContent(
        specOf(
          sectionId,
          order.map((id) => ({ id, visible: true }))
        ),
        sectionId
      )
    ).join('\u0000')

  for (const section of sectionsWithFields) {
    it(`moves what ${section.id} prints when two of its rows swap`, () => {
      const all = (section.fields ?? []).map((field) => field.id)
      const [a, b] = ORDERED_PAIRS[section.id]

      // What each of the two prints, found by leaving the other one out: a
      // section with a single field switched on can collapse to nothing,
      // which tells us about neither.
      const without = (id: string) =>
        texts(
          blockContent(
            specOf(
              section.id,
              all.map((field) => ({ id: field, visible: field !== id }))
            ),
            section.id
          )
        )
      const withoutB = without(b)
      const withoutA = without(a)
      const aWord = withoutB.find((text) => !withoutA.includes(text)) as string
      const bWord = withoutA.find((text) => !withoutB.includes(text)) as string
      expect(aWord, `${a} prints something of its own`).toBeTruthy()
      expect(bWord, `${b} prints something of its own`).toBeTruthy()

      const rest = all.filter((id) => id !== a && id !== b)
      const asListed = printedRun(section.id, [a, b, ...rest])
      const swapped = printedRun(section.id, [b, a, ...rest])

      expect(asListed.indexOf(aWord)).toBeLessThan(asListed.indexOf(bWord))
      // Dragged past each other in the inspector, they print the other way round.
      expect(swapped.indexOf(bWord)).toBeLessThan(swapped.indexOf(aWord))
    })
  }
})
