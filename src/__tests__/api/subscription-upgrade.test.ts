import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------- Module mocks (hoisted) ----------

const mockSubscriptionsRetrieve = vi.fn()
const mockSubscriptionsUpdate = vi.fn()

vi.mock('@/lib/get-auth-context', () => ({
  getAuthContext: vi.fn(),
}))

vi.mock('@/lib/db', () => ({
  db: {
    subscription: { findUnique: vi.fn(), update: vi.fn() },
    subscriptionPlan: { upsert: vi.fn() },
    appSetting: { upsert: vi.fn() },
  },
}))

vi.mock('@/lib/stripe-config', () => ({
  getStripeConfig: vi.fn(),
  getStripeClient: vi.fn(),
}))

import { getAuthContext } from '@/lib/get-auth-context'
import { db } from '@/lib/db'
import { getStripeClient, getStripeConfig } from '@/lib/stripe-config'
import { POST } from '@/app/api/protected/subscription/upgrade/route'

const mockGetAuthContext = vi.mocked(getAuthContext)
const mockFindSubscription = vi.mocked(db.subscription.findUnique)
const mockUpdateSubscription = vi.mocked(db.subscription.update)
const mockUpsertPlan = vi.mocked(db.subscriptionPlan.upsert)
const mockUpsertSetting = vi.mocked(db.appSetting.upsert)
const mockGetStripeConfig = vi.mocked(getStripeConfig)
const mockGetStripeClient = vi.mocked(getStripeClient)

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

function setupStripe() {
  mockGetStripeConfig.mockResolvedValue({
    secretKey: 'sk_test',
    webhookSecret: 'whsec_test',
    proPriceId: 'price_pro',
    enterprisePriceId: 'price_enterprise',
  })
  mockGetStripeClient.mockResolvedValue({
    subscriptions: {
      retrieve: mockSubscriptionsRetrieve,
      update: mockSubscriptionsUpdate,
    },
  } as any)
}

function setupActiveSubscription() {
  mockFindSubscription.mockResolvedValue({
    stripeSubscriptionId: 'sub_123',
    status: 'active',
    organizationId: 'org-1',
    plan: { name: 'Torq Pro', stripePriceId: 'price_pro' },
  } as any)
}

function setupStripeResponses() {
  mockSubscriptionsRetrieve.mockResolvedValue({
    id: 'sub_123',
    items: {
      data: [{ id: 'si_item_1', price: { id: 'price_pro' } }],
    },
  })
  mockSubscriptionsUpdate.mockResolvedValue({
    id: 'sub_123',
    items: {
      data: [
        {
          id: 'si_item_1',
          price: { id: 'price_enterprise' },
          current_period_start: 1700000000,
          current_period_end: 1731536000,
        },
      ],
    },
  })
}

beforeEach(() => {
  vi.resetAllMocks()
})

describe('POST /api/protected/subscription/upgrade', () => {
  it('returns 401 when not authenticated', async () => {
    mockGetAuthContext.mockResolvedValue(null)
    const res = await POST(makeRequest({ plan: 'enterprise' }))
    expect(res.status).toBe(401)
    const data = await res.json()
    expect(data.error).toBe('Unauthorized')
  })

  it('refuses a member who is not an owner or admin', async () => {
    // Changing the plan charges the card; a technician must not be able to.
    setupAuth('user-2', 'org-1', false)
    const res = await POST(makeRequest({ plan: 'enterprise' }))
    expect(res.status).toBe(403)
    const data = await res.json()
    expect(data.error).toBe('Forbidden')
  })

  it('returns 400 for invalid plan (not enterprise)', async () => {
    setupAuth()
    const res = await POST(makeRequest({ plan: 'pro' }))
    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.error).toBe('Can only upgrade to enterprise')
  })

  it('returns 400 when no subscription exists', async () => {
    setupAuth()
    mockFindSubscription.mockResolvedValue(null)

    const res = await POST(makeRequest({ plan: 'enterprise' }))
    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.error).toBe('No active subscription found')
  })

  it('returns 400 when subscription is not active', async () => {
    setupAuth()
    mockFindSubscription.mockResolvedValue({
      stripeSubscriptionId: 'sub_123',
      status: 'canceled',
    } as any)

    const res = await POST(makeRequest({ plan: 'enterprise' }))
    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.error).toBe('Subscription is not active')
  })

  it('returns 500 when enterprise price ID is not configured', async () => {
    setupAuth()
    setupActiveSubscription()
    mockGetStripeConfig.mockResolvedValue({
      secretKey: 'sk_test',
      webhookSecret: 'whsec_test',
      proPriceId: 'price_pro',
      enterprisePriceId: '',
    })

    const res = await POST(makeRequest({ plan: 'enterprise' }))
    expect(res.status).toBe(500)
    const data = await res.json()
    expect(data.error).toBe('Enterprise price ID not configured')
  })

  it('returns 400 when stripe subscription has no items', async () => {
    setupAuth()
    setupActiveSubscription()
    setupStripe()
    mockSubscriptionsRetrieve.mockResolvedValue({
      id: 'sub_123',
      items: { data: [] },
    })

    const res = await POST(makeRequest({ plan: 'enterprise' }))
    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.error).toBe('No subscription item found')
  })

  it('successfully upgrades from pro to enterprise with proration', async () => {
    setupAuth('user-1', 'org-1')
    setupActiveSubscription()
    setupStripe()
    setupStripeResponses()
    mockUpsertPlan.mockResolvedValue({ id: 'plan-ent' } as any)
    mockUpdateSubscription.mockResolvedValue({} as any)
    mockUpsertSetting.mockResolvedValue({} as any)

    // A proration stamp from the preview a moment ago; an old one is ignored.
    const prorationDate = Math.floor(Date.now() / 1000) - 60
    const res = await POST(makeRequest({ plan: 'enterprise', prorationDate }))
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.success).toBe(true)

    // Verify Stripe was called with correct proration and proration_date
    expect(mockSubscriptionsRetrieve).toHaveBeenCalledWith('sub_123')
    expect(mockSubscriptionsUpdate).toHaveBeenCalledWith('sub_123', {
      items: [{ id: 'si_item_1', price: 'price_enterprise' }],
      proration_behavior: 'always_invoice',
      proration_date: prorationDate,
      metadata: { plan: 'enterprise', organizationId: 'org-1' },
    })

    // Verify DB plan upsert
    expect(mockUpsertPlan).toHaveBeenCalledWith({
      where: { stripePriceId: 'price_enterprise' },
      create: {
        name: 'Enterprise',
        stripePriceId: 'price_enterprise',
        price: 140,
        interval: 'year',
        maxMembers: 50,
      },
      update: {},
    })

    // Verify DB subscription update
    expect(mockUpdateSubscription).toHaveBeenCalledWith({
      where: { organizationId: 'org-1' },
      data: {
        planId: 'plan-ent',
        status: 'active',
        currentPeriodStart: new Date(1700000000 * 1000),
        currentPeriodEnd: new Date(1731536000 * 1000),
        cancelAtPeriodEnd: false,
      },
    })

    // Verify license plan updated
    expect(mockUpsertSetting).toHaveBeenCalledWith({
      where: {
        organizationId_key: {
          organizationId: 'org-1',
          key: 'license.plan',
        },
      },
      create: {
        organizationId: 'org-1',
        key: 'license.plan',
        value: 'enterprise',
        userId: 'user-1',
      },
      update: { value: 'enterprise' },
    })
  })

  it('returns 500 when Stripe API fails', async () => {
    setupAuth()
    setupActiveSubscription()
    setupStripe()
    mockSubscriptionsRetrieve.mockRejectedValue(new Error('Stripe API error'))

    const res = await POST(makeRequest({ plan: 'enterprise' }))
    expect(res.status).toBe(500)
    const data = await res.json()
    // The vendor's wording stays in the log, not in the browser.
    expect(data.error).toBe('Upgrade failed')
  })

  it('returns 500 when Stripe update fails', async () => {
    setupAuth()
    setupActiveSubscription()
    setupStripe()
    mockSubscriptionsRetrieve.mockResolvedValue({
      id: 'sub_123',
      items: { data: [{ id: 'si_item_1' }] },
    })
    mockSubscriptionsUpdate.mockRejectedValue(new Error('Card was declined'))

    const res = await POST(makeRequest({ plan: 'enterprise' }))
    expect(res.status).toBe(500)
    const data = await res.json()
    expect(data.error).toBe('Upgrade failed')
  })

  it('handles subscription with past_due status', async () => {
    setupAuth()
    mockFindSubscription.mockResolvedValue({
      stripeSubscriptionId: 'sub_123',
      status: 'past_due',
    } as any)

    const res = await POST(makeRequest({ plan: 'enterprise' }))
    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.error).toBe('Subscription is not active')
  })

  it('handles subscription without stripeSubscriptionId', async () => {
    setupAuth()
    mockFindSubscription.mockResolvedValue({
      stripeSubscriptionId: null,
      status: 'active',
    } as any)

    const res = await POST(makeRequest({ plan: 'enterprise' }))
    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.error).toBe('No active subscription found')
  })
})

describe('POST /api/protected/subscription/upgrade proration stamp', () => {
  it('ignores a proration stamp that is old or not a timestamp', async () => {
    setupAuth()
    setupActiveSubscription()
    setupStripe()
    setupStripeResponses()
    mockUpsertPlan.mockResolvedValue({ id: 'plan-ent' } as any)
    mockUpdateSubscription.mockResolvedValue({} as any)
    mockUpsertSetting.mockResolvedValue({} as any)

    const res = await POST(makeRequest({ plan: 'enterprise', prorationDate: 1700000000 }))
    expect(res.status).toBe(200)
    const call = mockSubscriptionsUpdate.mock.calls.at(-1)?.[1] as Record<string, unknown>
    expect(call.proration_date).toBeUndefined()
  })
})
