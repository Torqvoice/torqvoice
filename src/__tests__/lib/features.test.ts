import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/db', () => ({
  db: {
    subscription: { findUnique: vi.fn() },
    appSetting: { findMany: vi.fn() },
  },
}))

vi.mock('@/lib/license/token', () => ({
  verifyLicenseToken: vi.fn(),
}))

vi.mock('@/lib/license/revalidate', () => ({
  scheduleLicenseSelfHeal: vi.fn(),
}))

import { db } from '@/lib/db'
import { getFeatures, PLAN_FEATURES } from '@/lib/features'
import { verifyLicenseToken } from '@/lib/license/token'
import { scheduleLicenseSelfHeal } from '@/lib/license/revalidate'

const mockFindUnique = vi.mocked(db.subscription.findUnique)
const mockFindMany = vi.mocked(db.appSetting.findMany)
const mockVerify = vi.mocked(verifyLicenseToken)
const mockSelfHeal = vi.mocked(scheduleLicenseSelfHeal)

function verification(status: 'missing' | 'invalid' | 'expired' | 'stale' | 'valid') {
  return { status, payload: null, ageDays: null, daysUntilExpiry: null }
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.unstubAllEnvs()
  mockVerify.mockReturnValue(verification('missing'))
})

describe('getFeatures — cloud mode', () => {
  beforeEach(() => {
    vi.stubEnv('TORQVOICE_MODE', 'cloud')
  })

  it('returns free features when no subscription exists', async () => {
    mockFindUnique.mockResolvedValue(null)
    const features = await getFeatures('org-1')
    expect(features).toEqual({ ...PLAN_FEATURES.free, brandingRemoved: true })
  })

  it('returns free features when subscription status is canceled', async () => {
    mockFindUnique.mockResolvedValue({
      status: 'canceled',
      plan: { name: 'Torq Pro' },
      currentPeriodEnd: null,
    } as any)
    const features = await getFeatures('org-1')
    expect(features).toEqual({ ...PLAN_FEATURES.free, brandingRemoved: true })
  })

  it("returns pro features for plan named 'Torq Pro'", async () => {
    mockFindUnique.mockResolvedValue({
      status: 'active',
      plan: { name: 'Torq Pro' },
      currentPeriodEnd: new Date(Date.now() + 86400000),
    } as any)
    const features = await getFeatures('org-1')
    expect(features).toEqual(PLAN_FEATURES.pro)
  })

  it("returns pro features for plan named 'Pro'", async () => {
    mockFindUnique.mockResolvedValue({
      status: 'active',
      plan: { name: 'Pro' },
      currentPeriodEnd: new Date(Date.now() + 86400000),
    } as any)
    const features = await getFeatures('org-1')
    expect(features).toEqual(PLAN_FEATURES.pro)
  })

  it("returns enterprise features for plan named 'Enterprise'", async () => {
    mockFindUnique.mockResolvedValue({
      status: 'active',
      plan: { name: 'Enterprise' },
      currentPeriodEnd: new Date(Date.now() + 86400000),
    } as any)
    const features = await getFeatures('org-1')
    expect(features).toEqual(PLAN_FEATURES.enterprise)
  })

  it('returns pro features for trialing subscription', async () => {
    mockFindUnique.mockResolvedValue({
      status: 'trialing',
      plan: { name: 'Torq Pro' },
      currentPeriodEnd: new Date(Date.now() + 86400000),
    } as any)
    const features = await getFeatures('org-1')
    expect(features).toEqual(PLAN_FEATURES.pro)
  })

  it('returns free features when past_due', async () => {
    mockFindUnique.mockResolvedValue({
      status: 'past_due',
      plan: { name: 'Torq Pro' },
      currentPeriodEnd: null,
    } as any)
    const features = await getFeatures('org-1')
    expect(features).toEqual({ ...PLAN_FEATURES.free, brandingRemoved: true })
  })

  it('returns free features when period ended and grace period elapsed', async () => {
    const fourDaysAgo = new Date(Date.now() - 4 * 24 * 60 * 60 * 1000)
    mockFindUnique.mockResolvedValue({
      status: 'active',
      plan: { name: 'Torq Pro' },
      currentPeriodEnd: fourDaysAgo,
    } as any)
    const features = await getFeatures('org-1')
    expect(features).toEqual({ ...PLAN_FEATURES.free, brandingRemoved: true })
  })

  it('returns pro features within grace period after period end', async () => {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000)
    mockFindUnique.mockResolvedValue({
      status: 'active',
      plan: { name: 'Torq Pro' },
      currentPeriodEnd: oneHourAgo,
    } as any)
    const features = await getFeatures('org-1')
    expect(features).toEqual(PLAN_FEATURES.pro)
  })

  it('returns free features for unknown plan name', async () => {
    mockFindUnique.mockResolvedValue({
      status: 'active',
      plan: { name: 'Unknown Plan' },
      currentPeriodEnd: new Date(Date.now() + 86400000),
    } as any)
    const features = await getFeatures('org-1')
    expect(features).toEqual({ ...PLAN_FEATURES.free, brandingRemoved: true })
  })
})

describe('getFeatures — self-hosted mode', () => {
  beforeEach(() => {
    vi.stubEnv('TORQVOICE_MODE', 'self-hosted')
  })

  it('unlocks all features except branding when no license', async () => {
    mockFindMany.mockResolvedValue([])
    const features = await getFeatures('org-1')
    expect(features.smtp).toBe(true)
    expect(features.api).toBe(true)
    expect(features.payments).toBe(true)
    expect(features.brandingRemoved).toBe(false)
    expect(features.customPlatformName).toBe(false)
    expect(mockSelfHeal).not.toHaveBeenCalled()
  })

  it('unlocks branding only on a verified, fresh, unexpired token', async () => {
    mockFindMany.mockResolvedValue([
      { key: 'license.key', value: 'KEY' },
      { key: 'license.token', value: 'tvl1.x.y' },
    ] as any)
    mockVerify.mockReturnValue(verification('valid'))
    const features = await getFeatures('org-1')
    expect(mockVerify).toHaveBeenCalledWith('tvl1.x.y', 'org-1')
    expect(features.brandingRemoved).toBe(true)
    expect(features.customPlatformName).toBe(true)
    expect(mockSelfHeal).not.toHaveBeenCalled()
  })

  it('ignores the legacy license.valid and license.expiresAt rows', async () => {
    // These are what a self-hoster can edit with one UPDATE. They must not be
    // read at all, so a forged row is not even a partial input.
    const future = new Date(Date.now() + 86400000).toISOString()
    mockFindMany.mockResolvedValue([
      { key: 'license.valid', value: 'true' },
      { key: 'license.expiresAt', value: future },
    ] as any)
    const features = await getFeatures('org-1')
    expect(features.brandingRemoved).toBe(false)
    const where = mockFindMany.mock.calls[0][0]?.where as { key: { in: string[] } }
    expect(where.key.in).not.toContain('license.valid')
    expect(where.key.in).not.toContain('license.expiresAt')
  })

  it.each([
    'expired',
    'stale',
    'invalid',
  ] as const)('keeps branding when the token is %s', async (status) => {
    mockFindMany.mockResolvedValue([
      { key: 'license.key', value: 'KEY' },
      { key: 'license.token', value: 'tvl1.x.y' },
    ] as any)
    mockVerify.mockReturnValue(verification(status))
    const features = await getFeatures('org-1')
    expect(features.brandingRemoved).toBe(false)
  })

  it('schedules a background refresh when a key is stored without a usable token', async () => {
    mockFindMany.mockResolvedValue([{ key: 'license.key', value: 'KEY' }] as any)
    mockVerify.mockReturnValue(verification('missing'))
    await getFeatures('org-1')
    expect(mockSelfHeal).toHaveBeenCalledWith('org-1', 'KEY')
  })

  it('does not schedule a refresh without a key', async () => {
    mockFindMany.mockResolvedValue([{ key: 'license.token', value: 'tvl1.x.y' }] as any)
    mockVerify.mockReturnValue(verification('stale'))
    await getFeatures('org-1')
    expect(mockSelfHeal).not.toHaveBeenCalled()
  })
})
