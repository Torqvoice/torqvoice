// @vitest-environment node
/**
 * A custom field on paper a customer holds.
 *
 * A checkbox prints the workshop's word for yes or no and a date prints in
 * the workshop's date format, as the calendar day that was picked, on the
 * invoice, the quote and the work order alike. Text and numbers print as
 * typed. An invoice issued while every document said "Yes" and "March 10,
 * 2026" keeps saying that when it is printed again.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const db = {
  serviceRecord: { findUnique: vi.fn() },
  appSetting: { findMany: vi.fn() },
  organization: { findUnique: vi.fn() },
  vehicleFinding: { findMany: vi.fn() },
  documentDesign: { findFirst: vi.fn() },
  inspection: { findFirst: vi.fn() },
}
const liveCustomFields = vi.fn(async (): Promise<unknown[]> => [])
vi.mock('@/lib/db', () => ({ db }))
vi.mock('@/features/custom-fields/Lib/getCustomFieldsForPrint', () => ({
  getCustomFieldsForPrint: () => liveCustomFields(),
  // The vehicle's and the customer's own fields: this workshop has none.
  getRecordCustomFieldsForPrint: async () => [],
}))
vi.mock('@/features/invoice-designer/Lib/designRules.server', () => ({
  designRuleSubjectOf: () => ({}),
  findRuleDesign: async () => null,
}))
vi.mock('@/features/signatures/Lib/memberSignature.server', () => ({
  memberSignatureDataUri: async () => undefined,
}))
vi.mock('@/features/condition-map/Lib/loadMarks.server', () => ({
  loadVisitConditionMap: async () => null,
  loadMarkTypeRows: async () => [],
}))

const { customFieldText, legacyCustomFieldText } = await import(
  '@/features/custom-fields/Lib/customFieldText'
)
const { loadPrintLabels } = await import('@/features/invoice-designer/Pdf/printLabels')
const { buildInvoicePrintSpec } = await import('@/features/invoice-designer/Pdf/buildInvoicePrint')
const { buildQuotePrintSpec } = await import('@/features/invoice-designer/Pdf/buildQuotePrint')
const { buildWorkOrderPrintSpec } = await import(
  '@/features/invoice-designer/Pdf/buildWorkOrderPrint'
)
const { assembleInvoicePrint } = await import('@/features/invoices/Lib/assembleInvoicePrint')
const { buildIssuedInvoiceData } = await import('@/features/invoices/Lib/issueInvoice')
const { DESIGNER_LAYOUT_VERSION, getDefaultLayout } = await import(
  '@/features/settings/Schema/invoiceLayoutSchema'
)

/* eslint-disable @typescript-eslint/no-explicit-any */

/** A Norwegian workshop a long way west of Greenwich, on a server further east still. */
const WORKSHOP_ZONE = 'America/Los_Angeles'
const SERVER_ZONES = ['Pacific/Kiritimati', 'Pacific/Pago_Pago', 'UTC']
const originalTz = process.env.TZ
afterEach(() => {
  process.env.TZ = originalTz
})

const fields = () => [
  { fieldId: 'cf1', label: 'Lånebil', value: 'true', fieldType: 'checkbox' },
  { fieldId: 'cf2', label: 'Hjul lagret', value: 'false', fieldType: 'checkbox' },
  { fieldId: 'cf3', label: 'Neste EU-kontroll', value: '2026-03-10', fieldType: 'date' },
  { fieldId: 'cf4', label: 'Nøkkelnummer', value: '0042', fieldType: 'text' },
  { fieldId: 'cf5', label: 'Dekktrykk', value: '2.40', fieldType: 'number' },
  { fieldId: 'cf6', label: 'Kilde', value: 'true', fieldType: 'select' },
]

const invoice = (customFields: unknown[] = fields()) =>
  ({
    id: 'svc_1',
    title: 'Service',
    description: null,
    type: 'repair',
    serviceDate: new Date('2026-09-18T10:00:00Z'),
    invoiceDate: new Date('2026-09-18T10:00:00Z'),
    invoiceDueDate: null,
    shopName: 'Verksted',
    techName: null,
    mileage: 1000,
    diagnosticNotes: null,
    invoiceNotes: null,
    subtotal: 100,
    taxRate: 0,
    taxAmount: 0,
    totalAmount: 100,
    cost: 100,
    invoiceNumber: 'INV-1',
    discountValue: 0,
    partItems: [],
    laborItems: [{ description: 'Arbeid', hours: 1, rate: 100, total: 100 }],
    customFields,
    findings: [],
    customer: { name: 'Zz Test', email: null, phone: null, address: null, company: null },
    vehicle: {
      make: 'Volvo',
      model: 'V60',
      year: 2020,
      vin: null,
      licensePlate: 'AB 12345',
      mileage: 1000,
      customer: null,
    },
  }) as any

const quote = () =>
  ({
    quoteNumber: 'Q-1',
    title: 'Service',
    description: null,
    validUntil: null,
    createdAt: new Date('2026-09-10T10:00:00Z'),
    subtotal: 100,
    taxRate: 0,
    taxAmount: 0,
    taxInclusive: false,
    discountType: null,
    discountValue: 0,
    discountAmount: 0,
    totalAmount: 100,
    notes: null,
    partItems: [],
    laborItems: [{ description: 'Arbeid', hours: 1, rate: 100, total: 100 }],
    customer: { name: 'Zz Test', email: null, phone: null, address: null, company: null },
    vehicle: { make: 'Volvo', model: 'V60', year: 2020, vin: null, licensePlate: 'AB 12345' },
  }) as any

/** A design with the panel custom fields print in switched on; it is off until a field is placed. */
function design(type: 'invoice' | 'quote' | 'work_order') {
  const layout = getDefaultLayout(type)
  return {
    ...layout,
    version: DESIGNER_LAYOUT_VERSION,
    sections: layout.sections.map((s) => (s.id === 'general' ? { ...s, visible: true } : s)),
  }
}

/** Everything a sheet says, as one string. */
const said = (spec: unknown) => JSON.stringify(spec)

const settings = { currencyCode: 'NOK', dateFormat: 'dd.MM.yyyy', timezone: WORKSHOP_ZONE }

async function sheets(locale: string) {
  const [invoiceLabels, quoteLabels, workOrderLabels] = await Promise.all([
    loadPrintLabels(locale, {}, 'invoice'),
    loadPrintLabels(locale, {}, 'quote'),
    loadPrintLabels(locale, {}, 'work_order'),
  ])
  return {
    invoice: said(
      buildInvoicePrintSpec({
        data: invoice(),
        labels: invoiceLabels,
        invoiceSettings: settings,
        template: { layoutConfig: design('invoice') } as any,
      })
    ),
    quote: said(
      buildQuotePrintSpec({
        data: quote(),
        labels: quoteLabels,
        customFields: fields(),
        layoutConfig: design('quote') as any,
        dateFormat: settings.dateFormat,
        timezone: settings.timezone,
      })
    ),
    workOrder: said(
      buildWorkOrderPrintSpec({
        data: invoice(),
        job: {
          orderNumber: '1',
          statusLabel: 'Pågår',
          workBay: null,
          helperNames: [],
          promisedAt: null,
          concerns: [],
          qrDataUri: null,
          printedAt: new Date('2026-09-25T10:00:00Z'),
        } as any,
        labels: workOrderLabels,
        invoiceSettings: settings,
        template: { layoutConfig: design('work_order') } as any,
      })
    ),
  }
}

describe("a custom field on a customer's document", () => {
  for (const serverZone of SERVER_ZONES) {
    it(`prints in the workshop's language and date format on every sheet (server in ${serverZone})`, async () => {
      process.env.TZ = serverZone
      const printed = await sheets('nb')
      for (const [name, text] of Object.entries(printed)) {
        expect(text, name).toContain('Lånebil: Ja')
        expect(text, name).toContain('Hjul lagret: Nei')
        expect(text, name).toContain('Neste EU-kontroll: 10.03.2026')
        expect(text, name).not.toContain('Lånebil: Yes')
        expect(text, name).not.toContain('March 10, 2026')
      }
    })
  }

  it('prints text, numbers and choices exactly as they were typed', async () => {
    const printed = await sheets('nb')
    for (const [name, text] of Object.entries(printed)) {
      expect(text, name).toContain('Nøkkelnummer: 0042')
      expect(text, name).toContain('Dekktrykk: 2.40')
      // Only a checkbox turns "true" into a word.
      expect(text, name).toContain('Kilde: true')
    }
  })

  it('still says Yes and No for an English workshop', async () => {
    const printed = await sheets('en')
    for (const [name, text] of Object.entries(printed)) {
      expect(text, name).toContain('Lånebil: Yes')
      expect(text, name).toContain('Hjul lagret: No')
    }
  })

  it('has a word for yes and no in every language a document prints in', async () => {
    const locales = ['de', 'es', 'fr', 'it', 'lt', 'nb', 'nl', 'pl', 'pt-BR', 'pt-PT', 'ru', 'tr']
    for (const locale of locales) {
      const labels = await loadPrintLabels(locale, {}, 'invoice')
      expect(labels.customFieldYes, locale).toBeTruthy()
      expect(labels.customFieldNo, locale).toBeTruthy()
      expect(labels.customFieldYes, locale).not.toBe(labels.customFieldNo)
    }
  })
})

describe('a date custom field', () => {
  it('is the calendar day that was picked, whatever zone the server and the workshop are in', () => {
    for (const serverZone of SERVER_ZONES) {
      process.env.TZ = serverZone
      for (const timezone of [WORKSHOP_ZONE, 'Pacific/Auckland', undefined]) {
        const ctx = { dateFormat: 'dd.MM.yyyy', timezone }
        expect(customFieldText('2026-03-10', 'date', ctx)).toBe('10.03.2026')
        expect(customFieldText('2026-01-01', 'date', ctx)).toBe('01.01.2026')
        expect(customFieldText('2026-12-31', 'date', ctx)).toBe('31.12.2026')
      }
    }
  })

  it("follows the workshop's date format", () => {
    expect(customFieldText('2026-03-10', 'date', { dateFormat: 'MM/dd/yyyy' })).toBe('03/10/2026')
    expect(customFieldText('2026-03-10', 'date', { dateFormat: 'yyyy-MM-dd' })).toBe('2026-03-10')
  })

  it("puts a value that names an instant on the workshop's clock", () => {
    process.env.TZ = 'UTC'
    const ctx = { dateFormat: 'dd.MM.yyyy', timezone: WORKSHOP_ZONE }
    // Early on the 11th in UTC is still the 10th in Los Angeles.
    expect(customFieldText('2026-03-11T03:00:00Z', 'date', ctx)).toBe('10.03.2026')
  })

  it('prints what was stored when it is not a date', () => {
    expect(customFieldText('next spring', 'date', { dateFormat: 'dd.MM.yyyy' })).toBe('next spring')
    expect(customFieldText('2026-02-31', 'date', { dateFormat: 'dd.MM.yyyy' })).toBe('2026-02-31')
    expect(customFieldText('', 'date', { dateFormat: 'dd.MM.yyyy' })).toBe('')
  })
})

describe('an invoice that was already issued', () => {
  const record = (over: Record<string, unknown> = {}) => ({
    id: 'rec-1',
    organizationId: 'org-1',
    vehicleId: 'veh-1',
    inspectionId: null,
    designId: null,
    title: 'Service',
    type: 'repair',
    serviceDate: new Date('2026-09-24T09:00:00Z'),
    invoiceNumber: '2026-0042',
    subtotal: 100,
    taxRate: 0,
    taxAmount: 0,
    totalAmount: 100,
    cost: 100,
    discountValue: 0,
    manuallyPaid: false,
    conditionMapOnInvoice: null,
    techName: null,
    issuedAt: null,
    issuedData: null,
    editUnlockedAt: null,
    partItems: [],
    laborItems: [{ description: 'Arbeid', hours: 1, rate: 100, total: 100 }],
    attachments: [],
    payments: [],
    technician: null,
    customer: { name: 'Zz Test', invoiceDesignId: null },
    vehicle: {
      customerId: 'cust-1',
      make: 'Volvo',
      model: 'V60',
      year: 2020,
      vin: null,
      licensePlate: 'AB 12345',
      hsn: null,
      tsn: null,
      mileage: 1000,
      customer: null,
    },
    issuedDesignSnapshot: null,
    issuedLogoSnapshot: null,
    issuedSignatureSnapshot: null,
    createdBy: { id: 'user-1', name: 'Kari' },
    ...over,
  })

  /** What the column held for an invoice issued before this wording changed. */
  const OLD_SNAPSHOT = {
    version: 1,
    workshop: { name: 'Verksted', address: '', phone: '', email: '' },
    invoiceSettings: { dateFormat: 'dd.MM.yyyy', timezone: 'Europe/Oslo' },
    serviceType: 'automotive',
    customer: { name: 'Zz Test' },
    vehicle: { make: 'Volvo', model: 'V60', year: 2020 },
    technicianName: null,
    findings: [],
    customFields: [
      { fieldId: 'cf1', label: 'Lånebil', value: 'true', fieldType: 'checkbox' },
      { fieldId: 'cf3', label: 'Neste EU-kontroll', value: '2026-03-10', fieldType: 'date' },
      { fieldId: 'cf4', label: 'Nøkkelnummer', value: '0042', fieldType: 'text' },
    ],
    conditionMap: null,
  }

  beforeEach(() => {
    vi.clearAllMocks()
    process.env.TZ = 'UTC'
    db.organization.findUnique.mockResolvedValue({ name: 'Verksted', portalSlug: null })
    db.vehicleFinding.findMany.mockResolvedValue([])
    db.documentDesign.findFirst.mockResolvedValue(null)
    db.appSetting.findMany.mockResolvedValue([
      { key: 'workshop.dateFormat', value: 'dd.MM.yyyy' },
      { key: 'workshop.timezone', value: 'Europe/Oslo' },
      { key: 'invoice.layoutConfig', value: JSON.stringify(design('invoice')) },
    ])
    db.inspection.findFirst.mockResolvedValue(null)
    liveCustomFields.mockResolvedValue([])
  })

  const print = async (assembly: any) =>
    said(
      buildInvoicePrintSpec({
        data: assembly.data,
        template: assembly.template,
        invoiceSettings: assembly.invoiceSettings,
        labels: await loadPrintLabels('nb', {}, 'invoice'),
      })
    )

  it('issued before the change reprints with the words it was sent with', async () => {
    db.serviceRecord.findUnique.mockResolvedValue(
      record({
        issuedAt: new Date('2026-05-01T10:00:00Z'),
        issuedData: OLD_SNAPSHOT,
        issuedDesignSnapshot: { layout: design('invoice'), template: {} },
      })
    )
    const text = await print(await assembleInvoicePrint('rec-1'))
    expect(text).toContain('Lånebil: Yes')
    expect(text).toContain('Neste EU-kontroll: March 10, 2026')
    expect(text).toContain('Nøkkelnummer: 0042')
    // The old wording is exactly what the previous formatter produced.
    expect(legacyCustomFieldText('true', 'checkbox')).toBe('Yes')
    expect(legacyCustomFieldText('2026-03-10', 'date')).toBe('March 10, 2026')
  })

  it("issued today freezes the raw value and reprints in the workshop's language", async () => {
    liveCustomFields.mockResolvedValue(fields())
    db.serviceRecord.findUnique.mockResolvedValue(record())
    const live = await assembleInvoicePrint('rec-1', { mode: 'live', inspectionResults: 'rows' })
    const issuedData = JSON.parse(JSON.stringify(buildIssuedInvoiceData(live!)))
    expect(issuedData.customFields[0]).toEqual({
      fieldId: 'cf1',
      label: 'Lånebil',
      value: 'true',
      fieldType: 'checkbox',
      format: 'workshop',
    })

    // The live fields are gone; only the snapshot can answer.
    liveCustomFields.mockResolvedValue([])
    db.serviceRecord.findUnique.mockResolvedValue(
      record({
        issuedAt: new Date('2026-11-19T10:00:00Z'),
        issuedData,
        issuedDesignSnapshot: { layout: design('invoice'), template: {} },
      })
    )
    const text = await print(await assembleInvoicePrint('rec-1'))
    expect(text).toContain('Lånebil: Ja')
    expect(text).toContain('Hjul lagret: Nei')
    expect(text).toContain('Neste EU-kontroll: 10.03.2026')
  })
})
