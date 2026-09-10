/**
 * The inspector offers a drag exactly where the sheet honours one.
 *
 * Most of a section's fields print in the order the list is in, and dragging a
 * row moves it. A few do not: the company name sits above the header's
 * details and the logo in its corner, the word the document calls itself is
 * drawn over the title strip rather than among its cells, and the footer
 * prints its portal line first and its closing note last. Dragging those did
 * nothing whatever, which reads as a broken editor rather than as a slot that
 * is fixed on purpose, so the inspector no longer offers it.
 *
 * Which fields those are is worked out here rather than trusted: every field
 * of every section is printed first and then last, and one that lands in the
 * same place either way is a fixed slot. `FIXED_SLOT_FIELDS` has to name
 * exactly that set — if the sheet changes its mind about a field, this fails
 * and the inspector gets corrected with it.
 */
import { describe, expect, it } from 'vitest'
import { themeOf } from '@/features/invoice-designer/Components/designTheme'
import { buildSampleData } from '@/features/invoice-designer/Components/sample'
import { buildDocumentSpec } from '@/features/invoice-designer/Spec/buildSpec'
import {
  FIXED_SLOT_FIELDS,
  fieldHasFixedSlot,
  mergeWithDefaults,
} from '@/features/settings/Schema/invoiceLayoutSchema'

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * A workshop with every detail filled in. A field with nothing behind it
 * prints nothing, and a field that prints nothing cannot be seen to move —
 * it would be mistaken for a fixed slot.
 */
const sample = () =>
  buildSampleData(
    {
      name: 'Shop',
      address: 'A road',
      phone: '555',
      email: 'shop@example.com',
      slogan: 'Slogan',
      orgNumber: '123 456 789',
      paymentTerms: 'Net 14',
      logoUrl: '/logo.png',
    } as any,
    [],
    ((key: string) => key) as any,
    {},
    'invoice'
  )

function printedWith(sectionId: string, order: string[]): string {
  const layout = mergeWithDefaults({})
  layout.sections = layout.sections.map((section) =>
    section.id === sectionId
      ? { ...section, fields: order.map((id) => ({ id, visible: true })) }
      : section
  )
  const spec = buildDocumentSpec(layout, themeOf({} as any, layout), sample()) as any
  const content = spec.blocks.find((block: any) => block.content?.id === sectionId)?.content

  // Images count too: a logo prints no words and still has a place.
  const out: string[] = []
  const walk = (node: any) => {
    if (!node || typeof node !== 'object') return
    if (node.kind === 'text' && node.text) out.push(String(node.text))
    if (node.kind === 'image') out.push('[image]')
    for (const child of node.children ?? []) walk(child.node ?? child)
  }
  walk(content)
  return out.join(' | ')
}

/** Fields whose position the sheet ignores, found by moving each one. */
function fixedSlotsOf(sectionId: string, fields: string[]): string[] {
  return fields.filter((field) => {
    const rest = fields.filter((id) => id !== field)
    return printedWith(sectionId, [field, ...rest]) === printedWith(sectionId, [...rest, field])
  })
}

const sectionsWithFields = mergeWithDefaults({}).sections.filter(
  (section) => (section.fields ?? []).length > 1
)

describe('fields that print in a place of their own', () => {
  it.each(
    sectionsWithFields.map((section) => section.id)
  )('%s names exactly the fields that ignore their position', (sectionId) => {
    const section = sectionsWithFields.find((candidate) => candidate.id === sectionId)
    const fields = (section?.fields ?? []).map((field) => field.id)
    expect(fixedSlotsOf(sectionId, fields).sort()).toEqual(
      [...(FIXED_SLOT_FIELDS[sectionId] ?? [])].sort()
    )
  })

  it('is the six the sheet actually has', () => {
    // Named, so that gaining or losing one is a decision rather than a drift.
    expect(FIXED_SLOT_FIELDS).toEqual({
      header: ['logo', 'company_name'],
      document_title: ['title'],
      footer: ['footer_note', 'portal_link', 'logo'],
    })
  })

  it('answers for one field at a time', () => {
    expect(fieldHasFixedSlot('footer', 'footer_note')).toBe(true)
    expect(fieldHasFixedSlot('footer', 'company_name')).toBe(false)
    // The same field can be fixed in one section and free in another: the
    // header's name is drawn above its details, the footer's is one of a run.
    expect(fieldHasFixedSlot('header', 'company_name')).toBe(true)
    expect(fieldHasFixedSlot('customer', 'customer_name')).toBe(false)
    expect(fieldHasFixedSlot('vehicle', 'anything_at_all')).toBe(false)
  })
})
