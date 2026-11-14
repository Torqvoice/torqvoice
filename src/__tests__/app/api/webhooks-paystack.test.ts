/**
 * @vitest-environment node
 *
 * A Paystack notification books a payment only when it was signed with the
 * workshop's own key and Paystack itself confirms the transaction was paid
 * for that invoice. Anyone can post to the URL, so everything else is
 * turned away without a row being written.
 */
import { createHmac } from 'node:crypto'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { db, payments, recordVendorPayment } = vi.hoisted(() => ({
  db: { serviceRecord: { findUnique: vi.fn() } },
  payments: { paymentProviderFor: vi.fn() },
  recordVendorPayment: vi.fn(),
}))

vi.mock('@/lib/backup/freeze', () => ({
  isRestoring: vi.fn(() => false),
  RESTORE_IN_PROGRESS_MESSAGE: 'A restore of this workshop is in progress.',
}))
vi.mock('@/lib/db', () => ({ db }))
vi.mock('@/features/integrations/Lib/payments', () => payments)
vi.mock('@/lib/payment-providers/record-payment', () => ({ recordVendorPayment }))

import { POST } from '@/app/api/webhooks/paystack/route'

const ORG = 'org_1'
const KEY = 'sk_test_workshop'
const verifyPayment = vi.fn()

function chargeSuccess(overrides: Record<string, unknown> = {}) {
  return {
    event: 'charge.success',
    data: {
      reference: 'inv-sr_1-1',
      status: 'success',
      amount: 125050,
      metadata: { serviceRecordId: 'sr_1', orgId: ORG },
      ...overrides,
    },
  }
}

function post(event: unknown, key: string | null = KEY) {
  const body = JSON.stringify(event)
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (key) headers['x-paystack-signature'] = createHmac('sha512', key).update(body).digest('hex')
  return POST(
    new Request('http://app.test/api/webhooks/paystack', { method: 'POST', headers, body })
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  db.serviceRecord.findUnique.mockResolvedValue({ id: 'sr_1', organizationId: ORG })
  verifyPayment.mockResolvedValue({
    paid: true,
    amount: 1250.5,
    serviceRecordId: 'sr_1',
    organizationId: ORG,
  })
  payments.paymentProviderFor.mockResolvedValue({
    setup: { credentials: { secretKey: KEY } },
    provider: { verifyPayment },
  })
  recordVendorPayment.mockResolvedValue({ id: 'pay_1', created: true })
})

describe('a Paystack notification', () => {
  it('books the amount Paystack confirms, on the invoice the transaction was started for', async () => {
    const response = await post(chargeSuccess())

    expect(response.status).toBe(200)
    expect(verifyPayment).toHaveBeenCalledWith('inv-sr_1-1')
    expect(recordVendorPayment).toHaveBeenCalledWith({
      amount: 1250.5,
      method: 'paystack',
      provider: 'paystack',
      externalId: 'inv-sr_1-1',
      serviceRecordId: 'sr_1',
    })
  })

  it('is turned away when it was not signed with the workshop key', async () => {
    const response = await post(chargeSuccess(), 'sk_test_somebody_else')
    expect(response.status).toBe(400)
    expect(verifyPayment).not.toHaveBeenCalled()
    expect(recordVendorPayment).not.toHaveBeenCalled()
  })

  it('is turned away when it carries no signature', async () => {
    const response = await post(chargeSuccess(), null)
    expect(response.status).toBe(400)
    expect(recordVendorPayment).not.toHaveBeenCalled()
  })

  it('books nothing when Paystack says the transaction was not paid, whatever the notification claims', async () => {
    verifyPayment.mockResolvedValue({
      paid: false,
      amount: 0,
      serviceRecordId: 'sr_1',
      organizationId: ORG,
    })
    const response = await post(chargeSuccess())
    expect(response.status).toBe(200)
    expect(recordVendorPayment).not.toHaveBeenCalled()
  })

  it('books nothing when Paystack says the transaction belongs to another invoice', async () => {
    verifyPayment.mockResolvedValue({
      paid: true,
      amount: 1250.5,
      serviceRecordId: 'sr_other',
      organizationId: ORG,
    })
    const response = await post(chargeSuccess())
    expect(response.status).toBe(400)
    expect(recordVendorPayment).not.toHaveBeenCalled()
  })

  it('quietly accepts a charge made elsewhere on the same Paystack account', async () => {
    const response = await post(chargeSuccess({ metadata: {} }))
    expect(response.status).toBe(200)
    expect(payments.paymentProviderFor).not.toHaveBeenCalled()
    expect(recordVendorPayment).not.toHaveBeenCalled()
  })

  it('quietly accepts events that are not a successful charge', async () => {
    const response = await post({ event: 'transfer.success', data: {} })
    expect(response.status).toBe(200)
    expect(recordVendorPayment).not.toHaveBeenCalled()
  })

  it('answers 400 for a workshop that has not connected Paystack', async () => {
    payments.paymentProviderFor.mockResolvedValue(null)
    const response = await post(chargeSuccess())
    expect(response.status).toBe(400)
    expect(recordVendorPayment).not.toHaveBeenCalled()
  })
})
