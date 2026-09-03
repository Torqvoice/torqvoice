import { z } from 'zod'

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

export const invoiceFieldConfigSchema = z.object({
  id: z.string(),
  visible: z.boolean(),
  /**
   * An explicit weight for this line. Unset keeps the section's automatic
   * emphasis (the first line of a panel, a footer column's lead); the moment
   * any field in a section carries a choice, only the choices apply.
   */
  bold: z.boolean().optional(),
})

/**
 * How one section looks. Five keys that mean the same thing wherever they are
 * applied, so one control in the editor styles a detail panel, a table or the
 * totals without knowing which it is.
 *
 * This is where new appearance options belong. A setting per option meant a
 * code change, plumbing through every PDF builder and twelve translations for
 * each one; here a workshop sets it and nothing has to be written at all.
 */
export const invoiceSectionStyleSchema = z.object({
  /** Body text: values, table cells, notes. */
  textColor: z.string().optional(),
  /** The section's own heading, and a table's column headings. */
  labelColor: z.string().optional(),
  /** Panel fill, or the bar behind a table's column headings. */
  backgroundColor: z.string().optional(),
  /** Panel border, and the rule between table rows. */
  borderColor: z.string().optional(),
  /** Thickness of the panel border and of table row rules, in points. */
  borderWidth: z.number().min(0).max(4).optional(),
  /** Draw a border around the whole table, not only rules between rows. */
  outerBorder: z.boolean().optional(),
  /** Banding behind alternate rows for this table. Unset follows the sheet. */
  stripes: z.boolean().optional(),
  /** Body text size in points. Headings scale with it. */
  fontSize: z.number().min(5).max(24).optional(),
  /** Typeface for this section, from the families the app embeds. */
  fontFamily: z.string().optional(),
  /** Preferred width in points for a block that hangs to one side of the
   *  sheet, like the totals box. Ignored in a column, which sets the width. */
  width: z.number().min(140).max(515).optional(),
  /** Where the section sets its mark and lines. Unset follows the header
   *  style: compact leans left, standard right, modern centers. */
  align: z.enum(['left', 'center', 'right']).optional(),
  /** Where a logo sits when the section prints one, on its own rather than
   *  with the section's text: a footer mark can sit hard left under a margin
   *  while the closing line stays centered. Unset centers it. */
  logoAlign: z.enum(['left', 'center', 'right']).optional(),
  /** Room inside the section's panel, in points. Unset keeps each panel's
   *  own default, box or no box. */
  padding: z.number().min(0).max(40).optional(),
  /** Extra room around the section in the flow, in points per edge. */
  marginTop: z.number().min(0).max(120).optional(),
  marginBottom: z.number().min(0).max(120).optional(),
  marginLeft: z.number().min(0).max(200).optional(),
  marginRight: z.number().min(0).max(200).optional(),
})

export const invoiceSectionSchema = z.object({
  id: z.string(),
  visible: z.boolean(),
  order: z.number().int(),
  /** When set, the section renders in a 2-column row alongside other column sections. */
  column: z.enum(['left', 'right']).optional(),
  /**
   * Whether the section prints inside a panel. Unset means boxed, which is what
   * every layout did before the choice existed.
   */
  boxed: z.boolean().optional(),
  /**
   * A named preset look for sections that offer several, the way the payment
   * panel can print as an accent card, a plain panel, an outline or bare
   * lines. Unset means the section's default.
   */
  variant: z.string().optional(),
  /**
   * Whether the section prints its own small heading, like BILL TO over the
   * customer card. Unset means shown, which every layout has always done.
   */
  heading: z.boolean().optional(),
  /** Appearance overrides for this section. Unset uses the document's own. */
  style: invoiceSectionStyleSchema.optional(),
  /** Controls which fields are shown within this section. */
  fields: z.array(invoiceFieldConfigSchema).optional(),
})

/**
 * Appearance that belongs to the whole sheet rather than to one section.
 *
 * Lives in the layout alongside the sections for the same reason their styles
 * do: a workshop sets it, and no setting key, no plumbing through every PDF
 * builder and no translations have to be written for each new option.
 */
export const invoiceDocumentStyleSchema = z.object({
  /** Base text size in points. Everything else scales from it. */
  fontSize: z.number().min(6).max(14).optional(),
  /** Vertical padding in a table row, in points. Lower is denser. */
  rowPadding: z.number().min(0).max(12).optional(),
  /** Page margin in points. The framed sheet keeps its own top and left. */
  margin: z.number().min(12).max(72).optional(),
  /** Banding behind alternate table rows. False prints them all the same. */
  stripes: z.boolean().optional(),
  /** The band's color when stripes are on. */
  stripeColor: z.string().optional(),
  /** Section headings and the rule above the total. Defaults to the primary. */
  accentColor: z.string().optional(),
  /** Typeface for the whole sheet, from the families the app embeds. */
  fontFamily: z.string().optional(),
})

/**
 * Where something sits once it has been dragged out of the flow.
 *
 * Keyed by node id, which is a section id for a whole block and an element id
 * for one piece of it, so a logo and a customer panel are positioned by exactly
 * the same mechanism. Coordinates are points from the top-left of the sheet.
 */
export const anchorSchema = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number().optional(),
  page: z.number().int().min(1).optional(),
})

export const invoiceLayoutConfigSchema = z.object({
  sections: z.array(invoiceSectionSchema),
  /** Whole-sheet appearance. Unset leaves every default in place. */
  document: invoiceDocumentStyleSchema.optional(),
  /** Anything positioned by hand, keyed by node id. */
  anchors: z.record(z.string(), anchorSchema).optional(),
  /**
   * Which era saved this layout. Absent means the layout predates the
   * full-screen designer (or was never saved at all), and the print keeps the
   * classic look those organizations have always mailed out.
   */
  version: z.number().int().optional(),
})

/** Stamped on every layout the designer saves. */
export const DESIGNER_LAYOUT_VERSION = 3

/**
 * The stamp that means "saved from the full-screen designer". It is not the
 * version the designer writes: that one moves whenever a layout needs reading
 * differently, and moving this with it would drop every organization back to
 * the classic sheet.
 */
const DESIGNER_ERA_VERSION = 2

/**
 * The first version whose Document Title switch is obeyed. Below it, a hidden
 * title strip was drawn anyway, under the header, so hiding it there was never
 * a choice to keep.
 */
const HONEST_TITLE_SWITCH_VERSION = 3

/**
 * Whether this layout was saved from the full-screen designer. Anything else,
 * including no saved layout at all, keeps the classic pre-designer rendering
 * so a deploy never restyles an organization's documents behind its back.
 */
export function isDesignerLayout(config?: Partial<InvoiceLayoutConfig> | null): boolean {
  return (config?.version ?? 1) >= DESIGNER_ERA_VERSION
}

// ---------------------------------------------------------------------------
// TypeScript types (derived from Zod)
// ---------------------------------------------------------------------------

export type InvoiceSectionStyle = z.infer<typeof invoiceSectionStyleSchema>
export type InvoiceDocumentStyle = z.infer<typeof invoiceDocumentStyleSchema>
export type InvoiceAnchor = z.infer<typeof anchorSchema>
export type InvoiceFieldConfig = z.infer<typeof invoiceFieldConfigSchema>
export type InvoiceSection = z.infer<typeof invoiceSectionSchema>
export type InvoiceLayoutConfig = z.infer<typeof invoiceLayoutConfigSchema>

// ---------------------------------------------------------------------------
// Custom field ID helpers
// ---------------------------------------------------------------------------

export const CUSTOM_FIELD_PREFIX = 'cf_'

export function isCustomFieldId(id: string): boolean {
  return id.startsWith(CUSTOM_FIELD_PREFIX)
}

export function toCustomFieldId(definitionId: string): string {
  return `${CUSTOM_FIELD_PREFIX}${definitionId}`
}

export function fromCustomFieldId(cfId: string): string {
  return cfId.slice(CUSTOM_FIELD_PREFIX.length)
}

// ---------------------------------------------------------------------------
// Constants – built-in section & field definitions
// ---------------------------------------------------------------------------

export const BUILTIN_SECTIONS = [
  { id: 'header', name: 'Header' },
  // Directly under the header, which is where the strip carrying the number
  // and the date has always been drawn.
  { id: 'document_title', name: 'Document Title' },
  // Its own section, not a line inside the header, so it can be placed,
  // paired and styled like anything else on the sheet.
  { id: 'slogan', name: 'Slogan' },
  { id: 'customer', name: 'Customer' },
  { id: 'vehicle', name: 'Vehicle' },
  { id: 'service', name: 'Service' },
  { id: 'items_table', name: 'Items Table' },
  { id: 'parts_table', name: 'Parts Table' },
  { id: 'labor_table', name: 'Labor Table' },
  { id: 'findings', name: 'Findings' },
  { id: 'totals', name: 'Totals' },
  { id: 'notes', name: 'Notes' },
  // Its own section rather than a tail on the notes, so the list of what
  // rides along with the document can be placed and styled like anything else.
  { id: 'attached_documents', name: 'Attached Documents' },
  { id: 'warranty', name: 'Warranty' },
  { id: 'bank_account', name: 'Bank Account' },
  { id: 'footer', name: 'Footer' },
  { id: 'telegram_qr', name: 'Telegram QR' },
  { id: 'general', name: 'General' },
] as const

export const BUILTIN_CUSTOMER_FIELDS = [
  { id: 'customer_name', name: 'Customer Name' },
  { id: 'customer_company', name: 'Customer Company' },
  { id: 'customer_address', name: 'Customer Address' },
  { id: 'customer_email', name: 'Customer Email' },
  { id: 'customer_phone', name: 'Customer Phone' },
  { id: 'customer_tax_id', name: 'Customer Tax ID' },
] as const

export const BUILTIN_VEHICLE_FIELDS = [
  { id: 'vehicle_name', name: 'Vehicle' },
  { id: 'vin', name: 'VIN' },
  { id: 'license_plate', name: 'License Plate' },
  { id: 'mileage', name: 'Mileage' },
] as const

export const BUILTIN_SERVICE_FIELDS = [
  { id: 'service_title', name: 'Service Title' },
  { id: 'service_type', name: 'Service Type' },
  { id: 'tech_name', name: 'Technician' },
] as const

/** @deprecated Use BUILTIN_CUSTOMER_FIELDS, BUILTIN_VEHICLE_FIELDS, BUILTIN_SERVICE_FIELDS */
export const BUILTIN_INFO_FIELDS = [
  ...BUILTIN_CUSTOMER_FIELDS,
  ...BUILTIN_VEHICLE_FIELDS,
  ...BUILTIN_SERVICE_FIELDS,
] as const

export const BUILTIN_HEADER_FIELDS = [
  { id: 'logo', name: 'Logo' },
  { id: 'company_name', name: 'Company Name' },
  { id: 'company_address', name: 'Address' },
  { id: 'company_phone', name: 'Phone' },
  { id: 'company_email', name: 'Email' },
  { id: 'company_org_number', name: 'Organization Number' },
] as const

/**
 * Company details a workshop can move down to the footer, the way printed
 * stationery carries them: the shop up top, the ways to reach it along the
 * bottom. All off by default, so a footer stays the one line it has always
 * been until somebody asks for more.
 */
export const BUILTIN_FOOTER_FIELDS = [
  { id: 'footer_note', name: 'Footer Note' },
  // The customer's link to their portal. On by default because the sheet has
  // always printed it when a portal link exists; now the footer can decline.
  { id: 'portal_link', name: 'Portal Link' },
  // Off unless asked for, the way the rest of the footer details are: a shop
  // that wants its mark at the foot of the page as well as the top can say so.
  { id: 'logo', name: 'Logo' },
  { id: 'company_name', name: 'Company Name' },
  { id: 'company_address', name: 'Address' },
  { id: 'company_phone', name: 'Phone' },
  { id: 'company_email', name: 'Email' },
  { id: 'bank_account', name: 'Bank Account' },
  { id: 'company_org_number', name: 'Organization Number' },
] as const

/**
 * The title strip: the big word, and the cells beside it. Each is a switch,
 * because what a document must name differs by trade and by country, and the
 * strip is where a sheet says its number and its dates.
 */
export const BUILTIN_DOCUMENT_TITLE_FIELDS = [
  { id: 'title', name: 'Title' },
  { id: 'invoice_number', name: 'Number' },
  { id: 'customer_number', name: 'Customer Number' },
  { id: 'date', name: 'Date' },
  { id: 'due_date', name: 'Due Date' },
] as const

export const BUILTIN_BANK_ACCOUNT_FIELDS = [
  { id: 'bank_account', name: 'Bank Account' },
  { id: 'org_number', name: 'Organization Number' },
  { id: 'payment_terms', name: 'Payment Terms' },
  { id: 'due_date', name: 'Due Date' },
] as const

/**
 * Fields that printed before they had a switch, by section.
 *
 * A field added to a section is off in every layout saved before it existed,
 * which is right for a line that never printed and wrong for one that always
 * did: switches arrived for the payment panel's terms and due date long after
 * the rows themselves, and defaulting them off would have quietly stripped
 * them from every existing design. A layout that does not mention them shows
 * them; switching one off is a choice somebody made, and is stored.
 */
export const GRANDFATHERED_FIELDS: Record<string, readonly string[]> = {
  bank_account: ['payment_terms', 'due_date'],
  document_title: ['title', 'invoice_number', 'customer_number', 'date', 'due_date'],
}

/** The ids of `sectionId`'s grandfathered fields that `fields` never mentions. */
export function unmentionedGrandfathered(
  sectionId: string,
  fields: ReadonlyArray<{ id: string }> | undefined
): string[] {
  const ids = GRANDFATHERED_FIELDS[sectionId]
  if (!ids || !fields) return []
  return ids.filter((id) => !fields.some((f) => f.id === id))
}

/** The footer's rows that are not detail lines: the mark, the portal link and the closing note. */
export const FOOTER_SPECIAL_FIELD_IDS: Set<string> = new Set(['logo', 'portal_link', 'footer_note'])

/**
 * The footer's detail lines flowed top-to-bottom into up to three columns, in
 * the order given, so the stored field order is the order the sheet shows.
 * The generator and the designer's field list both read this, so the drag
 * order and the print agree on which line heads which column.
 */
export function footerColumnsOf<T>(entries: T[]): T[][] {
  const colCount = Math.min(3, entries.length)
  if (!colCount) return []
  const rows = Math.ceil(entries.length / colCount)
  return Array.from({ length: colCount }, (_, c) => entries.slice(c * rows, (c + 1) * rows)).filter(
    (column) => column.length > 0
  )
}

export type BuiltinSectionId = (typeof BUILTIN_SECTIONS)[number]['id']
export type BuiltinInfoFieldId = (typeof BUILTIN_INFO_FIELDS)[number]['id']
export type BuiltinCustomerFieldId = (typeof BUILTIN_CUSTOMER_FIELDS)[number]['id']
export type BuiltinVehicleFieldId = (typeof BUILTIN_VEHICLE_FIELDS)[number]['id']
export type BuiltinServiceFieldId = (typeof BUILTIN_SERVICE_FIELDS)[number]['id']
export type BuiltinHeaderFieldId = (typeof BUILTIN_HEADER_FIELDS)[number]['id']
export type BuiltinBankAccountFieldId = (typeof BUILTIN_BANK_ACCOUNT_FIELDS)[number]['id']
export type BuiltinDocumentTitleFieldId = (typeof BUILTIN_DOCUMENT_TITLE_FIELDS)[number]['id']
export type BuiltinFooterFieldId = (typeof BUILTIN_FOOTER_FIELDS)[number]['id']

/** Sections that have configurable fields */
export const SECTIONS_WITH_FIELDS = new Set<string>([
  'header',
  'document_title',
  'footer',
  'customer',
  'vehicle',
  'service',
  'bank_account',
  'general',
])

/** Sections that print inside a panel and can have it taken away. */
export const BOXED_ELIGIBLE_SECTIONS = new Set<string>([
  'customer',
  'vehicle',
  'service',
  'general',
  'notes',
  'attached_documents',
  'warranty',
  'telegram_qr',
])

/** Sections that can be placed in left/right columns */
export const COLUMN_ELIGIBLE_SECTIONS = new Set<string>([
  'slogan',
  'totals',
  'customer',
  'vehicle',
  'service',
  'general',
  'notes',
  'attached_documents',
  'bank_account',
])

/** Sections that MUST be full-width (cannot be in columns) */
export const FULL_WIDTH_ONLY_SECTIONS = new Set<string>([
  'header',
  'document_title',
  'items_table',
  'parts_table',
  'labor_table',
  'footer',
  'telegram_qr',
])

/** Default column assignment for column-eligible sections */
const DEFAULT_COLUMN: Record<string, 'left' | 'right'> = {
  customer: 'left',
  vehicle: 'left',
  service: 'right',
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

function getDefaultFieldsForSection(sectionId: string): InvoiceFieldConfig[] | undefined {
  switch (sectionId) {
    case 'customer':
      return BUILTIN_CUSTOMER_FIELDS.map((f) => ({ id: f.id, visible: true }))
    case 'vehicle':
      return BUILTIN_VEHICLE_FIELDS.map((f) => ({ id: f.id, visible: true }))
    case 'service':
      return BUILTIN_SERVICE_FIELDS.map((f) => ({ id: f.id, visible: true }))
    case 'header':
      return BUILTIN_HEADER_FIELDS.map((f) => ({ id: f.id, visible: true }))
    case 'bank_account':
      return BUILTIN_BANK_ACCOUNT_FIELDS.map((f) => ({ id: f.id, visible: true }))
    case 'document_title':
      return BUILTIN_DOCUMENT_TITLE_FIELDS.map((f) => ({ id: f.id, visible: true }))
    case 'footer':
      // Only the note and the portal link, which is the footer every existing
      // invoice already has.
      return BUILTIN_FOOTER_FIELDS.map((f) => ({
        id: f.id,
        visible: f.id === 'footer_note' || f.id === 'portal_link',
      }))
    case 'general':
      return [] // no built-in fields, only custom fields
    default:
      return undefined
  }
}

/**
 * Sections a workshop has to switch on before they appear.
 *
 * `items_table` is one because it replaces the separate parts and labor tables
 * rather than joining them, and `document_title` because the standard headers
 * already print the title themselves.
 */
const HIDDEN_BY_DEFAULT_SECTIONS = new Set<string>(['general', 'telegram_qr', 'items_table'])

export function getDefaultInvoiceLayout(): InvoiceLayoutConfig {
  return {
    sections: BUILTIN_SECTIONS.map((s, index) => {
      const fields = getDefaultFieldsForSection(s.id)
      const column = DEFAULT_COLUMN[s.id]
      return {
        id: s.id,
        visible: !HIDDEN_BY_DEFAULT_SECTIONS.has(s.id),
        order: index,
        ...(column ? { column } : {}),
        ...(fields ? { fields } : {}),
      }
    }),
  }
}

/** A section's appearance overrides, or nothing if it has none. */
export function getSectionStyle(
  config: InvoiceLayoutConfig | undefined | null,
  sectionId: string
): InvoiceSectionStyle | undefined {
  const style = config?.sections.find((s) => s.id === sectionId)?.style
  // An empty object is the same as none, and saves the renderer a clone.
  return style && Object.values(style).some((v) => v !== undefined && v !== '') ? style : undefined
}

// ---------------------------------------------------------------------------
// Letterhead mark
// ---------------------------------------------------------------------------

export type LetterheadMark = 'logo' | 'company_name'

/**
 * Which of the two the header band carries. Layouts that show neither, or that
 * have no header fields at all, read as the logo, which is what every header
 * has always preferred.
 */
export function getLetterheadMark(config: InvoiceLayoutConfig | undefined | null): LetterheadMark {
  const fields = config?.sections.find((s) => s.id === 'header')?.fields
  if (!fields) return 'logo'
  return fields.find((f) => f.id === 'logo')?.visible === false ? 'company_name' : 'logo'
}

/**
 * Flip the band from one mark to the other. It sets both fields, because the
 * band shows one and leaving the other visible would only mislead whoever opens
 * the layout editor next.
 */
export function withLetterheadMark(
  config: InvoiceLayoutConfig,
  mark: LetterheadMark
): InvoiceLayoutConfig {
  return {
    sections: config.sections.map((section) => {
      if (section.id !== 'header') return section
      const fields = section.fields ?? getDefaultFieldsForSection('header') ?? []
      return {
        ...section,
        fields: fields.map((field) =>
          field.id === 'logo'
            ? { ...field, visible: mark === 'logo' }
            : field.id === 'company_name'
              ? { ...field, visible: mark === 'company_name' }
              : field
        ),
      }
    }),
  }
}

// ---------------------------------------------------------------------------
// Field lookup helpers (for rendering)
// ---------------------------------------------------------------------------

/** Get all built-in field definitions for a section */
export function getBuiltinFieldsForSection(
  sectionId: string
): ReadonlyArray<{ id: string; name: string }> {
  switch (sectionId) {
    case 'customer':
      return BUILTIN_CUSTOMER_FIELDS
    case 'vehicle':
      return BUILTIN_VEHICLE_FIELDS
    case 'service':
      return BUILTIN_SERVICE_FIELDS
    case 'header':
      return BUILTIN_HEADER_FIELDS
    case 'bank_account':
      return BUILTIN_BANK_ACCOUNT_FIELDS
    case 'document_title':
      return BUILTIN_DOCUMENT_TITLE_FIELDS
    case 'footer':
      return BUILTIN_FOOTER_FIELDS
    default:
      return []
  }
}

/** Get the display name for a built-in field across all sections */
export function getBuiltinFieldName(fieldId: string): string | undefined {
  const allFields = [
    ...BUILTIN_CUSTOMER_FIELDS,
    ...BUILTIN_VEHICLE_FIELDS,
    ...BUILTIN_SERVICE_FIELDS,
    ...BUILTIN_HEADER_FIELDS,
    ...BUILTIN_BANK_ACCOUNT_FIELDS,
    ...BUILTIN_DOCUMENT_TITLE_FIELDS,
    ...BUILTIN_FOOTER_FIELDS,
  ]
  return allFields.find((f) => f.id === fieldId)?.name
}

/**
 * Make a hidden-but-drawn section real at the position it is drawn in.
 *
 * The one such section is the title strip the generator borrows under the
 * header when Document Title is switched off: on screen it sits right after
 * the header, while the hidden section's stored order points somewhere else
 * entirely. A designer gesture that references it resolves against this, so
 * the drop lands where the canvas showed it. A visible section passes
 * through untouched.
 */
export function materializeHiddenSection(
  config: InvoiceLayoutConfig,
  refId: string | null
): InvoiceLayoutConfig {
  if (!refId) return config
  const ref = config.sections.find((s) => s.id === refId)
  if (!ref || ref.visible) return config
  const ordered = [...config.sections]
    .sort((a, b) => a.order - b.order)
    .filter((s) => s.id !== refId)
  const headerAt = ordered.findIndex((s) => s.id === 'header')
  ordered.splice(headerAt + 1, 0, { ...ref, visible: true })
  return { ...config, sections: ordered.map((s, i) => ({ ...s, order: i })) }
}

// ---------------------------------------------------------------------------
// Merge helper – fills in missing sections/fields with defaults
// ---------------------------------------------------------------------------

export function mergeWithDefaults(saved: Partial<InvoiceLayoutConfig>): InvoiceLayoutConfig {
  const defaults = getDefaultInvoiceLayout()

  if (!saved.sections || saved.sections.length === 0) {
    return saved.version !== undefined ? { ...defaults, version: saved.version } : defaults
  }

  // Migrate old format: split "info" into customer/vehicle/service
  const migrated = migrateFromLegacy(saved.sections)

  const merged: InvoiceSection[] = []
  const seen = new Set<string>()

  for (const section of migrated) {
    // Skip duplicate section IDs (keep first occurrence)
    if (seen.has(section.id)) continue
    seen.add(section.id)

    const defaultFields = getDefaultFieldsForSection(section.id)
    if (defaultFields) {
      merged.push({
        ...section,
        fields: mergeSectionFields(section.fields, defaultFields),
      })
    } else {
      merged.push(section)
    }
  }

  // Append any new built-in sections that are missing from saved.
  // Insert each after its natural predecessor from the default order,
  // so e.g. "findings" lands after "labor_table" instead of at the end.
  const defaultOrder = defaults.sections.map((s) => s.id)
  const toInsert: { section: InvoiceSection; afterIdx: number }[] = []
  for (const def of defaults.sections) {
    if (seen.has(def.id)) continue
    const defaultIdx = defaultOrder.indexOf(def.id)
    let insertAfterIdx = -1
    for (let i = defaultIdx - 1; i >= 0; i--) {
      const idx = merged.findIndex((s) => s.id === defaultOrder[i])
      if (idx !== -1) {
        insertAfterIdx = idx
        break
      }
    }
    toInsert.push({ section: def, afterIdx: insertAfterIdx })
  }
  if (toInsert.length > 0) {
    // Insert in reverse so indices stay stable
    toInsert.sort((a, b) => b.afterIdx - a.afterIdx)
    for (const { section, afterIdx } of toInsert) {
      merged.splice(afterIdx + 1, 0, { ...section, order: 0 })
    }
    // Renumber all orders as clean integers
    for (let i = 0; i < merged.length; i++) {
      merged[i] = { ...merged[i], order: i }
    }
  }

  // Before the switch was obeyed, a hidden title strip was drawn anyway, under
  // the header. Those layouts are read as showing it there, which is what they
  // print today: without this, honouring the switch would take the number and
  // the date off every sheet that never chose to lose them. The designer
  // stamps the current version when it saves, so a workshop that switches the
  // strip off from now on keeps it off.
  if ((saved.version ?? 1) < HONEST_TITLE_SWITCH_VERSION) {
    const title = merged.findIndex((s) => s.id === 'document_title')
    if (title !== -1 && !merged[title].visible) {
      const headerOrder = merged.find((s) => s.id === 'header')?.order ?? 0
      merged[title] = { ...merged[title], visible: true, order: headerOrder + 0.5 }
    }
  }

  // Auto-assign column values to column-eligible sections if none have columns
  const hasAnyColumn = merged.some((s) => s.column)
  if (!hasAnyColumn) {
    for (const section of merged) {
      if (DEFAULT_COLUMN[section.id]) {
        section.column = DEFAULT_COLUMN[section.id]
      }
    }
  }

  return {
    sections: merged,
    ...(saved.document ? { document: saved.document } : {}),
    ...(saved.anchors ? { anchors: saved.anchors } : {}),
    ...(saved.version !== undefined ? { version: saved.version } : {}),
  }
}

// ---------------------------------------------------------------------------
// Legacy migration: "info" → customer/vehicle/service,
//                    "custom_fields" → "general"
// ---------------------------------------------------------------------------

const CUSTOMER_FIELD_IDS: Set<string> = new Set(BUILTIN_CUSTOMER_FIELDS.map((f) => f.id))
const VEHICLE_FIELD_IDS: Set<string> = new Set(BUILTIN_VEHICLE_FIELDS.map((f) => f.id))
const SERVICE_FIELD_IDS: Set<string> = new Set(BUILTIN_SERVICE_FIELDS.map((f) => f.id))

function migrateFromLegacy(sections: InvoiceSection[]): InvoiceSection[] {
  const hasInfo = sections.some((s) => s.id === 'info')
  const hasCustomFields = sections.some((s) => s.id === 'custom_fields')

  // Already in new format
  if (!hasInfo && !hasCustomFields) {
    return sections
  }

  const result: InvoiceSection[] = []

  for (const section of sections) {
    if (section.id === 'info') {
      // Split into customer, vehicle, service
      const customerFields: InvoiceFieldConfig[] = []
      const vehicleFields: InvoiceFieldConfig[] = []
      const serviceFields: InvoiceFieldConfig[] = []
      const customFieldRefs: InvoiceFieldConfig[] = []

      if (section.fields) {
        for (const field of section.fields) {
          if (CUSTOMER_FIELD_IDS.has(field.id)) {
            customerFields.push(field)
          } else if (VEHICLE_FIELD_IDS.has(field.id)) {
            vehicleFields.push(field)
          } else if (SERVICE_FIELD_IDS.has(field.id)) {
            serviceFields.push(field)
          } else if (isCustomFieldId(field.id)) {
            customFieldRefs.push(field)
          }
        }
      }

      // Use the info section's order as base, insert three sections
      const baseOrder = section.order
      result.push({
        id: 'customer',
        visible: section.visible,
        order: baseOrder,
        fields: customerFields.length > 0 ? customerFields : undefined,
      })
      result.push({
        id: 'vehicle',
        visible: section.visible,
        order: baseOrder + 0.1,
        fields: vehicleFields.length > 0 ? vehicleFields : undefined,
      })
      result.push({
        id: 'service',
        visible: section.visible,
        order: baseOrder + 0.2,
        fields: serviceFields.length > 0 ? serviceFields : undefined,
      })

      // If the old info section had custom fields, add them to general
      if (customFieldRefs.length > 0) {
        result.push({
          id: 'general',
          visible: section.visible,
          order: baseOrder + 0.3,
          fields: customFieldRefs,
        })
      }
    } else if (section.id === 'custom_fields') {
      // Rename to general, keep any cf_ field references
      result.push({
        ...section,
        id: 'general',
      })
    } else {
      result.push(section)
    }
  }

  // Normalize order values to integers
  result.sort((a, b) => a.order - b.order)
  result.forEach((s, i) => {
    s.order = i
  })

  return result
}

// ---------------------------------------------------------------------------
// Field merge helper
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Rendering helper – groups sections into full-width or 2-column rows
// ---------------------------------------------------------------------------

export type RenderGroup =
  | { type: 'full-width'; sectionId: string }
  | { type: 'columns'; left: string[]; right: string[] }

/**
 * Groups sorted visible sections for rendering.
 * Consecutive column-assigned sections are grouped into a single 2-column row.
 * Sections without a column render as full-width.
 */
export function groupSectionsForRendering(sections: InvoiceSection[]): RenderGroup[] {
  // Deduplicate by section ID (keep first occurrence by order)
  const seen = new Set<string>()
  const sorted = [...sections]
    .filter((s) => s.visible)
    .sort((a, b) => a.order - b.order)
    .filter((s) => {
      if (seen.has(s.id)) return false
      seen.add(s.id)
      return true
    })

  const groups: RenderGroup[] = []
  let pendingLeft: string[] = []
  let pendingRight: string[] = []

  const flushColumns = () => {
    if (pendingLeft.length > 0 || pendingRight.length > 0) {
      groups.push({ type: 'columns', left: [...pendingLeft], right: [...pendingRight] })
      pendingLeft = []
      pendingRight = []
    }
  }

  for (const section of sorted) {
    if (section.column === 'left' || section.column === 'right') {
      if (section.column === 'left') pendingLeft.push(section.id)
      else pendingRight.push(section.id)
    } else {
      flushColumns()
      groups.push({ type: 'full-width', sectionId: section.id })
    }
  }
  flushColumns()

  return groups
}

// ---------------------------------------------------------------------------
// Shared field-ordering helper
// ---------------------------------------------------------------------------

/**
 * Returns field IDs in the order specified by a layout config's visible fields Set.
 * The Set's iteration order reflects the layout config ordering.
 * Falls back to `defaults` when no config is provided.
 */
export function getOrderedFieldIds(
  visibleFields: Set<string> | null | undefined,
  defaults: string[]
): string[] {
  if (!visibleFields) return defaults
  // Set iteration order = insertion order = layout config order
  const ordered = [...visibleFields].filter((id) => !isCustomFieldId(id))
  return ordered.length > 0 ? ordered : defaults
}

/**
 * Returns a Set of visible field IDs for a given section, preserving field order.
 * Returns null if no layout config is present (meaning show all fields).
 */
export function getVisibleFieldsForSection(
  layoutConfig: InvoiceLayoutConfig | undefined | null,
  sectionId: string
): Set<string> | null {
  if (!layoutConfig) return null
  const section = layoutConfig.sections.find((s) => s.id === sectionId)
  if (!section?.fields) return null
  return new Set(section.fields.filter((f) => f.visible).map((f) => f.id))
}

// ---------------------------------------------------------------------------
// Field merge helper
// ---------------------------------------------------------------------------

function mergeSectionFields(
  savedFields: InvoiceFieldConfig[] | undefined,
  defaults: InvoiceFieldConfig[]
): InvoiceFieldConfig[] {
  if (!savedFields || savedFields.length === 0) {
    return defaults
  }

  const seen = new Set<string>()
  const merged: InvoiceFieldConfig[] = []

  for (const field of savedFields) {
    seen.add(field.id)
    merged.push(field)
  }

  // Append any missing default fields
  for (const def of defaults) {
    if (!seen.has(def.id)) {
      merged.push(def)
    }
  }

  return merged
}
