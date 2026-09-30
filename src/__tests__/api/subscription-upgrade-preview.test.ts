import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/get-auth-context', () => ({
  getAuthContext: vi.fn(),
}))

vi.mock('@/lib/db', () => ({
  db: {
    subscription: { findUnique: vi.fn() },
  },
}))

vi.mock('@/lib/torqvoice-com', async () => {
  const actual = await vi.importActual<typeof import('@/lib/torqvoice-com')>('@/lib/torqvoice-com')
  return { ...actual, billingRequest: vi.fn() }
})

import { getAuthContext } from '@/lib/get-auth-context'
import { db } from '@/lib/db'
import { billingRequest, TorqvoiceComError } from '@/lib/torqvoice-com'
import { POST } from '@/app/api/protected/subscription/upgrade-preview/route'

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

beforeEach(() => {
  vi.resetAllMocks()
})

describe('POST /api/protected/subscription/upgrade-preview', () => {
  it('returns the prorated amount torqvoice.com worked out', async () => {
    setupAuth()
    mockFindSubscription.mockResolvedValue({
      stripeSubscriptionId: 'sub_123',
      stripeCustomerId: 'cus_123',
      status: 'active',
    } as never)
    mockBillingRequest.mockResolvedValue({ amountDue: 41, currency: 'usd', prorationDate: 1 })

    const res = await POST()

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ amountDue: 41, currency: 'usd', prorationDate: 1 })
    expect(mockBillingRequest).toHaveBeenCalledWith('upgrade-preview', { organizationId: 'org-1' })
  })

  it('is for owners and admins only', async () => {
    setupAuth(false)
    expect((await POST()).status).toBe(403)
    expect(mockBillingRequest).not.toHaveBeenCalled()
  })

  it('needs an active Stripe-backed subscription', async () => {
    setupAuth()
    mockFindSubscription.mockResolvedValue({ stripeSubscriptionId: null } as never)
    expect((await POST()).status).toBe(400)
    expect(mockBillingRequest).not.toHaveBeenCalled()
  })

  it('passes a refusal from torqvoice.com through', async () => {
    setupAuth()
    mockFindSubscription.mockResolvedValue({
      stripeSubscriptionId: 'sub_123',
      stripeCustomerId: 'cus_123',
      status: 'active',
    } as never)
    mockBillingRequest.mockRejectedValue(new TorqvoiceComError('Subscription is not active', 400))

    const res = await POST()
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('Subscription is not active')
  })
})
