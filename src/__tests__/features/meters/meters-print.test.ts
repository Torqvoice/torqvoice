/**
 * @vitest-environment node
 *
 * Meter readings on paper. An opt-in line in the vehicle block: a design
 * prints it only once it is switched on, every default, starting point and
 * design saved before it prints the same sheet with readings as without,
 * and the technician app is told the server has them.
 */
import { describe, expect, it } from 'vitest'
import { buildInvoicePrintSpec } from '@/features/invoice-designer/Pdf/buildInvoicePrint'
import { buildQuotePrintSpec } from '@/features/invoice-designer/Pdf/buildQuotePrint'
import { buildWorkOrderPrintSpec } from '@/features/invoice-designer/Pdf/buildWorkOrderPrint'
import { sectionFields } from '@/features/invoice-designer/Spec/buildSpec'
import { buildSampleData } from '@/features/invoice-designer/Components/sample'
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
import type { InvoiceData } from '@/features/vehicles/Components/invoice-pdf/types'
import { TECH_API_FEATURES } from '@/lib/tech-api-features'

const READINGS = [
  { name: 'Engine hours', unit: 'hrs', value: 4256.7 },
  { name: 'PTO hours', unit: 'hrs', value: 2984.3 },
]

const invoiceData = {
  id: 'svc1',
  title: 'Service',
  description: null,
  type: 'repair',
  serviceDate: new Date('2026-09-26'),
  invoiceDate: new Date('2026-09-26'),
  shopName: 'Shop',
  techName: null,
  mileage: 12845,
  diagnosticNotes: null,
  invoiceNotes: null,
  subtotal: 100,
  taxRate: 0,
  taxAmount: 0,
  totalAmount: 100,
  cost: 100,
  invoiceNumber: 'INV-1',
  partItems: [],
  laborItems: [{ description: 'Work', hours: 1, rate: 100, total: 100 }],
  customer: { name: 'Alex Carter', email: null, phone: null, address: null, company: null },
  vehicle: {
    make: 'Volvo',
    model: 'FH',
    year: 2019,
    vin: null,
    licensePlate: 'AB 12345',
    mileage: 12845,
    meterReadings: READINGS,
    customer: null,
  },
} as unknown as InvoiceData

const bare = {
  ...invoiceData,
  vehicle: { ...invoiceData.vehicle, meterReadings: [] },
} as unknown as InvoiceData

const quoteOf = (data: InvoiceData) =>
  ({
    ...(data as unknown as Record<string, unknown>),
    quoteNumber: 'Q-1',
    status: 'draft',
    createdAt: new Date('2026-09-26'),
    validUntil: null,
    notes: null,
    discountType: null,
    discountValue: 0,
    discountAmount: 0,
  }) as never

const job = {
  orderNumber: '1',
  statusLabel: 'Open',
  concerns: [],
  printedAt: new Date('2026-09-26T00:00:00Z'),
} as never

/** The layout as the designer saves it with the meter line switched on. */
function withMetersOn(layout: InvoiceLayoutConfig): InvoiceLayoutConfig {
  return {
    ...layout,
    version: DESIGNER_LAYOUT_VERSION,
    sections: layout.sections.map((section) =>
      section.id === 'vehicle'
        ? {
            ...section,
            visible: true,
            fields: (section.fields ?? []).map((field) =>
              field.id === 'meter_readings' ? { ...field, visible: true } : field
            ),
          }
        : section
    ),
  }
}

const locale = 'en-GB'
const invoiceSpec = (layoutConfig: InvoiceLayoutConfig, data: InvoiceData = invoiceData) =>
  JSON.stringify(buildInvoicePrintSpec({ data, locale, template: { layoutConfig } as never }))
const quoteSpec = (layoutConfig: InvoiceLayoutConfig, data: InvoiceData = invoiceData) =>
  JSON.stringify(buildQuotePrintSpec({ data: quoteOf(data), locale, layoutConfig }))
const workOrderSpec = (layoutConfig: InvoiceLayoutConfig, data: InvoiceData = invoiceData) =>
  JSON.stringify(
    buildWorkOrderPrintSpec({ data, job, locale, template: { layoutConfig } as never })
  )

const ENGINE = 'Engine hours: 4,256.7\u00a0hrs'

describe('printing meter readings', () => {
  it('is an opt-in field of the vehicle block, never a grandfathered one', () => {
    expect(isOptInField('vehicle', 'meter_readings')).toBe(true)
    expect(Object.values(GRANDFATHERED_FIELDS).flat()).not.toContain('meter_readings')
  })

  it('is off in every default layout that lists the vehicle’s lines', () => {
    for (const type of ['invoice', 'work_order', 'certificate'] as const) {
      const vehicle = getDefaultLayout(type).sections.find((s) => s.id === 'vehicle')
      const field = vehicle?.fields?.find((f) => f.id === 'meter_readings')
      if (vehicle?.fields) expect(field?.visible, type).toBe(false)
    }
  })

  it('prints the same sheet with readings as without, on every default and starting point', () => {
    for (const layout of [getDefaultInvoiceLayout(), ...layoutPresets.map(buildLayoutFromPreset)]) {
      expect(invoiceSpec(layout)).toBe(invoiceSpec(layout, bare))
      expect(quoteSpec(layout)).toBe(quoteSpec(layout, bare))
    }
    for (const layout of [
      getDefaultLayout('work_order'),
      ...workOrderPresets.map(buildLayoutFromPreset),
    ]) {
      expect(workOrderSpec(layout)).toBe(workOrderSpec(layout, bare))
    }
  })

  it('stays off in a design saved before it existed, with every vehicle line on', () => {
    for (const layout of [getDefaultInvoiceLayout(), getDefaultLayout('work_order')]) {
      const saved = {
        ...layout,
        version: DESIGNER_LAYOUT_VERSION,
        sections: layout.sections.map((s) =>
          s.id === 'vehicle'
            ? {
                ...s,
                visible: true,
                fields: s.fields
                  ?.filter((f) => f.id !== 'meter_readings')
                  .map((f) => ({ ...f, visible: true })),
              }
            : s
        ),
      }
      const merged = mergeWithDefaults(saved)
      const vehicle = merged.sections.find((s) => s.id === 'vehicle')
      expect(vehicle?.fields?.find((f) => f.id === 'meter_readings')?.visible).toBe(false)
      expect(invoiceSpec(merged)).toBe(invoiceSpec(merged, bare))
    }
  })

  it('stays off in a vehicle block that never listed its lines', () => {
    const vehicle = getDefaultInvoiceLayout().sections.find((s) => s.id === 'vehicle')
    if (!vehicle) throw new Error('no vehicle section')
    const { fields: _fields, ...unlisted } = vehicle
    expect(sectionFields(unlisted)).not.toContain('meter_readings')
  })

  it('prints one line per meter on the invoice, the quote and the work order once placed', () => {
    for (const spec of [
      invoiceSpec(withMetersOn(getDefaultInvoiceLayout())),
      quoteSpec(withMetersOn(getDefaultInvoiceLayout())),
      workOrderSpec(withMetersOn(getDefaultLayout('work_order'))),
    ]) {
      expect(spec).toContain(`${ENGINE}\\nPTO hours: 2,984.3\u00a0hrs`)
    }
    // The odometer prints as it always has, beside them, where the job has a reading.
    expect(invoiceSpec(withMetersOn(getDefaultInvoiceLayout()))).toContain('12,845')
  })

  it('prints in the document’s number format', () => {
    const spec = JSON.stringify(
      buildInvoicePrintSpec({
        data: invoiceData,
        locale: 'nb-NO',
        template: { layoutConfig: withMetersOn(getDefaultInvoiceLayout()) } as never,
      })
    )
    expect(spec).toContain('Engine hours: 4\u00a0256,7\u00a0hrs')
  })

  it('prints nothing for a vehicle without readings, rather than a caption', () => {
    expect(invoiceSpec(withMetersOn(getDefaultInvoiceLayout()), bare)).not.toContain('Engine hours')
  })
})

describe('the designer’s sample', () => {
  const sample = (meterTypes?: { name: string; unit: string }[]) =>
    buildSampleData(
      {
        name: 'Shop',
        address: '',
        phone: '',
        email: '',
        slogan: '',
        paymentTerms: '',
        logoUrl: '',
        meterTypes,
      } as never,
      [],
      ((key: string) => key) as never,
      {},
      'invoice'
    ).fields.meter_readings

  it('reads each of the workshop’s meters, and nothing for a workshop without', () => {
    expect(sample()).toBe('')
    expect(sample([{ name: 'Engine hours', unit: 'hrs' }])).toBe('Engine hours: 4,256.7 hrs')
  })
})

describe('the technician app', () => {
  it('is told the server has meters, and no name it knew is gone', () => {
    expect(TECH_API_FEATURES).toContain('vehicle-meters')
    expect(TECH_API_FEATURES).toEqual(
      expect.arrayContaining([
        'job-video',
        'checkin',
        'job-documents',
        'job-reference',
        'vehicle-fleet-number',
      ])
    )
  })
})
