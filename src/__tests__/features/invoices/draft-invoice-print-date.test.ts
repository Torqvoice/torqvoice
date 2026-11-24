// @vitest-environment node
/**
 * The date a draft invoice prints, in a workshop in Auckland.
 *
 * A draft is dated the day it is issued, so until then it prints the
 * workshop's today: the date it would go out with. An invoice sent or paid
 * before issuing tracked it is no draft and keeps printing the date it went
 * out with, never today's.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const db = {
  serviceRecord: { findUnique: vi.fn() },
  appSetting: { findMany: vi.fn() },
  organization: { findUnique: vi.fn() },
  vehicleFinding: { findMany: vi.fn() },
  documentDesign: { findFirst: vi.fn() },
}
// No meters in this workshop.
vi.mock('@/features/meters/Lib/meters.server', () => ({
  printableMeterReadings: async () => [],
  activeMeterTypes: async () => [],
}))
// What is fitted to the vehicle; none here.
vi.mock('@/features/equipment/Lib/equipmentPrint.server', () => ({
  NO_EQUIPMENT: { job: [], vehicle: [] },
  printableEquipment: async () => ({ job: [], vehicle: [] }),
}))
vi.mock('@/lib/db', () => ({ db }))
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
}))

const { assembleInvoicePrint } = await import('@/features/invoices/Lib/assembleInvoicePrint')

/* eslint-disable @typescript-eslint/no-explicit-any */

const record = (over: Record<string, unknown> = {}): any => ({
  id: 'rec-1',
  organizationId: 'org-1',
  vehicleId: 'veh-1',
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
    model: 'V60',
    year: 2020,
    vin: null,
    licensePlate: 'AB 12345',
    hsn: null,
    tsn: null,
    mileage: 84120,
    customer: null,
  },
  issuedDesignSnapshot: null,
  issuedLogoSnapshot: null,
  issuedSignatureSnapshot: null,
  createdBy: { id: 'user-1', name: 'Kari' },
  ...over,
})

// 12:30 UTC on 17 November is 01:30 on 18 November in Auckland.
const NOW = new Date('2026-11-17T12:30:00Z')
const AUCKLAND_NOV_18 = new Date('2026-11-17T11:00:00Z')

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  db.organization.findUnique.mockResolvedValue({ name: 'Shop', portalSlug: null })
  db.vehicleFinding.findMany.mockResolvedValue([])
  db.documentDesign.findFirst.mockResolvedValue(null)
  db.appSetting.findMany.mockResolvedValue([
    { key: 'workshop.timezone', value: 'Pacific/Auckland' },
  ])
})

afterEach(() => {
  vi.useRealTimers()
})

describe('the date an invoice prints before it is issued', () => {
  it("is the workshop's today on a draft", async () => {
    db.serviceRecord.findUnique.mockResolvedValue(record())
    const assembly = await assembleInvoicePrint('rec-1')
    expect(assembly?.data.invoiceDate).toEqual(AUCKLAND_NOV_18)
  })

  it('is a date somebody set on a draft', async () => {
    const chosen = new Date('2026-10-31T11:00:00Z')
    db.serviceRecord.findUnique.mockResolvedValue(record({ invoiceDate: chosen }))
    const assembly = await assembleInvoicePrint('rec-1')
    expect(assembly?.data.invoiceDate).toEqual(chosen)
  })

  it.each([
    ['sent', { sentAt: new Date('2026-09-25T01:00:00Z') }],
    ['marked paid', { manuallyPaid: true }],
    ['paid', { payments: [{ amount: 100, date: new Date('2026-09-25T01:00:00Z') }] }],
  ])('is never today on an invoice %s before issuing tracked it', async (_, over) => {
    db.serviceRecord.findUnique.mockResolvedValue(record({ invoiceDate: null, ...over }))
    const assembly = await assembleInvoicePrint('rec-1')
    expect(assembly?.data.invoiceDate).toBeNull()
  })
})
