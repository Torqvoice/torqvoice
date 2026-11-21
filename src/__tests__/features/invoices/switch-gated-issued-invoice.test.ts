/**
 * @vitest-environment node
 *
 * The Reference / PO, the fleet number and the meter readings show on a
 * design unless it says not, because their workshop switch decides whether
 * they print. Two things keep that from changing a sheet nobody asked to
 * change: the switch, which keeps the value out of the invoice's data, and
 * the issued copy, which keeps printing what it went out with. The work
 * order is assembled from the same live rows, so the same switches hold it.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const db = {
  serviceRecord: { findUnique: vi.fn() },
  serviceConcern: { findMany: vi.fn(async () => []) },
  vehicle: { findFirst: vi.fn(async () => ({ bodyType: null })) },
  appSetting: { findMany: vi.fn() },
  organization: { findUnique: vi.fn() },
  vehicleFinding: { findMany: vi.fn() },
  documentDesign: { findFirst: vi.fn() },
}
const meterReadings = vi.fn(async (): Promise<unknown[]> => [])
vi.mock('@/features/meters/Lib/meters.server', () => ({
  printableMeterReadings: (...args: unknown[]) => meterReadings(...(args as [])),
  activeMeterTypes: async () => [],
}))
vi.mock('@/features/equipment/Lib/equipmentPrint.server', () => ({
  NO_EQUIPMENT: { job: [], vehicle: [] },
  printableEquipment: async () => ({ job: [], vehicle: [] }),
}))
vi.mock('@/lib/db', () => ({ db }))
vi.mock('@/lib/features', () => ({ getFeatures: vi.fn(async () => ({ customFields: true })) }))
vi.mock('@/features/custom-fields/Lib/getCustomFieldsForPrint', () => ({
  getCustomFieldsForPrint: async () => [],
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
  loadVehicleConditionMarks: async () => [],
}))
vi.mock('@/features/inspections/Lib/linkedInspectionResults.server', () => ({
  inspectionResultsFor: async () => null,
}))
vi.mock('@/features/invoice-designer/Lib/vehiclePhoto.server', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  vehiclePhotoForDocument: async () => undefined,
}))
vi.mock('@/lib/qr', () => ({ generateQrDataUri: async () => 'data:image/png;base64,' }))
vi.mock('@/lib/app-url', () => ({ getAppBaseUrl: () => 'https://app.example' }))

const { assembleInvoicePrint } = await import('@/features/invoices/Lib/assembleInvoicePrint')
const { buildIssuedInvoiceData } = await import('@/features/invoices/Lib/issueInvoice')
const { buildInvoicePrintSpec } = await import('@/features/invoice-designer/Pdf/buildInvoicePrint')
const { assembleWorkOrderPrint } = await import('@/features/invoices/Lib/assembleWorkOrderPrint')
const { buildWorkOrderPrintSpec } = await import(
  '@/features/invoice-designer/Pdf/buildWorkOrderPrint'
)
const { getDefaultInvoiceLayout, mergeWithDefaults } = await import(
  '@/features/settings/Schema/invoiceLayoutSchema'
)
const { getFeatures } = await import('@/lib/features')

/* eslint-disable @typescript-eslint/no-explicit-any */

const record = (over: Record<string, unknown> = {}): any => ({
  id: 'rec-1',
  organizationId: 'org-1',
  vehicleId: 'veh-1',
  customerId: 'cust-1',
  inspectionId: null,
  designId: null,
  title: 'Service',
  type: 'maintenance',
  serviceDate: new Date('2026-09-24T09:00:00Z'),
  invoiceNumber: '2026-0042',
  mileage: 84120,
  subtotal: 100,
  taxRate: 0,
  taxAmount: 0,
  totalAmount: 100,
  cost: 100,
  discountValue: 0,
  manuallyPaid: false,
  conditionMapOnInvoice: null,
  techName: null,
  customerReference: 'PO-48213',
  issuedAt: null,
  issuedData: null,
  editUnlockedAt: null,
  partItems: [],
  laborItems: [{ description: 'Oil change', hours: 1, rate: 100, total: 100 }],
  attachments: [],
  payments: [],
  technician: null,
  customer: { name: 'Alex Carter', invoiceDesignId: null },
  vehicle: {
    customerId: 'cust-1',
    make: 'Volvo',
    model: 'FH',
    year: 2020,
    vin: null,
    licensePlate: 'AB 12345',
    hsn: null,
    tsn: null,
    fleetNumber: 'T-208',
    mileage: 84120,
    customer: null,
  },
  issuedDesignSnapshot: null,
  issuedLogoSnapshot: null,
  issuedSignatureSnapshot: null,
  createdBy: { id: 'user-1', name: 'Kari' },
  ...over,
})

const REFERENCE_ON = { key: 'documents.customerReferenceEnabled', value: 'true' }
const FLEET_ON = { key: 'vehicle.fleetNumberEnabled', value: 'true' }
const ENGINE = { name: 'Engine hours', unit: 'hrs', value: 4256.7 }
const ISSUED_AT = new Date('2026-09-25T10:00:00Z')
const labels = { customerReference: 'Your reference / PO', fleetNumber: 'Fleet no.' }

/** A layout as it was frozen before the three fields existed: every default written out, none of them. */
function frozenBeforeTheFields() {
  const layout = mergeWithDefaults(getDefaultInvoiceLayout())
  return {
    ...layout,
    sections: layout.sections.map((s) =>
      s.fields
        ? {
            ...s,
            fields: s.fields.filter(
              (f) => !['customer_reference', 'fleet_number', 'meter_readings'].includes(f.id)
            ),
          }
        : s
    ),
  }
}

/** The sheet an assembly prints, as text. */
function printed(assembly: Awaited<ReturnType<typeof assembleInvoicePrint>>): string {
  if (!assembly) throw new Error('no assembly')
  return JSON.stringify(
    buildInvoicePrintSpec({ data: assembly.data, labels, template: assembly.template } as never)
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  db.organization.findUnique.mockResolvedValue({ name: 'Shop', portalSlug: null })
  db.vehicleFinding.findMany.mockResolvedValue([])
  db.documentDesign.findFirst.mockResolvedValue(null)
  db.appSetting.findMany.mockResolvedValue([REFERENCE_ON, FLEET_ON])
  vi.mocked(getFeatures).mockResolvedValue({ customFields: true } as never)
  meterReadings.mockResolvedValue([ENGINE])
})

describe('a draft invoice, on the default design', () => {
  it('prints the reference, the fleet number and the readings for a workshop with them on', async () => {
    db.serviceRecord.findUnique.mockResolvedValue(record())
    const sheet = printed(await assembleInvoicePrint('rec-1'))
    expect(sheet).toContain('Your reference / PO: PO-48213')
    expect(sheet).toContain('Fleet no.: T-208')
    expect(sheet).toContain('Engine hours')
  })

  it('prints none of them for a workshop with the switches off and no meters', async () => {
    db.appSetting.findMany.mockResolvedValue([])
    meterReadings.mockResolvedValue([])
    db.serviceRecord.findUnique.mockResolvedValue(record())
    const assembly = await assembleInvoicePrint('rec-1')
    expect(assembly?.data.customerReference ?? null).toBeNull()
    expect(assembly?.data.vehicle?.fleetNumber ?? null).toBeNull()
    const sheet = printed(assembly)
    for (const text of ['PO-48213', 'Your reference', 'T-208', 'Fleet no.', 'Engine hours']) {
      expect(sheet).not.toContain(text)
    }
    // The same sheet as a job that never had any of them.
    db.serviceRecord.findUnique.mockResolvedValue(
      record({ customerReference: null, vehicle: { ...record().vehicle, fleetNumber: null } })
    )
    expect(sheet).toBe(printed(await assembleInvoicePrint('rec-1')))
  })

  it('prints none of them on a plan without custom fields, whatever the switches still say', async () => {
    vi.mocked(getFeatures).mockResolvedValue({ customFields: false } as never)
    db.serviceRecord.findUnique.mockResolvedValue(record())
    const assembly = await assembleInvoicePrint('rec-1')
    expect(assembly?.data.customerReference ?? null).toBeNull()
    expect(assembly?.data.vehicle?.fleetNumber ?? null).toBeNull()
  })
})

describe('an invoice issued before the fields existed', () => {
  /** Issued from a design frozen without the fields, with no number or readings in its data. */
  async function issuedBefore() {
    db.serviceRecord.findUnique.mockResolvedValue(record({ customerReference: null }))
    const live = await assembleInvoicePrint('rec-1', { mode: 'live', inspectionResults: 'rows' })
    const data = JSON.parse(JSON.stringify(buildIssuedInvoiceData(live!)))
    const { fleetNumber: _n, meterReadings: _m, ...vehicleBefore } = data.vehicle
    return record({
      issuedAt: ISSUED_AT,
      issuedData: { ...data, vehicle: vehicleBefore },
      issuedDesignSnapshot: { layout: frozenBeforeTheFields(), template: {} },
    })
  }

  it('gains no line when the workshop turns everything on and types a reference afterwards', async () => {
    const issued = await issuedBefore()
    db.serviceRecord.findUnique.mockResolvedValue({ ...issued, customerReference: null })
    const asSent = printed(await assembleInvoicePrint('rec-1'))

    // Later: the switches are on (beforeEach) and the job gets its PO.
    db.serviceRecord.findUnique.mockResolvedValue({ ...issued, customerReference: 'PO-48213' })
    const assembly = await assembleInvoicePrint('rec-1')
    const customer = assembly?.layoutConfig.sections.find((s) => s.id === 'customer')
    expect(customer?.fields?.find((f) => f.id === 'customer_reference')?.visible).toBe(false)
    const reprint = printed(assembly)
    expect(reprint).not.toContain('PO-48213')
    expect(reprint).not.toContain('T-208')
    expect(reprint).not.toContain('Engine hours')
    expect(reprint).toBe(asSent)
  })

  it('still prints a reference that its frozen design did place', async () => {
    const issued = await issuedBefore()
    const layout = frozenBeforeTheFields()
    db.serviceRecord.findUnique.mockResolvedValue({
      ...issued,
      issuedDesignSnapshot: {
        layout: {
          ...layout,
          sections: layout.sections.map((s) =>
            s.id === 'customer'
              ? { ...s, fields: [...(s.fields ?? []), { id: 'customer_reference', visible: true }] }
              : s
          ),
        },
        template: {},
      },
    })
    expect(printed(await assembleInvoicePrint('rec-1'))).toContain('Your reference / PO: PO-48213')
  })
})

describe('the work order, on its default design', () => {
  /** The work order sheet as text. */
  async function workOrder() {
    const assembly = await assembleWorkOrderPrint('rec-1')
    if (!assembly) throw new Error('no assembly')
    const sheet = JSON.stringify(
      buildWorkOrderPrintSpec({
        data: assembly.data,
        job: { ...assembly.job, statusLabel: 'Open' },
        labels,
        template: assembly.template,
      } as never)
    )
    return { data: assembly.data, sheet }
  }

  it('prints the reference, the fleet number and the reading for a workshop with them on', async () => {
    db.serviceRecord.findUnique.mockResolvedValue(record({ helpers: [] }))
    const { sheet } = await workOrder()
    expect(sheet).toContain('Your reference / PO: PO-48213')
    expect(sheet).toContain('Fleet no.: T-208')
    expect(sheet).toContain('Engine hours')
  })

  it('carries and prints none of them with the switches off and no meters', async () => {
    db.appSetting.findMany.mockResolvedValue([])
    meterReadings.mockResolvedValue([])
    db.serviceRecord.findUnique.mockResolvedValue(record({ helpers: [] }))
    const { data, sheet } = await workOrder()
    expect(data.customerReference ?? null).toBeNull()
    expect(data.vehicle?.fleetNumber ?? null).toBeNull()
    for (const text of ['PO-48213', 'Your reference', 'T-208', 'Fleet no.', 'Engine hours']) {
      expect(sheet).not.toContain(text)
    }
  })

  it('carries none of them on a plan without custom fields, whatever the switches say', async () => {
    vi.mocked(getFeatures).mockResolvedValue({ customFields: false } as never)
    db.serviceRecord.findUnique.mockResolvedValue(record({ helpers: [] }))
    const { data } = await workOrder()
    expect(data.customerReference ?? null).toBeNull()
    expect(data.vehicle?.fleetNumber ?? null).toBeNull()
  })
})
