/**
 * A document's link can be texted or sent on WhatsApp to a number typed in
 * the send dialog, for a job whose customer is not on file yet. The number
 * can be anyone's, so what it receives is built on the server from the
 * workshop's template and the document's own link, never taken from the
 * browser, and a link the customer already holds is never replaced.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const quote = { findFirst: vi.fn(), update: vi.fn().mockResolvedValue({}) }
const serviceRecord = { findFirst: vi.fn(), update: vi.fn().mockResolvedValue({}) }
const inspection = { findFirst: vi.fn(), update: vi.fn().mockResolvedValue({}) }
const appSetting = { findFirst: vi.fn() }
vi.mock('@/lib/db', () => ({
  db: {
    quote,
    serviceRecord,
    inspection,
    appSetting,
    organization: { findUnique: async () => ({ name: 'Fjord Auto' }) },
    user: { findUnique: async () => ({ name: 'Kari' }) },
  },
}))

// The real behaviour: a throw becomes a returned error.
vi.mock('@/lib/with-auth', () => ({
  withAuth: async (fn: (ctx: { organizationId: string; userId: string }) => Promise<unknown>) => {
    try {
      return { success: true, data: await fn({ organizationId: 'org1', userId: 'user1' }) }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  },
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
// The link's own rules (kept when it exists, minted once) have their own test.
const ensureShareToken = vi.fn()
vi.mock('@/lib/share-token.server', () => ({
  ensureShareToken: (...args: unknown[]) => ensureShareToken(...args),
}))
vi.mock('@/lib/demo', () => ({ demoGuard: vi.fn() }))
vi.mock('@/lib/app-url', () => ({ getAppBaseUrl: () => 'https://app.test' }))

const requireFeature = vi.fn()
vi.mock('@/lib/features', () => ({
  requireFeature: (org: string, feature: string) => requireFeature(org, feature),
}))

const deliverSms = vi.fn()
vi.mock('@/features/sms/Lib/deliverSms.server', () => ({
  deliverSms: (org: string, input: unknown) => deliverSms(org, input),
}))
// Numbers with a country code pass; anything else cannot be dialled.
vi.mock('@/lib/sms', () => ({
  normalizeOrgPhone: async (_org: string, phone: string) =>
    phone.trim().startsWith('+') ? phone.replace(/\s/g, '') : null,
}))

const sendOrgWhatsapp = vi.fn()
const getWhatsappConfig = vi.fn()
const isWithinServiceWindow = vi.fn()
vi.mock('@/lib/whatsapp', () => {
  class WhatsappWindowClosedError extends Error {}
  return {
    WhatsappWindowClosedError,
    sendOrgWhatsapp: (org: string, input: unknown) => sendOrgWhatsapp(org, input),
    getWhatsappConfig: () => getWhatsappConfig(),
    isWithinServiceWindow: () => isWithinServiceWindow(),
  }
})

const markInvoiceSent = vi.fn()
const markQuoteSent = vi.fn()
vi.mock('@/lib/document-lock.server', () => ({
  markInvoiceSent: (...args: unknown[]) => markInvoiceSent(...args),
  markQuoteSent: (...args: unknown[]) => markQuoteSent(...args),
}))
const issueInvoice = vi.fn()
vi.mock('@/features/invoices/Lib/issueInvoice', () => ({
  issueInvoice: (...args: unknown[]) => issueInvoice(...args),
}))

const { sendQuoteLink, sendInvoiceLink, sendInspectionLink } = await import(
  '@/features/messaging/Actions/sendDocumentLink'
)

const OLA = { id: 'c1', name: 'Ola Nordmann', phone: '+47 900 00 000' }

beforeEach(() => {
  vi.clearAllMocks()
  appSetting.findFirst.mockResolvedValue(null)
  requireFeature.mockResolvedValue(undefined)
  deliverSms.mockResolvedValue({ id: 'sms1', to: '+4790000000' })
  sendOrgWhatsapp.mockResolvedValue({ messageId: 'wa1', usedTemplate: false })
  ensureShareToken.mockResolvedValue('held')
  getWhatsappConfig.mockResolvedValue({ template: null })
  isWithinServiceWindow.mockResolvedValue(true)
})

describe('texting a quote', () => {
  it('texts the quote’s link to the number, in a shape that can be dialled', async () => {
    quote.findFirst.mockResolvedValue({ customer: OLA })

    const result = await sendQuoteLink({ id: 'q1', channel: 'sms', to: '+47 900 00 000' })

    expect(result.success).toBe(true)
    expect(ensureShareToken).toHaveBeenCalledWith('quote', 'q1', 'org1')
    const sent = deliverSms.mock.calls[0][1]
    expect(sent.to).toBe('+4790000000')
    expect(sent.body).toContain('https://app.test/share/quote/org1/held')
    expect(sent).toMatchObject({ relatedEntityType: 'quote', relatedEntityId: 'q1' })
  })

  it('adds the link when the workshop’s template left it out', async () => {
    quote.findFirst.mockResolvedValue({ customer: OLA })
    appSetting.findFirst.mockResolvedValue({ value: 'Hi {customer_name}, your quote is ready.' })

    await sendQuoteLink({ id: 'q1', channel: 'sms', to: '+47 900 00 000' })

    expect(deliverSms.mock.calls[0][1].body).toBe(
      'Hi Ola Nordmann, your quote is ready. https://app.test/share/quote/org1/held'
    )
  })

  it('writes the text with the workshop’s own template', async () => {
    quote.findFirst.mockResolvedValue({ customer: OLA })
    appSetting.findFirst.mockResolvedValue({
      value: 'Hi {customer_name}, {company_name} here: {share_link} /{current_user}',
    })

    await sendQuoteLink({ id: 'q1', channel: 'sms', to: '+47 900 00 000' })

    expect(deliverSms.mock.calls[0][1].body).toBe(
      'Hi Ola Nordmann, Fjord Auto here: https://app.test/share/quote/org1/held /Kari'
    )
  })

  it('files the text in the customer’s conversation when it went to their number', async () => {
    quote.findFirst.mockResolvedValue({ customer: OLA })

    await sendQuoteLink({ id: 'q1', channel: 'sms', to: '+4790000000' })

    expect(deliverSms.mock.calls[0][1].customerId).toBe('c1')
  })

  it('keeps a text to another number out of the customer’s conversation', async () => {
    quote.findFirst.mockResolvedValue({ customer: OLA })

    await sendQuoteLink({ id: 'q1', channel: 'sms', to: '+4791111111' })

    expect(deliverSms.mock.calls[0][1]).toMatchObject({ to: '+4791111111', customerId: null })
  })

  it('texts a typed number for a quote with no customer at all', async () => {
    quote.findFirst.mockResolvedValue({ customer: null })

    const result = await sendQuoteLink({ id: 'q1', channel: 'sms', to: '+4791111111' })

    expect(result.success).toBe(true)
    expect(deliverSms.mock.calls[0][1]).toMatchObject({ to: '+4791111111', customerId: null })
  })

  it('says what to fix when the number cannot be dialled', async () => {
    quote.findFirst.mockResolvedValue({ customer: null })

    const result = await sendQuoteLink({ id: 'q1', channel: 'sms', to: '912 345 678' })

    expect(result).toMatchObject({ success: false })
    expect(result.error).toContain('"912 345 678" is not a phone number we can text')
    expect(deliverSms).not.toHaveBeenCalled()
  })

  it('refuses a quote from another workshop', async () => {
    quote.findFirst.mockResolvedValue(null)

    const result = await sendQuoteLink({ id: 'theirs', channel: 'sms', to: '+4791111111' })

    expect(quote.findFirst.mock.calls[0][0].where).toEqual({ id: 'theirs', organizationId: 'org1' })
    expect(result).toMatchObject({ success: false, error: 'Quote not found' })
    expect(deliverSms).not.toHaveBeenCalled()
  })

  it('sends nothing when the plan has no SMS', async () => {
    requireFeature.mockRejectedValue(new Error('gated'))

    const result = await sendQuoteLink({ id: 'q1', channel: 'sms', to: '+4791111111' })

    expect(requireFeature).toHaveBeenCalledWith('org1', 'sms')
    expect(result.success).toBe(false)
    expect(quote.findFirst).not.toHaveBeenCalled()
  })
})

describe('sending on WhatsApp', () => {
  it('sends the same link and counts the quote as sent', async () => {
    quote.findFirst.mockResolvedValue({ customer: OLA })

    const result = await sendQuoteLink({ id: 'q1', channel: 'whatsapp', to: '+47 900 00 000' })

    expect(result.success).toBe(true)
    expect(requireFeature).toHaveBeenCalledWith('org1', 'whatsapp')
    expect(sendOrgWhatsapp.mock.calls[0][1]).toMatchObject({
      to: '+47 900 00 000',
      customerId: 'c1',
      relatedEntityType: 'quote',
      relatedEntityId: 'q1',
    })
    expect(sendOrgWhatsapp.mock.calls[0][1].body).toContain('/share/quote/org1/held')
    expect(markQuoteSent).toHaveBeenCalledWith('q1', 'org1')
  })

  it('does not count the quote as sent when WhatsApp refuses it', async () => {
    quote.findFirst.mockResolvedValue({ customer: OLA })
    sendOrgWhatsapp.mockRejectedValue(new Error('Number not on WhatsApp'))

    const result = await sendQuoteLink({ id: 'q1', channel: 'whatsapp', to: '+4791111111' })

    expect(result).toMatchObject({
      success: false,
      error: 'Could not send WhatsApp message: Number not on WhatsApp',
    })
    expect(markQuoteSent).not.toHaveBeenCalled()
  })
})

describe('WhatsApp outside the 24 hours', () => {
  it('goes out through a template that can carry the link', async () => {
    quote.findFirst.mockResolvedValue({ customer: OLA })
    isWithinServiceWindow.mockResolvedValue(false)
    getWhatsappConfig.mockResolvedValue({ template: { tokens: ['customer', 'message'] } })

    const result = await sendQuoteLink({ id: 'q1', channel: 'whatsapp', to: '+47 900 00 000' })

    expect(result.success).toBe(true)
    expect(sendOrgWhatsapp).toHaveBeenCalled()
  })

  it('is refused when the template has no room for the link, and nothing counts as sent', async () => {
    quote.findFirst.mockResolvedValue({ customer: OLA })
    isWithinServiceWindow.mockResolvedValue(false)
    getWhatsappConfig.mockResolvedValue({ template: { tokens: ['customer'] } })

    const result = await sendQuoteLink({ id: 'q1', channel: 'whatsapp', to: '+47 900 00 000' })

    expect(result.success).toBe(false)
    expect(result.error).toContain('no message variable to carry the link')
    expect(sendOrgWhatsapp).not.toHaveBeenCalled()
    expect(markQuoteSent).not.toHaveBeenCalled()
  })
})

describe('invoices and inspections', () => {
  it('issues the invoice before its link goes out, to the vehicle’s customer', async () => {
    serviceRecord.findFirst.mockResolvedValue({
      vehicleId: 'v1',
      customer: null,
      vehicle: { customer: OLA },
    })

    const result = await sendInvoiceLink({ id: 'r1', channel: 'whatsapp', to: '+47 900 00 000' })

    expect(result.success).toBe(true)
    expect(issueInvoice).toHaveBeenCalledWith('r1', 'org1', 'sent')
    // Issued first, so the link shows the copy that is kept.
    expect(issueInvoice.mock.invocationCallOrder[0]).toBeLessThan(
      ensureShareToken.mock.invocationCallOrder[0]
    )
    expect(sendOrgWhatsapp.mock.calls[0][1].body).toContain('/share/invoice/org1/held')
    expect(sendOrgWhatsapp.mock.calls[0][1].customerId).toBe('c1')
    expect(markInvoiceSent).toHaveBeenCalledWith('r1', 'org1', { alreadyIssued: true })
  })

  it('texts an inspection’s link', async () => {
    inspection.findFirst.mockResolvedValue({ vehicle: { customer: OLA } })

    const result = await sendInspectionLink({ id: 'i1', channel: 'sms', to: '+47 900 00 000' })

    expect(result.success).toBe(true)
    expect(deliverSms.mock.calls[0][1].body).toContain('/share/inspection/org1/held')
  })
})
