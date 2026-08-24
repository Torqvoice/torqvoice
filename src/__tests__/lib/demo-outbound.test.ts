import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * The demo instance seeds customer-looking contact details and a queue of
 * scheduled messages, and its crons run every minute. These cover the guards
 * that keep any of that from reaching a real inbox or handset.
 */

vi.mock('@/lib/db', () => ({
  db: {
    scheduledMessage: {
      findMany: vi.fn(() => {
        throw new Error('the demo must not read the send queue at all')
      }),
    },
  },
}))

describe('demo mode blocks every outbound transport', () => {
  beforeEach(() => {
    vi.resetModules()
    process.env.DEMO_MODE = 'true'
  })
  afterEach(() => {
    delete process.env.DEMO_MODE
  })

  it('refuses email, SMS, WhatsApp and Telegram', async () => {
    const { assertOutboundAllowed } = await import('@/lib/demo')
    for (const channel of ['email', 'sms', 'whatsapp', 'telegram'] as const) {
      expect(() => assertOutboundAllowed(channel)).toThrow(/disabled on the demo/)
    }
  })

  it('allows them when demo mode is off', async () => {
    process.env.DEMO_MODE = 'false'
    vi.resetModules()
    const { assertOutboundAllowed } = await import('@/lib/demo')
    expect(() => assertOutboundAllowed('email')).not.toThrow()
  })

  it('unlocks the plan features so the messaging pages render', async () => {
    const { getFeatures } = await import('@/lib/features')
    const features = await getFeatures('any-org')
    expect(features.sms).toBe(true)
    expect(features.whatsapp).toBe(true)
    expect(features.telegram).toBe(true)
    // Branding stays on: the demo is still advertising the product.
    expect(features.brandingRemoved).toBe(false)
  })

  it('stops the scheduled-message cron before it reads the queue', async () => {
    const { processDueMessages } = await import('@/lib/cron/scheduled-messages')
    await expect(processDueMessages()).resolves.toBe(0)
  })
})
