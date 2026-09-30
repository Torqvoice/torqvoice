import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------- Module mocks (hoisted) ----------

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
import { POST } from '@/app/api/protected/subscription/upgrade/route'

const mockGetAuthContext = vi.mocked(getAuthContext)
const mockFindSubscription = vi.mocked(db.subscription.findUnique)
const mockBillingRequest = vi.mocked(billingRequest)

function makeRequest(body: Record<string, unknown>) {
  return new Request('http://localhost/api/protected/subscription/upgrade', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function setupAuth(userId = 'user-1', orgId = 'org-1', isAdmin = true) {
  mockGetAuthContext.mockResolvedValue({
    userId,
    organizationId: orgId,
    role: isAdmin ? 'owner' : 'member',
    isAdmin,
    isSuperAdmin: false,
  })
}

function activeSubscription(overrides: Record<string, unknown> = {}) {
  return {
    id: 'sub-row',
    organizationId: 'org-1',
    stripeSubscriptionId: 'sub_123',
    stripeCustomerId: 'cus_123',
    status: 'active',
    ...overrides,
  } as never
}

beforeEach(() => {
  vi.resetAllMocks()
})

describe('POST /api/protected/subscription/upgrade', () => {
  it('hands the upgrade to torqvoice.com with the proration from the preview', async () => {
    setupAuth()
    mockFindSubscription.mockResolvedValue(activeSubscription())
    mockBillingRequest.mockResolvedValue({ success: true })
    const prorationDate = Math.floor(Date.now() / 1000) - 30

    const res = await POST(makeRequest({ plan: 'enterprise', prorationDate }))

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ success: true })
    expect(mockBillingRequest).toHaveBeenCalledWith('upgrade', {
      organizationId: 'org-1',
      plan: 'enterprise',
      prorationDate,
    })
  })

  it('drops a proration date that is stale or in the future', async () => {
    setupAuth()
    mockFindSubscription.mockResolvedValue(activeSubscription())
    mockBillingRequest.mockResolvedValue({ success: true })

    await POST(
      makeRequest({ plan: 'enterprise', prorationDate: Math.floor(Date.now() / 1000) - 7200 })
    )
    await POST(
      makeRequest({ plan: 'enterprise', prorationDate: Math.floor(Date.now() / 1000) + 60 })
    )

    for (const call of mockBillingRequest.mock.calls) {
      expect(call[1]).not.toHaveProperty('prorationDate')
    }
  })

  it('is for owners and admins only', async () => {
    setupAuth('user-1', 'org-1', false)
    const res = await POST(makeRequest({ plan: 'enterprise' }))
    expect(res.status).toBe(403)
    expect(mockBillingRequest).not.toHaveBeenCalled()
  })

  it('only upgrades to enterprise', async () => {
    setupAuth()
    const res = await POST(makeRequest({ plan: 'pro' }))
    expect(res.status).toBe(400)
    expect(mockBillingRequest).not.toHaveBeenCalled()
  })

  it('needs an active Stripe-backed subscription', async () => {
    setupAuth()
    mockFindSubscription.mockResolvedValue(null)
    expect((await POST(makeRequest({ plan: 'enterprise' }))).status).toBe(400)

    mockFindSubscription.mockResolvedValue(activeSubscription({ status: 'past_due' }))
    expect((await POST(makeRequest({ plan: 'enterprise' }))).status).toBe(400)
    expect(mockBillingRequest).not.toHaveBeenCalled()
  })

  it('shows what torqvoice.com said when it refused', async () => {
    setupAuth()
    mockFindSubscription.mockResolvedValue(activeSubscription())
    mockBillingRequest.mockRejectedValue(
      new TorqvoiceComError('Already on the Enterprise plan', 400)
    )

    const res = await POST(makeRequest({ plan: 'enterprise' }))

    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('Already on the Enterprise plan')
  })

  it('does not leak an unexpected failure', async () => {
    setupAuth()
    mockFindSubscription.mockResolvedValue(activeSubscription())
    mockBillingRequest.mockRejectedValue(new Error('boom'))
    vi.spyOn(console, 'error').mockImplementation(() => undefined)

    const res = await POST(makeRequest({ plan: 'enterprise' }))

    expect(res.status).toBe(500)
    expect((await res.json()).error).toBe('Upgrade failed')
  })
})
