/**
 * @vitest-environment node
 *
 * What the home action reads for the signed-in customer: only their own
 * records, and the optional parts (stored tyres, the chat) only when the
 * workshop has them on. A side read that fails costs a block, never the page.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('@/lib/db', () => ({
  db: {
    customer: { findFirst: vi.fn() },
    serviceRecord: { findMany: vi.fn(async () => []) },
    quote: { findMany: vi.fn(async () => []) },
    serviceRequest: { findMany: vi.fn(async () => []) },
    appointment: { findMany: vi.fn(async () => []) },
    vehicle: { findMany: vi.fn(async () => []) },
    tireSet: { findMany: vi.fn(async () => []) },
  },
}))
vi.mock('@/lib/customer-session', () => ({
  getCustomerSession: vi.fn(async () => ({ customerId: 'c1', organizationId: 'org1' })),
}))
vi.mock('@/lib/portal-slug', () => ({
  resolvePortalOrg: vi.fn(async () => ({ id: 'org1', name: 'Fjordside Auto' })),
}))
vi.mock('@/lib/workshop-timezone', () => ({ workshopTimeZone: vi.fn(async () => 'Europe/Oslo') }))
vi.mock('@/features/integrations/Lib/payments', () => ({
  offeredPaymentProviders: vi.fn(async () => []),
}))
vi.mock('@/features/portal/Lib/portalLook.server', () => ({ loadPortalLook: vi.fn() }))
vi.mock('@/features/portal/Lib/workshop.server', () => ({ loadPortalWorkshop: vi.fn() }))
vi.mock('@/features/portal/Lib/chat.server', () => ({ getPortalThreadPreview: vi.fn() }))

import { getPortalHome } from '@/features/portal/Actions/getPortalHome'
import { getPortalThreadPreview } from '@/features/portal/Lib/chat.server'
import { loadPortalLook } from '@/features/portal/Lib/portalLook.server'
import { DEFAULT_PORTAL_LOOK } from '@/features/portal/Lib/theme'
import { loadPortalWorkshop } from '@/features/portal/Lib/workshop.server'
import { getCustomerSession } from '@/lib/customer-session'
import { db } from '@/lib/db'
import { resolvePortalOrg } from '@/lib/portal-slug'
import { workshop } from './helpers/fixtures'

const storedSet = {
  id: 't1',
  season: 'summer',
  studded: false,
  brand: 'Michelin',
  model: 'Primacy 4',
  size: '225/60 R18',
  quantity: 4,
  withRims: false,
  checkedInAt: new Date('2026-10-21T08:00:00Z'),
  createdAt: new Date('2026-10-21T08:00:00Z'),
  vehicle: null,
  measurements: [
    { treadDepthMm: 5, measuredAt: new Date('2026-10-21T08:00:00Z'), movementId: 'm' },
  ],
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getCustomerSession).mockResolvedValue({ customerId: 'c1', organizationId: 'org1' })
  vi.mocked(resolvePortalOrg).mockResolvedValue({ id: 'org1', name: 'Fjordside Auto' })
  vi.mocked(db.customer.findFirst).mockResolvedValue({ name: 'Kari Nordmann' } as never)
  vi.mocked(db.tireSet.findMany).mockResolvedValue([storedSet] as never)
  vi.mocked(loadPortalLook).mockResolvedValue(DEFAULT_PORTAL_LOOK)
  vi.mocked(loadPortalWorkshop).mockResolvedValue({ ...workshop, marine: false })
  vi.mocked(getPortalThreadPreview).mockResolvedValue({ unread: 1, messages: [] })
})

describe('stored tyres on the home', () => {
  it('are not read, and not on the home, when the tyre hotel is off or hidden', async () => {
    vi.mocked(loadPortalLook).mockResolvedValue({ ...DEFAULT_PORTAL_LOOK, showTires: false })
    const result = await getPortalHome('fjordside')
    expect(result.success).toBe(true)
    expect(result.data?.tires).toBeNull()
    expect(db.tireSet.findMany).not.toHaveBeenCalled()
  })

  it("are the customer's own sets still in storage, when the workshop shows them", async () => {
    vi.mocked(loadPortalLook).mockResolvedValue({ ...DEFAULT_PORTAL_LOOK, showTires: true })
    const result = await getPortalHome('fjordside')
    expect(result.data?.tires).toHaveLength(1)
    expect(result.data?.tires?.[0]).toMatchObject({
      season: 'summer',
      brand: 'Michelin',
      size: '225/60 R18',
      treadDepthMm: 5,
    })
    const where = vi.mocked(db.tireSet.findMany).mock.calls[0][0]?.where
    expect(where).toMatchObject({
      organizationId: 'org1',
      status: 'stored',
      OR: [{ customerId: 'c1' }, { vehicle: { customerId: 'c1' } }],
    })
  })

  it('cost only their block when they cannot be read', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    vi.mocked(loadPortalLook).mockResolvedValue({ ...DEFAULT_PORTAL_LOOK, showTires: true })
    vi.mocked(db.tireSet.findMany).mockRejectedValue(new Error('db down'))
    const result = await getPortalHome('fjordside')
    expect(result.success).toBe(true)
    expect(result.data?.tires).toEqual([])
  })
})

describe('the chat on the home', () => {
  it("is the end of this customer's own thread and what they have not read", async () => {
    const result = await getPortalHome('fjordside')
    expect(getPortalThreadPreview).toHaveBeenCalledWith('org1', 'c1')
    expect(result.data?.messages).toEqual({ enabled: true, unread: 1, latest: [] })
  })

  it('is off, and not read, when the workshop turned it off', async () => {
    vi.mocked(loadPortalLook).mockResolvedValue({ ...DEFAULT_PORTAL_LOOK, messagesEnabled: false })
    const result = await getPortalHome('fjordside')
    expect(getPortalThreadPreview).not.toHaveBeenCalled()
    expect(result.data?.messages).toEqual({ enabled: false, unread: 0, latest: [] })
  })

  it('costs only itself when the thread cannot be read', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    vi.mocked(getPortalThreadPreview).mockRejectedValue(new Error('db down'))
    const result = await getPortalHome('fjordside')
    expect(result.success).toBe(true)
    expect(result.data?.messages).toEqual({ enabled: true, unread: 0, latest: [] })
  })
})

describe('whose home it is', () => {
  it('reads every list for the signed-in customer in their own workshop', async () => {
    await getPortalHome('fjordside')
    for (const call of vi.mocked(db.serviceRecord.findMany).mock.calls) {
      expect(JSON.stringify(call[0]?.where)).toContain('"organizationId":"org1"')
      expect(JSON.stringify(call[0]?.where)).toContain('"customerId":"c1"')
    }
    for (const model of [db.quote, db.serviceRequest, db.appointment, db.vehicle]) {
      expect(vi.mocked(model.findMany).mock.calls[0][0]?.where).toMatchObject({
        organizationId: 'org1',
        customerId: 'c1',
      })
    }
  })

  it('answers nothing to someone who is not signed in', async () => {
    vi.mocked(getCustomerSession).mockResolvedValue(null)
    const result = await getPortalHome('fjordside')
    expect(result.success).toBe(false)
    expect(db.customer.findFirst).not.toHaveBeenCalled()
  })

  it("refuses an address that is not the customer's own workshop", async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    vi.mocked(resolvePortalOrg).mockResolvedValue({ id: 'other', name: 'Other Garage' })
    const result = await getPortalHome('other-garage')
    expect(result.success).toBe(false)
    expect(db.serviceRecord.findMany).not.toHaveBeenCalled()
  })

  it('names the customer, and greets them by first name', async () => {
    const result = await getPortalHome('fjordside')
    expect(result.data).toMatchObject({
      customerName: 'Kari Nordmann',
      customerFirstName: 'Kari',
      workshop: { name: 'Fjordside Auto', openLine: 'Open until 17:00' },
    })
  })
})
