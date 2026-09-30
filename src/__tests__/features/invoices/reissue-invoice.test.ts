/**
 * Updating a sent invoice to today's details.
 *
 * Sending never re-captures an issued invoice, which is right for the paper
 * a customer holds and wrong for the address corrected after it went out.
 * The refresh is the deliberate act that re-captures: it reads everything
 * again, dates the issue to now, and refuses a draft, which prints live
 * already. The action around it is an owner's or admin's call.
 */

import { it, expect, vi, beforeEach } from 'vitest'

const serviceRecord = { findFirst: vi.fn(), update: vi.fn() }
vi.mock('@/lib/db', () => ({ db: { serviceRecord } }))

const assembleInvoicePrint = vi.fn()
vi.mock('@/features/invoices/Lib/assembleInvoicePrint', () => ({
  assembleInvoicePrint: (...args: unknown[]) => assembleInvoicePrint(...args),
}))
vi.mock('@/features/invoice-designer/Lib/designSnapshots', () => ({
  ensureDesignSnapshot: vi.fn().mockResolvedValue('design-snap'),
  ensureAssetSnapshot: vi.fn().mockResolvedValue('asset-snap'),
}))
vi.mock('@/features/integrations/Lib/events', () => ({ notifyIntegrations: vi.fn() }))

let isAdmin = true
vi.mock('@/lib/with-auth', () => ({
  withAuth: async (fn: (ctx: { organizationId: string; isAdmin: boolean }) => Promise<unknown>) => {
    try {
      return { success: true, data: await fn({ organizationId: 'org-1', isAdmin }) }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  },
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/document-lock.server', () => ({ assertInvoiceEditable: vi.fn() }))
vi.mock('@/features/invoices/Lib/reapplyDesign', () => ({
  ISSUED_WHERE: vi.fn(),
  issuedDesignState: vi.fn(),
  reapplyDesign: vi.fn(),
}))

const { reissueInvoice } = await import('@/features/invoices/Lib/issueInvoice')
const { refreshIssuedInvoice } = await import('@/features/invoices/Actions/invoiceDesignActions')

const assembly = {
  workshop: { name: 'Shop', address: 'New street 1', phone: '', email: '' },
  invoiceSettings: {},
  serviceType: 'automotive',
  taxLabel: 'VAT',
  designSource: { layout: {}, template: {} },
  logoDataUri: 'data:image/png;base64,AAA',
  signer: { name: 'Ola', dataUri: undefined },
  data: {
    customer: { name: 'Kari', address: 'Moved 2' },
    vehicle: {
      make: 'BMW',
      model: '5',
      year: 2011,
      vin: null,
      licensePlate: 'BS48364',
      hsn: '0005',
      tsn: 'ABC',
      mileage: 1,
    },
    findings: [],
    customFields: [],
  },
}

const issuedLastWeek = new Date('2026-09-19T10:00:00Z')

beforeEach(() => {
  vi.clearAllMocks()
  isAdmin = true
  serviceRecord.update.mockResolvedValue({})
  assembleInvoicePrint.mockResolvedValue(assembly)
})

it("captures today's rows again and dates the issue to now", async () => {
  serviceRecord.findFirst.mockResolvedValue({ id: 'rec-1', issuedAt: issuedLastWeek })
  const before = Date.now()

  expect(await reissueInvoice('rec-1', 'org-1')).toBe(true)

  expect(assembleInvoicePrint).toHaveBeenCalledWith('rec-1', { mode: 'live' })
  const data = serviceRecord.update.mock.calls[0]?.[0]?.data
  expect(data.issuedAt.getTime()).toBeGreaterThanOrEqual(before)
  expect(data.issuedDesignSnapshotId).toBe('design-snap')
  expect(data.issuedLogoSnapshotId).toBe('asset-snap')
  expect(data.issuedData.workshop.address).toBe('New street 1')
  expect(data.issuedData.customer.address).toBe('Moved 2')
  expect(data.issuedData.vehicle).toMatchObject({ hsn: '0005', tsn: 'ABC' })
})

it('refuses a draft, which prints live already', async () => {
  serviceRecord.findFirst.mockResolvedValue({ id: 'rec-1', issuedAt: null })

  expect(await reissueInvoice('rec-1', 'org-1')).toBe(false)
  expect(assembleInvoicePrint).not.toHaveBeenCalled()
  expect(serviceRecord.update).not.toHaveBeenCalled()
})

it('is an owner or admin action on the page', async () => {
  serviceRecord.findFirst.mockResolvedValue({
    id: 'rec-1',
    vehicleId: 'veh-1',
    invoiceNumber: '2026-1071',
    issuedAt: issuedLastWeek,
  })

  isAdmin = false
  const refused = await refreshIssuedInvoice('rec-1')
  expect(refused.success).toBe(false)
  expect(serviceRecord.update).not.toHaveBeenCalled()

  isAdmin = true
  const done = await refreshIssuedInvoice('rec-1')
  expect(done).toMatchObject({
    success: true,
    data: { recordId: 'rec-1', reference: '2026-1071' },
  })
  expect(serviceRecord.update).toHaveBeenCalledTimes(1)
})

it('tells an unsent invoice apart from one that could not be assembled', async () => {
  serviceRecord.findFirst.mockResolvedValue({
    id: 'rec-1',
    vehicleId: null,
    invoiceNumber: null,
    issuedAt: null,
  })
  const unsent = await refreshIssuedInvoice('rec-1')
  expect(unsent).toMatchObject({ success: false, error: 'This invoice has not been sent yet' })
})
