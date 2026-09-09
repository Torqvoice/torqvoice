/**
 * The designer's field list is a running order, not just a set of switches.
 * Two blocks used to read it as a set and print their rows in the order they
 * happened to build them, so dragging a row in the inspector moved nothing on
 * the sheet.
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
