import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The demo's way into the customer portal.
 *
 * The demo sends no mail, so the emailed sign-in link never arrived and the
 * portal could not be opened at all. One button now signs a visitor in as a
 * seeded sample customer. Outside the demo that door must not exist.
 */

const demo = vi.hoisted(() => ({ on: true }))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/demo', () => ({
  get isDemoMode() {
    return demo.on
  },
  DEMO_PORTAL_CUSTOMER_EMAIL: 'sarah.coleman@example.com',
}))
vi.mock('@/lib/db', () => ({
  db: {
    customer: { findFirst: vi.fn() },
    customerSession: { create: vi.fn() },
  },
}))
vi.mock('@/lib/rate-limit', () => ({ rateLimit: vi.fn(() => null) }))
vi.mock('@/lib/portal-slug', () => ({ resolvePortalOrg: vi.fn() }))
vi.mock('@/features/portal/Lib/portalLive', () => ({ isPortalLive: vi.fn() }))

import { db } from '@/lib/db'
import { resolvePortalOrg } from '@/lib/portal-slug'
import { isPortalLive } from '@/features/portal/Lib/portalLive'
import { POST } from '@/app/(public)/portal/[orgId]/auth/demo/route'

const ORG = 'demo-workshop'
const BASE = `https://demo.example.com/portal/${ORG}`
const params = { params: Promise.resolve({ orgId: ORG }) }
const press = () => POST(new Request(`${BASE}/auth/demo`, { method: 'POST' }), params)

beforeEach(() => {
  vi.clearAllMocks()
  demo.on = true
  vi.stubEnv('NEXT_PUBLIC_APP_URL', '')
  vi.mocked(resolvePortalOrg).mockResolvedValue({ id: 'org-1', name: 'Shop' } as never)
  vi.mocked(isPortalLive).mockResolvedValue(true)
  vi.mocked(db.customer.findFirst).mockResolvedValue({ id: 'cust-1', name: 'Sarah' } as never)
})

describe('the demo portal button', () => {
  it('signs the visitor in as the sample customer and opens the portal', async () => {
    const res = await press()

    expect(res.status).toBe(303)
    expect(res.headers.get('location')).toBe(`${BASE}/dashboard`)
    expect(res.headers.getSetCookie().join('\n')).toContain('customer-session=')
    expect(db.customer.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organizationId: 'org-1', email: 'sarah.coleman@example.com' },
      })
    )
    expect(db.customerSession.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ customerId: 'cust-1', organizationId: 'org-1' }),
    })
  })

  it('still opens the portal when a visitor deleted the sample customer', async () => {
    vi.mocked(db.customer.findFirst)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'cust-2', name: 'James' } as never)

    const res = await press()

    expect(res.headers.get('location')).toBe(`${BASE}/dashboard`)
    expect(db.customerSession.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ customerId: 'cust-2' }),
    })
  })

  it('goes back to the login page when the portal is switched off', async () => {
    vi.mocked(isPortalLive).mockResolvedValue(false)

    const res = await press()

    expect(res.headers.get('location')).toBe(`${BASE}/auth/login`)
    expect(db.customerSession.create).not.toHaveBeenCalled()
  })

  it('does not exist outside the demo', async () => {
    demo.on = false

    const res = await press()

    expect(res.status).toBe(404)
    expect(res.headers.getSetCookie()).toEqual([])
    expect(db.customer.findFirst).not.toHaveBeenCalled()
    expect(db.customerSession.create).not.toHaveBeenCalled()
  })
})
