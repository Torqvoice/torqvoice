/**
 * Who sees the sidebar's plan row, and with what in it.
 *
 * Shown on the same terms as a purchase: the app torqvoice.com bills for, a
 * workshop the plans page would sell to (free, or a demo without Stripe),
 * and someone the checkout route lets buy.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

const state = vi.hoisted(() => ({
  demoMode: false,
  linked: true,
  ctx: { organizationId: 'org-1', isAdmin: true } as {
    organizationId: string
    isAdmin: boolean
  } | null,
  subscription: null as unknown,
  customers: 14,
}))

vi.mock('@/lib/demo', () => ({
  get isDemoMode() {
    return state.demoMode
  },
}))
vi.mock('@/lib/torqvoice-com-link', () => ({ isCloudLinked: vi.fn(async () => state.linked) }))
vi.mock('@/lib/get-auth-context', () => ({ getAuthContext: vi.fn(async () => state.ctx) }))
vi.mock('@/lib/customer-limit', () => ({
  countCustomersTowardLimit: vi.fn(async () => state.customers),
}))
vi.mock('@/lib/db', () => ({
  db: { subscription: { findUnique: vi.fn(async () => state.subscription) } },
}))

const { getSidebarPlan } = await import('@/features/subscription/Lib/sidebarPlan.server')
const { getAuthContext } = await import('@/lib/get-auth-context')
const { db } = await import('@/lib/db')

const DAY = 86_400_000

beforeEach(() => {
  vi.clearAllMocks()
  state.demoMode = false
  state.linked = true
  state.ctx = { organizationId: 'org-1', isAdmin: true }
  state.subscription = null
  state.customers = 14
})

describe('getSidebarPlan', () => {
  it('shows a free workshop its customers against the free limit', async () => {
    expect(await getSidebarPlan()).toEqual({ kind: 'free', customers: 14, customerLimit: 20 })
  })

  it('treats a canceled subscription as free', async () => {
    state.subscription = {
      status: 'canceled',
      stripeSubscriptionId: 'sub_1',
      currentPeriodEnd: null,
      plan: { name: 'Torq Pro (monthly)' },
    }
    expect(await getSidebarPlan()).toMatchObject({ kind: 'free' })
  })

  it('shows nothing to a paying workshop', async () => {
    state.subscription = {
      status: 'active',
      stripeSubscriptionId: 'sub_1',
      currentPeriodEnd: new Date(Date.now() + 30 * DAY),
      plan: { name: 'Torq Pro (monthly)' },
    }
    expect(await getSidebarPlan()).toBeNull()
  })

  it('shows a demo without Stripe its plan and days left', async () => {
    state.subscription = {
      status: 'trialing',
      stripeSubscriptionId: null,
      currentPeriodEnd: new Date(Date.now() + 4.5 * DAY),
      plan: { name: 'Enterprise (annual)' },
    }
    expect(await getSidebarPlan()).toEqual({ kind: 'demo', plan: 'enterprise', daysLeft: 5 })
  })

  it('shows nothing to a Stripe trial, which is already bought', async () => {
    state.subscription = {
      status: 'trialing',
      stripeSubscriptionId: 'sub_1',
      currentPeriodEnd: new Date(Date.now() + 4 * DAY),
      plan: { name: 'Torq Pro (monthly)' },
    }
    expect(await getSidebarPlan()).toBeNull()
  })

  it('shows nothing to someone who cannot buy', async () => {
    state.ctx = { organizationId: 'org-1', isAdmin: false }
    expect(await getSidebarPlan()).toBeNull()
  })

  // TORQVOICE_MODE=cloud is a line anyone can put in an environment file. A
  // self-hosted install that does so is still not billed by torqvoice.com,
  // so the plans page sends it away and the sidebar must not point there.
  it('shows nothing on a self-hosted install that set cloud mode but is not linked', async () => {
    const before = process.env.TORQVOICE_MODE
    process.env.TORQVOICE_MODE = 'cloud'
    state.linked = false
    try {
      expect(await getSidebarPlan()).toBeNull()
      expect(getAuthContext).not.toHaveBeenCalled()
      expect(db.subscription.findUnique).not.toHaveBeenCalled()
    } finally {
      if (before === undefined) delete process.env.TORQVOICE_MODE
      else process.env.TORQVOICE_MODE = before
    }
  })

  it('shows nothing on the public demo, where checkout is refused', async () => {
    state.demoMode = true
    expect(await getSidebarPlan()).toBeNull()
  })
})
