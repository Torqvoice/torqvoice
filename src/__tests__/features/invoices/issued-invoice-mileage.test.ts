// @vitest-environment node
/**
 * The mileage line on an invoice, draft and issued.
 *
 * The line prints the job's own reading. A draft follows the job. An issued
 * invoice keeps the reading it went out with: the check-in on a phone, or a
 * later save of the job, can change the reading afterwards and must not
 * rewrite paper a customer holds. An invoice issued before the reading was
 * kept has none stored and goes on printing the job's, as it always did.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const db = {
  serviceRecord: { findUnique: vi.fn() },
  appSetting: { findMany: vi.fn() },
  organization: { findUnique: vi.fn() },
  vehicleFinding: { findMany: vi.fn() },
  documentDesign: { findFirst: vi.fn() },
}
vi.mock('@/lib/db', () => ({ db }))
vi.mock('@/features/custom-fields/Lib/getCustomFieldsForPrint', () => ({
  getCustomFieldsForPrint: async () => [],
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
const { buildInvoicePrintSpec } = await import('@/features/invoice-designer/Pdf/buildInvoicePrint')

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

/** Every word the sheet prints, which is where the mileage line is looked for. */
const sheet = (assembly: any) =>
  JSON.stringify(
    buildInvoicePrintSpec({
      data: assembly.data,
      template: assembly.template,
      invoiceSettings: assembly.invoiceSettings,
    })
  )

const ISSUED_AT = new Date('2026-09-25T10:00:00Z')

/** Issues the job as it prints now, and returns the record that leaves behind. */
async function issue(job: Record<string, unknown> = {}) {
  db.serviceRecord.findUnique.mockResolvedValue(record(job))
  const live = await assembleInvoicePrint('rec-1', { mode: 'live', inspectionResults: 'rows' })
  // Through JSON, as the column stores it.
  const issuedData = JSON.parse(JSON.stringify(buildIssuedInvoiceData(live!)))
  return record({ ...job, issuedAt: ISSUED_AT, issuedData })
}

beforeEach(() => {
  vi.clearAllMocks()
  db.organization.findUnique.mockResolvedValue({ name: 'Shop', portalSlug: null })
  db.vehicleFinding.findMany.mockResolvedValue([])
  db.documentDesign.findFirst.mockResolvedValue(null)
  db.appSetting.findMany.mockResolvedValue([{ key: 'workshop.unitSystem', value: 'metric' }])
})

describe('a draft invoice', () => {
  it("prints the job's reading as it stands", async () => {
    db.serviceRecord.findUnique.mockResolvedValue(record())
    expect(sheet(await assembleInvoicePrint('rec-1'))).toContain('Mileage: 84,120 km')

    db.serviceRecord.findUnique.mockResolvedValue(record({ mileage: 90500 }))
    expect(sheet(await assembleInvoicePrint('rec-1'))).toContain('Mileage: 90,500 km')
  })
})

describe('an issued invoice', () => {
  it('keeps the reading it was issued with after the job is given another', async () => {
    const issued = await issue()

    // The technician corrects the reading at check-in after the invoice went out.
    db.serviceRecord.findUnique.mockResolvedValue({ ...issued, mileage: 90500 })
    const assembly = await assembleInvoicePrint('rec-1')

    expect(assembly?.issuedAt).toEqual(ISSUED_AT)
    expect(assembly?.data.mileage).toBe(84120)
    expect(sheet(assembly)).toContain('Mileage: 84,120 km')
    expect(sheet(assembly)).not.toContain('90,500')
  })

  it('keeps the unit it was issued with too', async () => {
    const issued = await issue()
    db.serviceRecord.findUnique.mockResolvedValue({ ...issued, mileage: 90500 })
    db.appSetting.findMany.mockResolvedValue([{ key: 'workshop.unitSystem', value: 'imperial' }])

    expect(sheet(await assembleInvoicePrint('rec-1'))).toContain('Mileage: 84,120 km')
  })

  it('goes on printing no line when it was issued without a reading', async () => {
    const issued = await issue({ mileage: null })
    expect(issued.issuedData.jobMileage).toBeNull()

    db.serviceRecord.findUnique.mockResolvedValue({ ...issued, mileage: 90500 })
    const assembly = await assembleInvoicePrint('rec-1')

    expect(assembly?.data.mileage).toBeNull()
    expect(sheet(assembly)).not.toContain('Mileage:')
  })

  it('prints the job as it stands again once an owner has reopened it', async () => {
    const issued = await issue()
    db.serviceRecord.findUnique.mockResolvedValue({
      ...issued,
      mileage: 90500,
      editUnlockedAt: new Date('2026-09-26T10:00:00Z'),
    })

    expect(sheet(await assembleInvoicePrint('rec-1'))).toContain('Mileage: 90,500 km')
  })

  it("prints the job's reading as before when it was issued before the reading was kept", async () => {
    const issued = await issue()
    const { jobMileage: _dropped, ...before } = issued.issuedData
    expect(before.version).toBe(ISSUED_INVOICE_VERSION)

    db.serviceRecord.findUnique.mockResolvedValue({
      ...issued,
      issuedData: before,
      mileage: 90500,
    })
    const assembly = await assembleInvoicePrint('rec-1')

    // Still the issued sheet, with the one line following the job as it did.
    expect(assembly?.issuedAt).toEqual(ISSUED_AT)
    expect(sheet(assembly)).toContain('Mileage: 90,500 km')
  })
})

describe('the work order', () => {
  it('reads the job as it stands, issued or not', async () => {
    const issued = await issue()
    db.serviceRecord.findUnique.mockResolvedValue({ ...issued, mileage: 90500 })

    const live = await assembleInvoicePrint('rec-1', { mode: 'live', inspectionResults: 'none' })
    expect(live?.data.mileage).toBe(90500)
  })
})
