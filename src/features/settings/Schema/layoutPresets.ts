import {
  type InvoiceLayoutConfig,
  BUILTIN_FOOTER_FIELDS,
  BUILTIN_HEADER_FIELDS,
  BUILTIN_SECTIONS,
  getDefaultInvoiceLayout,
} from './invoiceLayoutSchema'

/**
 * A starting arrangement for the layout editor.
 *
 * Deliberately separate from the template presets on the Templates page: those
 * choose colors, fonts and a header style, and only carry an arrangement as a
 * consequence. These choose nothing but where things sit, so a workshop can
 * rearrange its invoice without also restyling it.
 */
export interface LayoutPreset {
  id: string
  /** Sections in print order. Anything left out is hidden. */
  order: string[]
  /** Which half of a two-column row a section sits in. */
  columns?: Record<string, 'left' | 'right'>
  /** Sections printed without their panel. */
  plain?: string[]
  /** Visible header fields. Omitted leaves whatever the layout already has. */
  headerFields?: string[]
  /** Visible footer fields. Omitted leaves whatever the layout already has. */
  footerFields?: string[]
}

// Derived, not written out: a field added to either list is then carried by
// the presets that show everything, rather than quietly missing from them.
const ALL_HEADER_FIELDS = BUILTIN_HEADER_FIELDS.map((f) => f.id as string)
const ALL_FOOTER_FIELDS = BUILTIN_FOOTER_FIELDS.map((f) => f.id as string)

export const layoutPresets: LayoutPreset[] = [
  {
    // What every invoice has printed as until now.
    id: 'classic',
    order: [
      'header',
      'customer',
      'vehicle',
      'service',
      'parts_table',
      'labor_table',
      'findings',
      'totals',
      'notes',
      'warranty',
      'bank_account',
      'footer',
    ],
    columns: { customer: 'left', vehicle: 'left', service: 'right' },
    headerFields: ALL_HEADER_FIELDS,
    footerFields: ['footer_note'],
  },
  {
    // Printed stationery: the shop at the top, the ways to reach it along the
    // bottom, and the title down below the addresses where a letter puts it.
    id: 'letterhead',
    order: [
      'header',
      'customer',
      'vehicle',
      'service',
      'document_title',
      'items_table',
      'findings',
      'totals',
      'notes',
      'warranty',
      'bank_account',
      'footer',
    ],
    columns: { customer: 'left', vehicle: 'right', service: 'right' },
    headerFields: ['logo', 'company_name', 'company_slogan'],
    footerFields: [
      'company_name',
      'company_address',
      'company_phone',
      'company_email',
      'bank_account',
      'company_org_number',
    ],
  },
  {
    // Everything on one page: no panels, one list, nothing optional.
    id: 'compact',
    order: ['header', 'customer', 'vehicle', 'service', 'items_table', 'totals', 'notes', 'footer'],
    columns: { customer: 'left', vehicle: 'right', service: 'right' },
    plain: ['customer', 'vehicle', 'service'],
    headerFields: ALL_HEADER_FIELDS,
    footerFields: ['footer_note'],
  },
  {
    // The long version: title up top, the vehicle standing on its own, both
    // tables kept apart, and every optional block shown.
    id: 'detailed',
    order: [
      'header',
      'document_title',
      'customer',
      'service',
      'vehicle',
      'parts_table',
      'labor_table',
      'findings',
      'totals',
      'notes',
      'warranty',
      'bank_account',
      'footer',
    ],
    columns: { customer: 'left', service: 'left', vehicle: 'right' },
    headerFields: ALL_HEADER_FIELDS,
    footerFields: ALL_FOOTER_FIELDS,
  },
]

/**
 * Build a full layout from a preset. Sections the preset does not mention are
 * kept but hidden, so nothing a workshop had configured is thrown away by
 * trying a preset on and picking another.
 */
export function buildLayoutFromPreset(preset: LayoutPreset): InvoiceLayoutConfig {
  const rank = new Map(preset.order.map((id, index) => [id, index]))
  const plain = new Set(preset.plain ?? [])
  const defaults = getDefaultInvoiceLayout()

  const sections = BUILTIN_SECTIONS.map((builtin, index) => {
    const base = defaults.sections.find((s) => s.id === builtin.id)
    const position = rank.get(builtin.id)
    // Only these two sections take a field list from a preset. Every other
    // section keeps the fields it already had: filtering them against the
    // footer's list, as this line once did, hid the customer, the vehicle and
    // the service block entirely.
    const fieldsFor =
      builtin.id === 'header'
        ? preset.headerFields
        : builtin.id === 'footer'
          ? preset.footerFields
          : undefined

    return {
      ...base,
      id: builtin.id,
      visible: position !== undefined,
      // Hidden sections sort after every visible one, in their built-in order.
      order: position ?? preset.order.length + index,
      column: preset.columns?.[builtin.id],
      boxed: plain.has(builtin.id) ? false : undefined,
      fields: fieldsFor
        ? base?.fields?.map((f) => ({ ...f, visible: fieldsFor.includes(f.id) }))
        : base?.fields,
    }
  })

  return { sections }
}
