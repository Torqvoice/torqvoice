/**
 * What the portal's shared reads hand the pages: a vehicle the workshop
 * archived is gone for the customer, and an invoice in the list carries the
 * day it is due, so the page needs no second lookup.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

const vehicles = [
  { id: 'kept', customerId: 'c1', organizationId: 'org1', isArchived: false },
  { id: 'archived', customerId: 'c1', organizationId: 'org1', isArchived: true },
  { id: 'theirs', customerId: 'c2', organizationId: 'org1', isArchived: false },
]

// The Reference / PO field is off here, as it is for every workshop that has
// not asked for it; the rest of the module is the real one.
vi.mock('@/features/customer-reference/Lib/referenceSetting', async (original) => ({
  ...(await original<typeof import('@/features/customer-reference/Lib/referenceSetting')>()),
  isCustomerReferenceEnabled: vi.fn(async () => false),
  notAwaitingReference: vi.fn(async () => ({})),
  invoiceHeldFromCustomer: vi.fn(async () => false),
}))

vi.mock('@/lib/db', () => ({
  db: {
    vehicle: {
      findFirst: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
        const found = vehicles.find((row) =>
          Object.entries(where).every(([key, value]) => row[key as keyof typeof row] === value)
        )
        return found ? { ...found, make: 'Volvo', model: 'V60', soldReportedAt: null } : null
      }),
    },
    serviceRecord: { findMany: vi.fn(async () => []) },
  },
}))
vi.mock('@/lib/customer-session', () => ({
  getCustomerSession: vi.fn(async () => ({ customerId: 'c1', organizationId: 'org1' })),
}))
vi.mock('@/features/vehicles/Lib/typeKeySetting', () => ({
  gateTypeKey: (vehicle: unknown) => vehicle,
  isTypeKeyEnabled: async () => false,
}))

import { getPortalInvoices, getPortalVehicleDetail } from '@/features/portal/Actions/portalActions'
import { db } from '@/lib/db'

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
})

describe('one vehicle in the portal', () => {
  it("opens the customer's own vehicle", async () => {
    const result = await getPortalVehicleDetail('kept')
    expect(result.success).toBe(true)
    expect(result.data).toMatchObject({ id: 'kept', soldReportedAt: null })
  })

  it('does not find a vehicle the workshop archived', async () => {
    expect(await getPortalVehicleDetail('archived')).toEqual({
      success: false,
      error: 'Vehicle not found',
    })
  })

  it("does not find another customer's vehicle", async () => {
    expect((await getPortalVehicleDetail('theirs')).success).toBe(false)
  })
})

describe('the invoices in the portal', () => {
  it('carry the invoice date and the day they are due', async () => {
    await getPortalInvoices()
    const query = vi.mocked(db.serviceRecord.findMany).mock.calls[0][0]
    expect(query?.select).toMatchObject({ invoiceDate: true, invoiceDueDate: true })
    expect(query?.where).toMatchObject({ organizationId: 'org1', status: 'completed' })
  })
})
