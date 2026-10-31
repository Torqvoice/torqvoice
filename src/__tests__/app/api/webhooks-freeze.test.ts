/**
 * @vitest-environment node
 *
 * While a workshop is being restored, the vendor webhooks write nothing for
 * it: a payment or a message filed now would be lost when the restore
 * replaces the workshop's rows. They answer 503 with Retry-After, so the
 * vendor delivers the event again once the restore is done.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { db, payments, stripe, recordVendorPayment, messaging, whatsapp, notify } = vi.hoisted(
  () => ({
    db: {
      serviceRecord: { findUnique: vi.fn() },
      payment: { findFirst: vi.fn() },
      customer: { findFirst: vi.fn() },
      smsMessage: { create: vi.fn() },
    },
    payments: { paymentProviderFor: vi.fn() },
    stripe: { retrieve: vi.fn() },
    recordVendorPayment: vi.fn(),
    messaging: { organizationForWebhookSecret: vi.fn(), channelSetup: vi.fn() },
    whatsapp: {
      getWhatsappWebhookContext: vi.fn(),
      markWhatsappWebhookSeen: vi.fn(),
      applyWhatsappStatus: vi.fn(),
      recordInboundWhatsapp: vi.fn(),
    },
    notify: vi.fn(),
  })
)

vi.mock('@/lib/backup/freeze', () => ({
  isRestoring: vi.fn(() => true),
  RESTORE_IN_PROGRESS_MESSAGE: 'A restore of this workshop is in progress.',
}))
vi.mock('@/lib/db', () => ({ db }))
vi.mock('@/features/integrations/Lib/payments', () => payments)
vi.mock('@/lib/payment-providers/vendor-hosts', () => ({
  stripeClient: () => ({ checkout: { sessions: { retrieve: stripe.retrieve } } }),
}))
vi.mock('@/lib/payment-providers/record-payment', () => ({ recordVendorPayment }))
vi.mock('@/features/integrations/Lib/messaging', () => messaging)
vi.mock('@/lib/whatsapp', () => whatsapp)
vi.mock('@/lib/notify', () => ({ notify }))

import { POST as stripePost } from '@/app/api/webhooks/stripe/route'
import { POST as vippsPost } from '@/app/api/webhooks/vipps/route'
import { POST as paypalPost } from '@/app/api/webhooks/paypal/route'
import { POST as twilioPost } from '@/app/api/webhooks/sms/twilio/route'
import { POST as vonagePost } from '@/app/api/webhooks/sms/vonage/route'
import { POST as telnyxPost } from '@/app/api/webhooks/sms/telnyx/route'
import { POST as whatsappPost } from '@/app/api/webhooks/whatsapp/[provider]/[organizationId]/route'
import { isRestoring } from '@/lib/backup/freeze'

const ORG = 'org_frozen'

function json(url: string, body: unknown) {
  return new Request(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

async function expectRestoring(response: Response) {
  expect(response.status).toBe(503)
  expect(response.headers.get('Retry-After')).toBe('300')
  expect(await response.json()).toEqual({ error: 'A restore of this workshop is in progress.' })
}

const verifyPayment = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  db.serviceRecord.findUnique.mockResolvedValue({ id: 'sr_1', organizationId: ORG })
  db.payment.findFirst.mockResolvedValue(null)
  db.customer.findFirst.mockResolvedValue({ id: 'cust_1', name: 'Kari' })
  db.smsMessage.create.mockResolvedValue({ id: 'sms_1' })
  verifyPayment.mockResolvedValue({
    paid: true,
    amount: 100,
    serviceRecordId: 'sr_1',
    organizationId: ORG,
  })
  payments.paymentProviderFor.mockResolvedValue({
    setup: { credentials: { secretKey: 'sk_test' } },
    provider: { verifyPayment },
  })
  stripe.retrieve.mockResolvedValue({
    id: 'cs_1',
    metadata: { orgId: ORG, serviceRecordId: 'sr_1' },
    payment_status: 'paid',
    amount_total: 10000,
    currency: 'usd',
  })
  messaging.organizationForWebhookSecret.mockResolvedValue(ORG)
  messaging.channelSetup.mockResolvedValue(null)
})

describe('payment webhooks during a restore', () => {
  it('Stripe answers 503 and books nothing', async () => {
    const response = await stripePost(
      json('http://app.test/api/webhooks/stripe', {
        type: 'checkout.session.completed',
        data: { object: { id: 'cs_1', metadata: { orgId: ORG, serviceRecordId: 'sr_1' } } },
      })
    )
    await expectRestoring(response)
    expect(isRestoring).toHaveBeenCalledWith(ORG)
    expect(recordVendorPayment).not.toHaveBeenCalled()
  })

  it('Vipps answers 503 before verifying or booking the payment', async () => {
    const response = await vippsPost(
      json('http://app.test/api/webhooks/vipps', {
        reference: 'inv-sr_1-1',
        metadata: { orgId: ORG, serviceRecordId: 'sr_1' },
      })
    )
    await expectRestoring(response)
    expect(verifyPayment).not.toHaveBeenCalled()
    expect(recordVendorPayment).not.toHaveBeenCalled()
  })

  it('PayPal answers 503 before capturing or booking the order', async () => {
    const response = await paypalPost(
      json('http://app.test/api/webhooks/paypal', {
        event_type: 'PAYMENT.CAPTURE.COMPLETED',
        resource: { id: 'order_1', custom_id: `sr_1:${ORG}` },
      })
    )
    await expectRestoring(response)
    expect(verifyPayment).not.toHaveBeenCalled()
    expect(recordVendorPayment).not.toHaveBeenCalled()
  })
})

describe('SMS webhooks during a restore', () => {
  it('Twilio answers 503 and files no message', async () => {
    const response = await twilioPost(
      new Request('http://app.test/api/webhooks/sms/twilio?org_secret=s', {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ From: '+4799999999', To: '+4711111111', Body: 'Hi' }),
      })
    )
    await expectRestoring(response)
    expect(db.customer.findFirst).not.toHaveBeenCalled()
    expect(db.smsMessage.create).not.toHaveBeenCalled()
  })

  it('Vonage answers 503 and files no message', async () => {
    const response = await vonagePost(
      json('http://app.test/api/webhooks/sms/vonage?org_secret=s', {
        msisdn: '4799999999',
        to: '4711111111',
        text: 'Hi',
      })
    )
    await expectRestoring(response)
    expect(db.smsMessage.create).not.toHaveBeenCalled()
  })

  it('Telnyx answers 503 and files no message', async () => {
    const response = await telnyxPost(
      json('http://app.test/api/webhooks/sms/telnyx?org_secret=s', {
        data: {
          event_type: 'message.received',
          payload: { from: { phone_number: '+4799999999' }, to: '+4711111111', text: 'Hi' },
        },
      })
    )
    await expectRestoring(response)
    expect(db.smsMessage.create).not.toHaveBeenCalled()
  })
})

describe('WhatsApp webhook during a restore', () => {
  it('answers 503 and reads or files nothing', async () => {
    const receive = vi.fn()
    whatsapp.getWhatsappWebhookContext.mockResolvedValue({
      adapter: { id: 'meta', receive, acknowledge: () => new Response(null, { status: 200 }) },
      context: {},
    })
    const response = await whatsappPost(
      json(`http://app.test/api/webhooks/whatsapp/meta/${ORG}`, { entry: [] }),
      { params: Promise.resolve({ provider: 'meta', organizationId: ORG }) }
    )
    await expectRestoring(response)
    expect(receive).not.toHaveBeenCalled()
    expect(whatsapp.recordInboundWhatsapp).not.toHaveBeenCalled()
    expect(whatsapp.markWhatsappWebhookSeen).not.toHaveBeenCalled()
  })
})
