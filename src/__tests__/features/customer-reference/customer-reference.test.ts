/**
 * @vitest-environment node
 *
 * The customer's reference / PO on work orders and quotes: an opt-in field.
 * Most of what is tested here is the "opt-in" half: that a workshop which
 * never switched it on gets the documents, import columns, mail tags and
 * ledger payloads it always got, to the byte.
 */
import { describe, expect, it } from 'vitest'
import {
  CUSTOMER_REFERENCE_MAX_LENGTH,
  normalizeCustomerReference,
  referenceMissing,
} from '@/features/customer-reference/Lib/reference'
import {
  customerReferenceEnabledIn,
  gateCustomerReference,
  gatePoRequired,
} from '@/features/customer-reference/Lib/referenceSetting'
import { fieldsFor, templateFieldsFor } from '@/features/import/Lib/fields'
import { suggestMapping } from '@/features/import/Lib/suggest'
import { buildInvoicePrintSpec } from '@/features/invoice-designer/Pdf/buildInvoicePrint'
import { buildQuotePrintSpec } from '@/features/invoice-designer/Pdf/buildQuotePrint'
import { buildWorkOrderPrintSpec } from '@/features/invoice-designer/Pdf/buildWorkOrderPrint'
import { sectionFields } from '@/features/invoice-designer/Spec/buildSpec'
import {
  DESIGNER_LAYOUT_VERSION,
  GRANDFATHERED_FIELDS,
  type InvoiceLayoutConfig,
  getDefaultInvoiceLayout,
  getDefaultLayout,
  isOptInField,
  mergeWithDefaults,
} from '@/features/settings/Schema/invoiceLayoutSchema'
import {
  buildLayoutFromPreset,
  layoutPresets,
  workOrderPresets,
} from '@/features/settings/Schema/layoutPresets'
import { tagValuesFor } from '@/features/email/Lib/emailContext'
import { kindSpec } from '@/features/email/Lib/emailKinds'
import {
  createCustomerSchema,
  updateCustomerSchema,
} from '@/features/customers/Schema/customerSchema'
import type { InvoiceData } from '@/features/vehicles/Components/invoice-pdf/types'

describe('what is stored for what was typed', () => {
  it('trims it, and keeps nothing for an emptied box', () => {
    expect(normalizeCustomerReference('  PO-48213 ')).toBe('PO-48213')
    expect(normalizeCustomerReference('   ')).toBeNull()
    expect(normalizeCustomerReference(null)).toBeNull()
  })

  it('cuts a pasted paragraph to the length of a reference', () => {
    expect(normalizeCustomerReference('x'.repeat(500))).toHaveLength(CUSTOMER_REFERENCE_MAX_LENGTH)
  })
})

describe('the setting', () => {
  const paid = { customFields: true }

  it('is off until a workshop turns it on', () => {
    expect(customerReferenceEnabledIn({}, paid)).toBe(false)
    expect(
      customerReferenceEnabledIn({ 'documents.customerReferenceEnabled': 'false' }, paid)
    ).toBe(false)
    expect(customerReferenceEnabledIn({ 'documents.customerReferenceEnabled': 'true' }, paid)).toBe(
      true
    )
  })

  it('is off on a plan without custom fields, whatever the switch still says', () => {
    expect(
      customerReferenceEnabledIn(
        { 'documents.customerReferenceEnabled': 'true' },
        { customFields: false }
      )
    ).toBe(false)
  })

  it('hides the reference while it is off, and keeps the rest of the job', () => {
    const job = { title: 'Brakes', customerReference: 'PO-1' }
    expect(gateCustomerReference(job, false)).toEqual({ title: 'Brakes', customerReference: null })
    expect(gateCustomerReference(job, true)).toBe(job)
  })

  it('never says "PO required" while it is off', () => {
    expect(gatePoRequired({ name: 'A', poRequired: true }, false).poRequired).toBe(false)
    expect(gatePoRequired({ name: 'A', poRequired: true }, true).poRequired).toBe(true)
  })
})

describe('a customer whose invoices need a reference', () => {
  const needs = { poRequired: true }

  it('holds the invoice while the job has none', () => {
    expect(referenceMissing(true, { customerReference: null }, needs)).toBe(true)
    expect(referenceMissing(true, { customerReference: '   ' }, needs)).toBe(true)
  })

  it('lets it go once there is one', () => {
    expect(referenceMissing(true, { customerReference: 'PO-1' }, needs)).toBe(false)
  })

  it('holds nothing for any other customer, or for a job with no customer', () => {
    expect(referenceMissing(true, { customerReference: null }, { poRequired: false })).toBe(false)
    expect(referenceMissing(true, { customerReference: null }, null)).toBe(false)
  })

  it('holds nothing at all while the field is off', () => {
    expect(referenceMissing(false, { customerReference: null }, needs)).toBe(false)
  })

  it('is a switch an old tab does not have to send', () => {
    expect(createCustomerSchema.parse({ name: 'A' }).poRequired).toBeUndefined()
    expect(updateCustomerSchema.parse({ id: 'c1', name: 'A' }).poRequired).toBeUndefined()
    expect(updateCustomerSchema.parse({ id: 'c1', poRequired: true }).poRequired).toBe(true)
  })
})

describe('importing a spreadsheet', () => {
  const keys = (customerReference: boolean) =>
    fieldsFor('services', { customerReference }).map((f) => f.key)

  it('offers the column only to a workshop that uses the field', () => {
    expect(keys(false)).not.toContain('service.customerReference')
    expect(keys(true)).toContain('service.customerReference')
    expect(fieldsFor('services').map((f) => f.key)).not.toContain('service.customerReference')
  })

  it('never maps a "PO number" column while the field is off', () => {
    const columns = ['Date', 'Title', 'PO number']
    const rows = [['2026-01-02', 'Brakes', 'PO-48213']]
    const off = suggestMapping(columns, rows, 'services', null, {})
    expect(Object.values(off.mapping)).not.toContain('service.customerReference')
    const on = suggestMapping(columns, rows, 'services', null, { customerReference: true })
    expect(on.mapping['2']).toBe('service.customerReference')
  })

  it('leaves the downloadable template as it was', () => {
    expect(templateFieldsFor('services').map((f) => f.key)).not.toContain(
      'service.customerReference'
    )
  })
})

const invoiceData = {
  id: 'svc1',
  title: 'Service',
  description: null,
  type: 'repair',
  serviceDate: new Date('2026-09-26'),
  invoiceDate: new Date('2026-09-26'),
  shopName: 'Shop',
  techName: null,
  mileage: null,
  diagnosticNotes: null,
  invoiceNotes: null,
  subtotal: 100,
  taxRate: 0,
  taxAmount: 0,
  totalAmount: 100,
  cost: 100,
  invoiceNumber: 'INV-1',
  customerReference: 'PO-48213',
  partItems: [],
  laborItems: [{ description: 'Work', hours: 1, rate: 100, total: 100 }],
  customer: { name: 'Alex Carter', email: null, phone: null, address: null, company: null },
  vehicle: {
    make: 'Volvo',
    model: 'FH',
    year: 2019,
    vin: null,
    licensePlate: 'AB 12345',
    mileage: 1000,
    customer: null,
  },
} as unknown as InvoiceData

const quoteData = {
  ...(invoiceData as unknown as Record<string, unknown>),
  quoteNumber: 'Q-1',
  status: 'draft',
  createdAt: new Date('2026-09-26'),
  validUntil: null,
  notes: null,
  discountType: null,
  discountValue: 0,
  discountAmount: 0,
} as never

const job = {
  orderNumber: '1',
  statusLabel: 'Open',
  concerns: [],
  printedAt: new Date('2026-09-26T00:00:00Z'),
} as never

const labels = { customerReference: 'Your reference / PO' }
const LINE = 'Your reference / PO: PO-48213'

/** The layout with the field switched on in the customer block, as the designer saves it. */
function withReferenceOn(layout: InvoiceLayoutConfig): InvoiceLayoutConfig {
  return {
    ...layout,
    version: DESIGNER_LAYOUT_VERSION,
    sections: layout.sections.map((section) =>
      section.id === 'customer'
        ? {
            ...section,
            visible: true,
            fields: (section.fields ?? []).map((field) =>
              field.id === 'customer_reference' ? { ...field, visible: true } : field
            ),
          }
        : section
    ),
  }
}

const invoiceSpec = (layoutConfig: InvoiceLayoutConfig, data: InvoiceData = invoiceData) =>
  JSON.stringify(buildInvoicePrintSpec({ data, labels, template: { layoutConfig } as never }))
const quoteSpec = (layoutConfig: InvoiceLayoutConfig) =>
  JSON.stringify(buildQuotePrintSpec({ data: quoteData, labels, layoutConfig }))
const workOrderSpec = (layoutConfig: InvoiceLayoutConfig) =>
  JSON.stringify(
    buildWorkOrderPrintSpec({
      data: invoiceData,
      job,
      labels,
      template: { layoutConfig } as never,
    })
  )

describe('printing the reference', () => {
  it('is an opt-in field, never a grandfathered one', () => {
    expect(isOptInField('customer', 'customer_reference')).toBe(true)
    expect(Object.values(GRANDFATHERED_FIELDS).flat()).not.toContain('customer_reference')
  })

  it('is off in every default layout', () => {
    for (const type of ['invoice', 'work_order', 'certificate'] as const) {
      const customer = getDefaultLayout(type).sections.find((s) => s.id === 'customer')
      const field = customer?.fields?.find((f) => f.id === 'customer_reference')
      expect(field?.visible, type).toBe(false)
    }
  })

  it('prints on no default sheet, though the job carries one', () => {
    expect(invoiceSpec(getDefaultInvoiceLayout())).not.toContain('PO-48213')
    expect(quoteSpec(getDefaultInvoiceLayout())).not.toContain('PO-48213')
    expect(workOrderSpec(getDefaultLayout('work_order'))).not.toContain('PO-48213')
  })

  it('prints on no starting point a workshop can pick', () => {
    for (const preset of layoutPresets) {
      const layout = buildLayoutFromPreset(preset)
      expect(invoiceSpec(layout), preset.id).not.toContain('PO-48213')
      expect(quoteSpec(layout), preset.id).not.toContain('PO-48213')
    }
    for (const preset of workOrderPresets) {
      expect(workOrderSpec(buildLayoutFromPreset(preset)), preset.id).not.toContain('PO-48213')
    }
  })

  it('stays off in a design saved before the field existed', () => {
    for (const layout of [getDefaultInvoiceLayout(), getDefaultLayout('work_order')]) {
      const saved = {
        ...layout,
        version: DESIGNER_LAYOUT_VERSION,
        sections: layout.sections.map((s) =>
          s.id === 'customer'
            ? {
                ...s,
                // Every customer line on, as an old design has them, and no
                // mention of the new one.
                fields: s.fields
                  ?.filter((f) => f.id !== 'customer_reference')
                  .map((f) => ({ ...f, visible: true })),
              }
            : s
        ),
      }
      const merged = mergeWithDefaults(saved)
      const customer = merged.sections.find((s) => s.id === 'customer')
      expect(customer?.fields?.find((f) => f.id === 'customer_reference')?.visible).toBe(false)
      expect(invoiceSpec(merged)).not.toContain('PO-48213')
    }
  })

  it('stays off in a customer block that never listed its fields at all', () => {
    const customer = getDefaultInvoiceLayout().sections.find((s) => s.id === 'customer')
    if (!customer) throw new Error('no customer section')
    const { fields: _fields, ...bare } = customer
    expect(sectionFields(bare)).not.toContain('customer_reference')
    expect(sectionFields(bare)).toContain('customer_name')
  })

  it('prints the same sheet with a reference as without, until a design asks for it', () => {
    for (const layout of [getDefaultInvoiceLayout(), ...layoutPresets.map(buildLayoutFromPreset)]) {
      const without = { ...invoiceData, customerReference: null } as InvoiceData
      expect(invoiceSpec(layout, invoiceData)).toBe(invoiceSpec(layout, without))
    }
  })

  it('prints on the invoice, the quote and the work order once a design switches it on', () => {
    expect(invoiceSpec(withReferenceOn(getDefaultInvoiceLayout()))).toContain(LINE)
    expect(quoteSpec(withReferenceOn(getDefaultInvoiceLayout()))).toContain(LINE)
    expect(workOrderSpec(withReferenceOn(getDefaultLayout('work_order')))).toContain(LINE)
  })

  it('prints nothing for a job without one, rather than a caption', () => {
    const without = { ...invoiceData, customerReference: null } as InvoiceData
    expect(invoiceSpec(withReferenceOn(getDefaultInvoiceLayout()), without)).not.toContain(
      'Your reference'
    )
  })
})

describe('the mail tag', () => {
  const workshop = { name: 'Bergen Auto' }

  it('is offered for the invoice and the quote mail only', () => {
    expect(kindSpec('invoice_sent').tags).toContain('customer_reference')
    expect(kindSpec('quote_sent').tags).toContain('customer_reference')
    expect(kindSpec('inspection_sent').tags).not.toContain('customer_reference')
  })

  it('fills with the reference when the job has one', () => {
    const values = tagValuesFor(
      'invoice_sent',
      { document: { number: 'INV-1', customerReference: 'PO-48213' } } as never,
      { workshop } as never
    )
    expect(values.customer_reference).toBe('PO-48213')
  })

  it('is blank for a job without one, and for a workshop that has the field off', () => {
    const values = tagValuesFor(
      'invoice_sent',
      { document: { number: 'INV-1', customerReference: null } } as never,
      { workshop } as never
    )
    expect(values.customer_reference).toBeUndefined()
  })
})
