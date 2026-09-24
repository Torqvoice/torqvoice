import {
  type InvoiceDocumentStyle,
  type InvoiceLayoutConfig,
  type InvoiceSectionStyle,
  type LayoutDocumentType,
  BUILTIN_FOOTER_FIELDS,
  BUILTIN_HEADER_FIELDS,
  getDefaultLayout,
  sectionsFor,
} from './invoiceLayoutSchema'

/**
 * A starting arrangement for the layout editor.
 *
 * Deliberately separate from the template presets on the Templates page: those
 * choose colors, fonts and a header style, and only carry an arrangement as a
 * consequence. These choose nothing but where things sit, so a workshop can
 * rearrange its invoice without also restyling it.
 */
/** The look a template carries, alongside the arrangement. */
export interface PresetTemplate {
  primaryColor: string
  headerStyle: string
  fontFamily: string
  frameSide?: 'left' | 'right'
  backgroundColor?: string
  textColor?: string
}

export interface LayoutPreset {
  id: string
  /** The document this arranges. Absent means an invoice or a quote. */
  documentType?: LayoutDocumentType
  /**
   * Colors, header style and typeface.
   *
   * A template that only rearranged sections looked identical to every other
   * one, because the things a person actually sees — the band, the rail, the
   * color — were saved somewhere else and never touched.
   */
  template: PresetTemplate
  /** Whole-sheet appearance this template sets. */
  document?: InvoiceDocumentStyle
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
  /** Visible fields of any other section, by section id; the rest switch off. */
  fields?: Record<string, string[]>
  /** Appearance a section starts with: alignment, width, padding, colours. */
  styles?: Record<string, InvoiceSectionStyle>
  /** Sections whose own heading is left off. */
  unheaded?: string[]
}

// Derived, not written out: a field added to either list is then carried by
// the presets that show everything, rather than quietly missing from them.
const ALL_HEADER_FIELDS = BUILTIN_HEADER_FIELDS.map((f) => f.id as string)
const ALL_FOOTER_FIELDS = BUILTIN_FOOTER_FIELDS.map((f) => f.id as string)

export const layoutPresets: LayoutPreset[] = [
  {
    // What every invoice has printed as until now.
    id: 'classic',
    template: { primaryColor: '#d97706', headerStyle: 'standard', fontFamily: 'Helvetica' },
    order: [
      'header',
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
    ],
    columns: { customer: 'left', vehicle: 'left', service: 'right' },
    headerFields: ALL_HEADER_FIELDS,
    footerFields: ['footer_note'],
  },
  {
    // Printed stationery: the shop at the top, the ways to reach it along the
    // bottom, and the title down below the addresses where a letter puts it.
    id: 'letterhead',
    template: {
      primaryColor: '#ee7623',
      headerStyle: 'framed',
      frameSide: 'left',
      fontFamily: 'Helvetica',
    },
    order: [
      'header',
      'slogan',
      'customer',
      'vehicle',
      'service',
      'document_title',
      'parts_table',
      'labor_table',
      'findings',
      'totals',
      'notes',
      'attached_documents',
      'warranty',
      'bank_account',
      'footer',
    ],
    columns: { customer: 'left', vehicle: 'right', service: 'right' },
    headerFields: ['logo', 'company_name'],
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
    template: { primaryColor: '#475569', headerStyle: 'compact', fontFamily: 'Helvetica' },
    document: { fontSize: 9, rowPadding: 2, margin: 30, stripes: false },
    order: [
      'header',
      'slogan',
      'customer',
      'vehicle',
      'service',
      'parts_table',
      'labor_table',
      'totals',
      'notes',
      'attached_documents',
      'footer',
    ],
    columns: { customer: 'left', vehicle: 'right', service: 'right' },
    // Every panel prints bare, including the ones switched on later: compact
    // means no boxes anywhere.
    plain: [
      'customer',
      'vehicle',
      'service',
      'general',
      'notes',
      'attached_documents',
      'warranty',
      'telegram_qr',
    ],
    headerFields: ALL_HEADER_FIELDS,
    footerFields: ['footer_note'],
  },
  {
    // Type, rules and whitespace only: no panels, no bands, no banding. The
    // stripped sheet, at reading size rather than compact's density.
    id: 'minimal',
    template: { primaryColor: '#111827', headerStyle: 'compact', fontFamily: 'Helvetica' },
    document: { stripes: false, margin: 48 },
    order: [
      'header',
      'slogan',
      'customer',
      'vehicle',
      'service',
      'parts_table',
      'labor_table',
      'totals',
      'notes',
      'attached_documents',
      'warranty',
      'footer',
    ],
    columns: { customer: 'left', vehicle: 'right', service: 'right' },
    plain: [
      'customer',
      'vehicle',
      'service',
      'general',
      'notes',
      'attached_documents',
      'warranty',
      'telegram_qr',
    ],
    headerFields: ALL_HEADER_FIELDS,
    footerFields: ['footer_note'],
  },
  {
    // One numbered list instead of a parts table above a labor table, for a
    // workshop that quotes and bills a job as a sequence of positions.
    id: 'itemized',
    template: {
      primaryColor: '#ea580c',
      headerStyle: 'modern',
      fontFamily: 'Helvetica',
    },
    order: [
      'header',
      'slogan',
      'customer',
      'vehicle',
      'service',
      'items_table',
      'findings',
      'totals',
      'notes',
      'attached_documents',
      'warranty',
      'bank_account',
      'footer',
    ],
    columns: { customer: 'left', vehicle: 'right', service: 'right' },
    headerFields: ALL_HEADER_FIELDS,
    footerFields: ALL_FOOTER_FIELDS,
  },
  {
    // The long version: title up top, the vehicle standing on its own, both
    // tables kept apart, and every optional block shown.
    id: 'detailed',
    template: {
      primaryColor: '#2563eb',
      headerStyle: 'modern',
      fontFamily: 'Times-Roman',
    },
    document: { accentColor: '#1e3a8a' },
    order: [
      'header',
      'slogan',
      'document_title',
      'customer',
      'service',
      'vehicle',
      'parts_table',
      'labor_table',
      'findings',
      'totals',
      'notes',
      'attached_documents',
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
 * Starting points for a certificate: the sheet a completed inspection prints.
 * Apart from the letterhead and the footer, nothing here is shared with an
 * invoice, so these are kept out of `layoutPresets`, which the invoice tests
 * walk for invoice invariants.
 */
export const certificatePresets: LayoutPreset[] = [
  {
    // The everyday certificate: the verdict under the title, the car and the
    // test beside each other, what was wrong with a note and a photo, and
    // the failed checks by section after it.
    id: 'certificate-standard',
    documentType: 'certificate',
    template: { primaryColor: '#d97706', headerStyle: 'standard', fontFamily: 'Helvetica' },
    order: [
      'header',
      'document_title',
      'result',
      'customer',
      'vehicle',
      'test_details',
      'defects',
      'results_table',
      'inspection_photos',
      'notes',
      'attached_documents',
      'signature',
      'footer',
    ],
    columns: { customer: 'left', vehicle: 'left', test_details: 'right' },
    headerFields: ALL_HEADER_FIELDS,
    footerFields: ['footer_note', 'portal_link'],
  },
  {
    // A regulator's form: no band, no panels, a serif, the verdict as a plain
    // line, every check with its grade and note section by section, no
    // photographs on the defects, and a line for the inspector to sign.
    id: 'certificate-regulator',
    documentType: 'certificate',
    template: {
      primaryColor: '#111827',
      headerStyle: 'compact',
      fontFamily: 'Times-Roman',
      textColor: '#111827',
    },
    document: { accentColor: '#111827', stripes: false, rowPadding: 3, fontSize: 9 },
    order: [
      'header',
      'document_title',
      'customer',
      'vehicle',
      'test_details',
      'result',
      'results_table',
      'defects',
      'inspection_photos',
      'notes',
      'signature',
      'attached_documents',
      'footer',
    ],
    columns: { customer: 'left', vehicle: 'left', test_details: 'right' },
    plain: ['customer', 'vehicle', 'test_details', 'result', 'notes', 'attached_documents'],
    fields: {
      defects: ['defect_notes'],
      results_table: ['passed_checks', 'not_applicable_checks', 'check_notes', 'combined_table'],
      result: ['result_detail'],
    },
    styles: {
      result: { borderWidth: 0, padding: 0 },
      results_table: { borderWidth: 0.5, outerBorder: true },
    },
    headerFields: ALL_HEADER_FIELDS,
    footerFields: ALL_FOOTER_FIELDS,
  },
  {
    // For the customer: a banded sheet with the verdict centred and large,
    // every defect with its photograph, the walk-round photographs, and one
    // short table of the checks that were not OK.
    id: 'certificate-customer',
    documentType: 'certificate',
    template: { primaryColor: '#2563eb', headerStyle: 'modern', fontFamily: 'Open Sans' },
    document: { accentColor: '#1e3a8a', margin: 36 },
    order: [
      'header',
      'result',
      'document_title',
      'customer',
      'vehicle',
      'test_details',
      'defects',
      'inspection_photos',
      'results_table',
      'notes',
      'attached_documents',
      'signature',
      'footer',
    ],
    columns: { customer: 'left', vehicle: 'right', test_details: 'right' },
    fields: { results_table: ['combined_table'] },
    styles: { result: { align: 'center', padding: 16, fontSize: 11 } },
    headerFields: ALL_HEADER_FIELDS,
    footerFields: ['footer_note', 'portal_link'],
  },
  {
    // A fleet's sheet: as much as fits on one page. Small type, the verdict
    // hung narrow on the right of the title strip, the full results without
    // a notes column, nothing else.
    id: 'certificate-compact',
    documentType: 'certificate',
    template: { primaryColor: '#334155', headerStyle: 'compact', fontFamily: 'Helvetica' },
    document: { accentColor: '#334155', fontSize: 8, rowPadding: 2, margin: 28 },
    order: [
      'header',
      'document_title',
      'result',
      'vehicle',
      'test_details',
      'results_table',
      'inspection_photos',
      'signature',
      'footer',
    ],
    columns: { vehicle: 'left', test_details: 'right', result: 'right' },
    plain: ['vehicle', 'test_details'],
    fields: {
      result: [],
      results_table: ['passed_checks', 'not_applicable_checks', 'combined_table'],
      test_details: ['test_date', 'inspector', 'certificate_number', 'odometer', 'next_test_due'],
    },
    styles: { result: { padding: 6 } },
    unheaded: ['results_table'],
    headerFields: ['logo', 'company_name', 'company_address', 'company_phone'],
    footerFields: ['footer_note'],
  },
]

/** The starting points for one document. */
export function presetsFor(documentType: LayoutDocumentType): LayoutPreset[] {
  return documentType === 'certificate' ? certificatePresets : layoutPresets
}

/**
 * Build a full layout from a preset. Sections the preset does not mention are
 * kept but hidden, so nothing a workshop had configured is thrown away by
 * trying a preset on and picking another.
 */
export function buildLayoutFromPreset(preset: LayoutPreset): InvoiceLayoutConfig {
  const rank = new Map(preset.order.map((id, index) => [id, index]))
  const plain = new Set(preset.plain ?? [])
  const unheaded = new Set(preset.unheaded ?? [])
  const documentType = preset.documentType ?? 'invoice'
  const defaults = getDefaultLayout(documentType)

  const sections = sectionsFor(documentType).map((builtin, index) => {
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
          : preset.fields?.[builtin.id]
    const style = preset.styles?.[builtin.id]

    return {
      ...base,
      id: builtin.id,
      visible: position !== undefined,
      // Hidden sections sort after every visible one, in their built-in order.
      order: position ?? preset.order.length + index,
      column: preset.columns?.[builtin.id],
      boxed: plain.has(builtin.id) ? false : undefined,
      ...(unheaded.has(builtin.id) ? { heading: false } : {}),
      ...(style ? { style } : {}),
      fields: fieldsFor
        ? base?.fields?.map((f) => ({ ...f, visible: fieldsFor.includes(f.id) }))
        : base?.fields,
    }
  })

  return {
    sections,
    ...(preset.document ? { document: preset.document } : {}),
    ...(documentType === 'certificate' ? { documentType } : {}),
  }
}
