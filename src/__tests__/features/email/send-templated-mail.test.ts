/**
 * The one door a customer mail leaves through.
 *
 * The free-text mails used to be built by hand at each send site, and the
 * notification one pasted the body straight into HTML without escaping it.
 * These tests pin what the helper has to do for every caller: fill the
 * workshop's template, escape what the sender typed, produce a text half,
 * and let a caller who knows better name the subject.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

const appSetting = {
  findMany: vi.fn().mockResolvedValue([]),
  findUnique: vi.fn().mockResolvedValue(null),
}
const organization = {
  findUnique: vi.fn().mockResolvedValue({ name: 'Bergen Auto' }),
}
const emailTemplate = { findFirst: vi.fn().mockResolvedValue(null) }
vi.mock('@/lib/db', () => ({ db: { appSetting, organization, emailTemplate } }))

const sendOrgMail = vi.fn().mockResolvedValue(undefined)
const getOrgFromAddress = vi.fn().mockResolvedValue('Bergen Auto <post@bergen.example>')
vi.mock('@/lib/email', () => ({
  sendOrgMail: (...args: unknown[]) => sendOrgMail(...args),
  getOrgFromAddress: (...args: unknown[]) => getOrgFromAddress(...args),
}))

const resolveCustomerLocale = vi.fn().mockResolvedValue('en')
vi.mock('@/i18n/locale-from-request', () => ({
  resolveCustomerLocale: (...args: unknown[]) => resolveCustomerLocale(...args),
}))

const { sendTemplatedMail } = await import('@/features/email/Lib/sendTemplatedMail')

type SentMail = {
  from: string
  to: string
  subject: string
  html: string
  text?: string
}

function lastMail(): SentMail {
  const call = sendOrgMail.mock.calls.at(-1)
  if (!call) throw new Error('nothing was sent')
  return call[1] as SentMail
}

beforeEach(() => {
  sendOrgMail.mockClear()
  getOrgFromAddress.mockClear()
  resolveCustomerLocale.mockClear()
})

describe('sendTemplatedMail', () => {
  it('escapes what the sender typed and carries it in both halves', async () => {
    await sendTemplatedMail('org', {
      kind: 'message',
      to: 'ola@example.com',
      context: { message: 'Your car is ready. <b>Not bold</b>', customerName: 'Ola' },
    })

    const mail = lastMail()
    expect(mail.to).toBe('ola@example.com')
    expect(mail.from).toBe('Bergen Auto <post@bergen.example>')
    // The old notification mail pasted the body into HTML as it was, so a
    // customer note could carry markup. It must read as typed.
    expect(mail.html).not.toContain('<b>Not bold</b>')
    expect(mail.html).toContain('&lt;b&gt;Not bold&lt;/b&gt;')
    expect(mail.html).toContain('Your car is ready.')
    expect(mail.text).toContain('Your car is ready. <b>Not bold</b>')
    expect(mail.html).toContain('Ola')
  })

  it('uses the template subject when the caller has none', async () => {
    const result = await sendTemplatedMail('org', {
      kind: 'message',
      to: 'ola@example.com',
      context: { message: 'Hello' },
    })
    // The preset says "Message from {workshop_name}", and the workshop is
    // named from the organization row.
    expect(result.subject).toBe('Message from Bergen Auto')
    expect(lastMail().subject).toBe('Message from Bergen Auto')
  })

  it('lets a caller who knows better name the subject', async () => {
    const result = await sendTemplatedMail('org', {
      kind: 'message',
      to: 'ola@example.com',
      subject: 'Status update: 2020 Ford Focus',
      context: { message: 'Hello' },
    })
    expect(result.subject).toBe('Status update: 2020 Ford Focus')
    expect(lastMail().subject).toBe('Status update: 2020 Ford Focus')
  })

  it('treats a blank subject override as no override', async () => {
    const result = await sendTemplatedMail('org', {
      kind: 'message',
      to: 'ola@example.com',
      subject: '   ',
      context: { message: 'Hello' },
    })
    expect(result.subject).toBe('Message from Bergen Auto')
  })

  it('asks for the reader language only when the caller gave none', async () => {
    await sendTemplatedMail('org', {
      kind: 'message',
      to: 'ola@example.com',
      locale: 'nb',
      context: { message: 'Hei' },
    })
    expect(resolveCustomerLocale).not.toHaveBeenCalled()

    await sendTemplatedMail('org', {
      kind: 'message',
      to: 'ola@example.com',
      context: { message: 'Hi' },
    })
    expect(resolveCustomerLocale).toHaveBeenCalledWith('org', null)
  })
})
