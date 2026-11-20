/**
 * @vitest-environment node
 *
 * An issued invoice is the sheet the customer was given. The vehicle's fleet
 * number and the vehicle's and customer's own fields are frozen with it, and
 * an invoice issued before they existed never borrows today's.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const db = {
  serviceRecord: { findUnique: vi.fn() },
  appSetting: { findMany: vi.fn() },
  organization: { findUnique: vi.fn() },
  vehicleFinding: { findMany: vi.fn() },
  documentDesign: { findFirst: vi.fn() },
}
const recordFields = vi.fn(async (): Promise<unknown[]> => [])
// The job's meter readings, as the workshop's meters give them.
const meterReadings = vi.fn(async (): Promise<unknown[]> => [])
vi.mock('@/features/meters/Lib/meters.server', () => ({
  printableMeterReadings: (...args: unknown[]) => meterReadings(...(args as [])),
  activeMeterTypes: async () => [],
}))
vi.mock('@/lib/db', () => ({ db }))
vi.mock('@/lib/features', () => ({ getFeatures: vi.fn(async () => ({ customFields: true })) }))
vi.mock('@/features/custom-fields/Lib/getCustomFieldsForPrint', () => ({
  getCustomFieldsForPrint: async () => [],
  getRecordCustomFieldsForPrint: (...args: unknown[]) => recordFields(...(args as [])),
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

const { assembleInvoicePrint } = await import('@/features/invoices/Lib/assembleInvoicePrint')
const { buildIssuedInvoiceData } = await import('@/features/invoices/Lib/issueInvoice')
const { ISSUED_INVOICE_VERSION } = await import('@/features/invoices/Lib/issuedInvoice')
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

const SWITCH_ON = { key: 'vehicle.fleetNumberEnabled', value: 'true' }
const TACHO = { fieldId: 'cf1', label: 'Tachograph due', value: 'March', fieldType: 'text' }
const ISSUED_AT = new Date('2026-09-25T10:00:00Z')

async function issue() {
  db.serviceRecord.findUnique.mockResolvedValue(record())
  const live = await assembleInvoicePrint('rec-1', { mode: 'live', inspectionResults: 'rows' })
  const issuedData = JSON.parse(JSON.stringify(buildIssuedInvoiceData(live!)))
  return record({ issuedAt: ISSUED_AT, issuedData })
}

beforeEach(() => {
  vi.clearAllMocks()
  db.organization.findUnique.mockResolvedValue({ name: 'Shop', portalSlug: null })
  db.vehicleFinding.findMany.mockResolvedValue([])
  db.documentDesign.findFirst.mockResolvedValue(null)
  db.appSetting.findMany.mockResolvedValue([SWITCH_ON])
  vi.mocked(getFeatures).mockResolvedValue({ customFields: true } as never)
  recordFields.mockResolvedValue([TACHO])
})

describe('a draft invoice', () => {
  it('carries the fleet number and the record’s own fields for a workshop that uses them', async () => {
    db.serviceRecord.findUnique.mockResolvedValue(record())
    const assembly = await assembleInvoicePrint('rec-1')
    expect(assembly?.data.vehicle?.fleetNumber).toBe('T-208')
    expect(assembly?.data.recordCustomFields).toEqual([TACHO])
    // Asked for this job's own vehicle and customer, in this workshop.
    expect(recordFields).toHaveBeenCalledWith('org-1', {
      vehicleId: 'veh-1',
      customerId: 'cust-1',
    })
  })

  it('carries no fleet number while the switch is off, whatever the vehicle holds', async () => {
    db.appSetting.findMany.mockResolvedValue([])
    db.serviceRecord.findUnique.mockResolvedValue(record())
    expect((await assembleInvoicePrint('rec-1'))?.data.vehicle?.fleetNumber ?? null).toBeNull()
  })

  it('carries none on a plan without custom fields, whatever the switch still says', async () => {
    vi.mocked(getFeatures).mockResolvedValue({ customFields: false } as never)
    db.serviceRecord.findUnique.mockResolvedValue(record())
    expect((await assembleInvoicePrint('rec-1'))?.data.vehicle?.fleetNumber ?? null).toBeNull()
  })
})

describe('an issued invoice', () => {
  it('keeps what it was issued with after the vehicle is renumbered and the fields change', async () => {
    const issued = await issue()
    expect(issued.issuedData.version).toBe(ISSUED_INVOICE_VERSION)

    db.serviceRecord.findUnique.mockResolvedValue({
      ...issued,
      vehicle: { ...issued.vehicle, fleetNumber: 'T-999' },
    })
    recordFields.mockResolvedValue([{ ...TACHO, value: 'June' }])
    const assembly = await assembleInvoicePrint('rec-1')

    expect(assembly?.issuedAt).toEqual(ISSUED_AT)
    expect(assembly?.data.vehicle?.fleetNumber).toBe('T-208')
    expect(assembly?.data.recordCustomFields).toEqual([expect.objectContaining(TACHO)])
  })

  it('keeps them after the workshop switches the field off', async () => {
    const issued = await issue()
    db.appSetting.findMany.mockResolvedValue([])
    db.serviceRecord.findUnique.mockResolvedValue(issued)

    expect((await assembleInvoicePrint('rec-1'))?.data.vehicle?.fleetNumber).toBe('T-208')
  })

  it('issued before they existed prints none, and never borrows today’s', async () => {
    const issued = await issue()
    const { recordCustomFields: _fields, ...before } = issued.issuedData
    const { fleetNumber: _number, ...vehicleBefore } = before.vehicle
    db.serviceRecord.findUnique.mockResolvedValue({
      ...issued,
      issuedData: { ...before, vehicle: vehicleBefore },
    })

    const assembly = await assembleInvoicePrint('rec-1')
    expect(assembly?.issuedAt).toEqual(ISSUED_AT)
    expect(assembly?.data.vehicle?.fleetNumber ?? null).toBeNull()
    expect(assembly?.data.recordCustomFields ?? []).toEqual([])
  })
})

describe('meter readings on an issued invoice', () => {
  const ENGINE = { name: 'Engine hours', unit: 'hrs', value: 4256.7 }

  it('are read from this job, and frozen with what it was issued with', async () => {
    meterReadings.mockResolvedValue([ENGINE])
    const issued = await issue()
    expect(meterReadings).toHaveBeenCalledWith('org-1', { jobId: 'rec-1', vehicleId: 'veh-1' })

    // The reading is corrected on the job after the invoice went out.
    meterReadings.mockResolvedValue([{ ...ENGINE, value: 4300 }])
    db.serviceRecord.findUnique.mockResolvedValue(issued)
    const assembly = await assembleInvoicePrint('rec-1')

    expect(assembly?.data.vehicle?.meterReadings).toEqual([ENGINE])
  })

  it('issued before meters existed prints none, and never borrows today’s', async () => {
    meterReadings.mockResolvedValue([ENGINE])
    const issued = await issue()
    const { meterReadings: _frozen, ...vehicleBefore } = issued.issuedData.vehicle
    db.serviceRecord.findUnique.mockResolvedValue({
      ...issued,
      issuedData: { ...issued.issuedData, vehicle: vehicleBefore },
    })

    expect((await assembleInvoicePrint('rec-1'))?.data.vehicle?.meterReadings).toEqual([])
  })
})
