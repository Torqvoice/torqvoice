/**
 * Who may mail a customer, and how often.
 *
 * Emailing an invoice used to need a paid plan, so a free workshop built its
 * first invoice and then could not send it. A workshop with no mail provider
 * of its own now sends from the platform's address on every plan, with a
 * daily cap on plans without custom email. The cap lives in the database, so
 * a restart or a second server does not reset it, and a slot is only spent
 * on a send that actually goes out.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

const getFeatures = vi.fn()
vi.mock('@/lib/features', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/features')>()),
  getFeatures: (...args: unknown[]) => getFeatures(...args),
}))

const channelProvider = vi.fn()
vi.mock('@/features/integrations/Lib/messaging', () => ({
  channelProvider: (...args: unknown[]) => channelProvider(...args),
}))

// The usage table, keyed by workshop and day, with the two operations the
// helper uses: create-if-missing and a conditional increment or decrement.
const usage = new Map<string, number>()
const keyOf = (w: { organizationId: string; day: string }) => `${w.organizationId}:${w.day}`
const platformMailUsage = {
  createMany: vi.fn(async ({ data }: { data: { organizationId: string; day: string }[] }) => {
    for (const row of data) if (!usage.has(keyOf(row))) usage.set(keyOf(row), 0)
    return { count: data.length }
  }),
  updateMany: vi.fn(
    async ({
      where,
      data,
    }: {
      where: { organizationId: string; day: string; count: { lt?: number; gt?: number } }
      data: { count: { increment?: number; decrement?: number } }
    }) => {
      const current = usage.get(keyOf(where))
      if (current === undefined) return { count: 0 }
      if (where.count.lt !== undefined && !(current < where.count.lt)) return { count: 0 }
      if (where.count.gt !== undefined && !(current > where.count.gt)) return { count: 0 }
      usage.set(keyOf(where), current + (data.count.increment ?? 0) - (data.count.decrement ?? 0))
      return { count: 1 }
    }
  ),
}
vi.mock('@/lib/db', () => ({ db: { platformMailUsage } }))

const {
  requireEmailSending,
  canEmailCustomers,
  withPlatformMailAllowance,
  PLATFORM_MAIL_DAILY_LIMIT,
} = await import('@/features/email/Lib/emailAllowance')

const noon = new Date('2026-10-15T12:00:00Z')
const send = () => Promise.resolve('sent')

async function sendTimes(times: number, org = 'org', now = noon) {
  for (let i = 0; i < times; i++) await withPlatformMailAllowance(org, 'platform', send, now)
}

beforeEach(() => {
  usage.clear()
  getFeatures.mockReset().mockResolvedValue({ smtp: false })
  channelProvider.mockReset().mockResolvedValue(null)
})

describe('requireEmailSending', () => {
  it('lets a free workshop without a mail provider send from the platform address', async () => {
    await expect(requireEmailSending('org')).resolves.toBe('platform')
  })

  it('never limits a plan with custom email', async () => {
    getFeatures.mockResolvedValue({ smtp: true })
    await expect(requireEmailSending('org')).resolves.toBe('unlimited')
  })

  it('refuses a free workshop that still has its own provider connected', async () => {
    channelProvider.mockResolvedValue('smtp')
    await expect(requireEmailSending('org')).rejects.toMatchObject({
      name: 'FeatureGatedError',
      feature: 'smtp',
    })
  })

  it('spends nothing by itself', async () => {
    for (let i = 0; i < PLATFORM_MAIL_DAILY_LIMIT + 5; i++) await requireEmailSending('org')
    expect(usage.size).toBe(0)
  })
})

describe('canEmailCustomers', () => {
  it('shows the email controls on the free plan', async () => {
    await expect(canEmailCustomers('org')).resolves.toBe(true)
  })

  it('hides them when the plan refuses the workshop its own provider', async () => {
    channelProvider.mockResolvedValue('smtp')
    await expect(canEmailCustomers('org')).resolves.toBe(false)
  })
})

describe('withPlatformMailAllowance', () => {
  it('stops a free workshop at the daily limit, with the limit for the dialog', async () => {
    await sendTimes(PLATFORM_MAIL_DAILY_LIMIT)
    await expect(withPlatformMailAllowance('org', 'platform', send, noon)).rejects.toMatchObject({
      name: 'FeatureGatedError',
      feature: 'platformMailDaily',
      limit: PLATFORM_MAIL_DAILY_LIMIT,
    })
  })

  it('does not send when the limit is reached', async () => {
    await sendTimes(PLATFORM_MAIL_DAILY_LIMIT)
    const blocked = vi.fn(send)
    await expect(withPlatformMailAllowance('org', 'platform', blocked, noon)).rejects.toThrow()
    expect(blocked).not.toHaveBeenCalled()
  })

  it('gives the slot back when the send fails', async () => {
    await sendTimes(PLATFORM_MAIL_DAILY_LIMIT - 1)
    const failing = () => Promise.reject(new Error('Quote not found'))
    await expect(withPlatformMailAllowance('org', 'platform', failing, noon)).rejects.toThrow(
      'Quote not found'
    )
    // The failed attempt left the last slot free.
    await expect(withPlatformMailAllowance('org', 'platform', send, noon)).resolves.toBe('sent')
  })

  it('counts each workshop on its own', async () => {
    await sendTimes(PLATFORM_MAIL_DAILY_LIMIT, 'busy')
    await expect(withPlatformMailAllowance('quiet', 'platform', send, noon)).resolves.toBe('sent')
  })

  it('starts the count again the next day', async () => {
    await sendTimes(PLATFORM_MAIL_DAILY_LIMIT)
    const tomorrow = new Date('2026-10-16T00:00:01Z')
    await expect(withPlatformMailAllowance('org', 'platform', send, tomorrow)).resolves.toBe('sent')
  })

  it('never counts a plan with custom email', async () => {
    for (let i = 0; i < PLATFORM_MAIL_DAILY_LIMIT + 5; i++)
      await withPlatformMailAllowance('org', 'unlimited', send, noon)
    expect(usage.size).toBe(0)
  })
})
