import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/get-auth-context', () => ({ getAuthContext: vi.fn() }))
vi.mock('@/lib/db', () => ({ db: { subscription: { findUnique: vi.fn() } } }))
vi.mock('@/lib/torqvoice-com', async () => {
  const actual = await vi.importActual<typeof import('@/lib/torqvoice-com')>('@/lib/torqvoice-com')
  return { ...actual, billingRequest: vi.fn() }
})

import { getAuthContext } from '@/lib/get-auth-context'
import { db } from '@/lib/db'
import { billingRequest, TorqvoiceComError } from '@/lib/torqvoice-com'
import { POST } from '@/app/api/protected/subscription/billing-portal/route'

const mockGetAuthContext = vi.mocked(getAuthContext)
const mockFindSubscription = vi.mocked(db.subscription.findUnique)
const mockBillingRequest = vi.mocked(billingRequest)

function setupAuth(isAdmin = true) {
  mockGetAuthContext.mockResolvedValue({
    userId: 'user-1',
    organizationId: 'org-1',
    role: isAdmin ? 'owner' : 'member',
    isAdmin,
    isSuperAdmin: false,
  })
}

beforeEach(() => vi.resetAllMocks())

describe('POST /api/protected/subscription/billing-portal', () => {
  it('asks torqvoice.com for the portal of this organization', async () => {
    setupAuth()
    mockFindSubscription.mockResolvedValue({ stripeCustomerId: 'cus_1' } as never)
    mockBillingRequest.mockResolvedValue({ url: 'https://billing.stripe.com/p/x' })
    const res = await POST()
    expect(await res.json()).toEqual({ url: 'https://billing.stripe.com/p/x' })
    expect(mockBillingRequest).toHaveBeenCalledWith('portal', { organizationId: 'org-1' })
  })

  it('refuses members, and organizations with no billing account, before calling out', async () => {
    setupAuth(false)
    expect((await POST()).status).toBe(403)
    setupAuth()
    mockFindSubscription.mockResolvedValue({ stripeCustomerId: null } as never)
    expect((await POST()).status).toBe(400)
    expect(mockBillingRequest).not.toHaveBeenCalled()
  })

  it('answers with what torqvoice.com said, as the client library shaped it', async () => {
    setupAuth()
    mockFindSubscription.mockResolvedValue({ stripeCustomerId: 'cus_1' } as never)
    mockBillingRequest.mockRejectedValue(
      new TorqvoiceComError('Billing is temporarily unavailable', 502, 401)
    )
    const res = await POST()
    expect(res.status).toBe(502)
    expect((await res.json()).error).toBe('Billing is temporarily unavailable')
  })
})
