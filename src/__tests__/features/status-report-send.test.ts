/**
 * A status report must only claim the channels that carried it.
 *
 * The three senders are withAuth actions, so a refusal arrives as a returned
 * `{ success: false }` rather than as a thrown error. The original code
 * awaited them and ignored the result, so a text message the provider rejected
 * still counted: the row said sent, sentVia said sms, and the customer never
 * heard anything. Nothing in the app disagreed with that, which is why it
 * could sit there indefinitely.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

const statusReport = {
  findFirst: vi.fn(),
  update: vi.fn().mockResolvedValue({}),
}
vi.mock('@/lib/db', () => ({ db: { statusReport } }))

// withAuth is the thing that turns a throw into a returned error, so the test
// needs the real behaviour rather than a pass-through.
vi.mock('@/lib/with-auth', () => ({
  withAuth: async (fn: (ctx: { organizationId: string; userId: string }) => Promise<unknown>) => {
    try {
      return { success: true, data: await fn({ organizationId: 'org', userId: 'user' }) }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  },
}))

vi.mock('next-intl/server', () => ({
  getTranslations: async () => (key: string) => key,
}))

const sendNotificationEmail = vi.fn()
const sendSmsToCustomer = vi.fn()
const sendTelegramToCustomer = vi.fn()
vi.mock('@/features/email/Actions/emailActions', () => ({
  sendNotificationEmail: (i: unknown) => sendNotificationEmail(i),
}))
vi.mock('@/features/sms/Actions/smsActions', () => ({
  sendSmsToCustomer: (i: unknown) => sendSmsToCustomer(i),
}))
vi.mock('@/features/telegram/Actions/telegramActions', () => ({
  sendTelegramToCustomer: (i: unknown) => sendTelegramToCustomer(i),
}))

const { sendStatusReport } = await import(
  '@/features/status-reports/Actions/sendStatusReport'
)

const CUSTOMER = {
  id: 'cust',
  name: 'Ola',
  email: 'ola@example.com',
  phone: '+4700000000',
  telegramChatId: 'chat',
}

type Customer = {
  id: string
  name: string
  email: string | null
  phone: string | null
  telegramChatId: string | null
}

function report(customer: Customer | null = CUSTOMER) {
  statusReport.findFirst.mockResolvedValue({
    id: 'rep',
    publicToken: 'tok',
    serviceRecord: {
      title: 'Job',
      customer,
      vehicle: { year: 2020, make: 'Ford', model: 'Focus', customer },
    },
  })
}

const ALL = { sms: true, email: true, telegram: true }

beforeEach(() => {
  vi.clearAllMocks()
  statusReport.update.mockResolvedValue({})
  sendNotificationEmail.mockResolvedValue({ success: true })
  sendSmsToCustomer.mockResolvedValue({ success: true })
  sendTelegramToCustomer.mockResolvedValue({ success: true })
  report()
})

describe('what the report records', () => {
  it('lists every channel that went out', async () => {
    const res = await sendStatusReport({ statusReportId: 'rep', channels: ALL })
    expect(res.success).toBe(true)
    expect(res.data?.channels.sort()).toEqual(['email', 'sms', 'telegram'])
    expect(statusReport.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ sentVia: 'email,sms,telegram' }) })
    )
  })

  it('leaves out a channel the provider refused', async () => {
    // The reported bug. SMS comes back unsuccessful, and the row used to say
    // it was sent anyway.
    sendSmsToCustomer.mockResolvedValue({ success: false, error: 'no credit' })

    const res = await sendStatusReport({ statusReportId: 'rep', channels: ALL })
    expect(res.success).toBe(true)
    expect(res.data?.channels).not.toContain('sms')
    expect(statusReport.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ sentVia: 'email,telegram' }) })
    )
  })

  it('reports the refusal rather than swallowing it', async () => {
    sendSmsToCustomer.mockResolvedValue({ success: false, error: 'no credit' })
    const res = await sendStatusReport({ statusReportId: 'rep', channels: ALL })
    expect(res.data?.failures).toContainEqual({ channel: 'sms', error: 'no credit' })
  })

  it('fails outright when nothing got through', async () => {
    // Nothing reached the customer, so nothing should say it did.
    sendNotificationEmail.mockResolvedValue({ success: false, error: 'smtp down' })
    sendSmsToCustomer.mockResolvedValue({ success: false, error: 'no credit' })
    sendTelegramToCustomer.mockResolvedValue({ success: false, error: 'blocked' })

    const res = await sendStatusReport({ statusReportId: 'rep', channels: ALL })
    expect(res.success).toBe(false)
    expect(res.error).toContain('no credit')
    expect(statusReport.update).not.toHaveBeenCalled()
  })

  it('counts a missing address as a failure, not a quiet skip', async () => {
    // Someone ticked SMS for a customer with no number. Doing nothing and
    // saying "sent" is the same lie in a quieter voice.
    report({ ...CUSTOMER, phone: null })
    const res = await sendStatusReport({ statusReportId: 'rep', channels: ALL })
    expect(res.data?.channels).not.toContain('sms')
    expect(res.data?.failures.map((f) => f.channel)).toContain('sms')
    expect(sendSmsToCustomer).not.toHaveBeenCalled()
  })

  it('does not send on a channel that was not asked for', async () => {
    await sendStatusReport({
      statusReportId: 'rep',
      channels: { sms: true, email: false, telegram: false },
    })
    expect(sendSmsToCustomer).toHaveBeenCalled()
    expect(sendNotificationEmail).not.toHaveBeenCalled()
    expect(sendTelegramToCustomer).not.toHaveBeenCalled()
  })
})
