/**
 * Who may mail a customer, and how often.
 *
 * Emailing an invoice used to need a paid plan, so a free workshop built its
 * first invoice and then could not send it. A workshop with no mail provider
 * of its own now sends from the platform's address on every plan, with a
 * daily cap on plans without custom email.
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

const { requireEmailSending, resetPlatformMailAllowance, PLATFORM_MAIL_DAILY_LIMIT } = await import(
  '@/features/email/Lib/emailAllowance'
)

const noon = new Date('2026-10-15T12:00:00Z')

async function sendTimes(times: number, org = 'org', now = noon) {
  for (let i = 0; i < times; i++) await requireEmailSending(org, now)
}

beforeEach(() => {
  resetPlatformMailAllowance()
  getFeatures.mockReset().mockResolvedValue({ smtp: false })
  channelProvider.mockReset().mockResolvedValue(null)
})

describe('requireEmailSending', () => {
  it('lets a free workshop without a mail provider send from the platform address', async () => {
    await expect(requireEmailSending('org', noon)).resolves.toBeUndefined()
  })

  it('refuses a free workshop that still has its own provider connected', async () => {
    channelProvider.mockResolvedValue('smtp')
    await expect(requireEmailSending('org', noon)).rejects.toMatchObject({
      name: 'FeatureGatedError',
      feature: 'smtp',
    })
  })

  it('stops a free workshop at the daily limit, with the limit for the dialog', async () => {
    await sendTimes(PLATFORM_MAIL_DAILY_LIMIT)
    await expect(requireEmailSending('org', noon)).rejects.toMatchObject({
      name: 'FeatureGatedError',
      feature: 'platformMailDaily',
      limit: PLATFORM_MAIL_DAILY_LIMIT,
    })
  })

  it('counts each workshop on its own', async () => {
    await sendTimes(PLATFORM_MAIL_DAILY_LIMIT, 'busy')
    await expect(requireEmailSending('quiet', noon)).resolves.toBeUndefined()
  })

  it('starts the count again the next day', async () => {
    await sendTimes(PLATFORM_MAIL_DAILY_LIMIT)
    const tomorrow = new Date('2026-10-16T00:00:01Z')
    await expect(requireEmailSending('org', tomorrow)).resolves.toBeUndefined()
  })

  it('never limits a plan with custom email, whatever it sends through', async () => {
    getFeatures.mockResolvedValue({ smtp: true })
    channelProvider.mockResolvedValue('resend')
    await sendTimes(PLATFORM_MAIL_DAILY_LIMIT + 5)
    expect(channelProvider).not.toHaveBeenCalled()
  })
})
