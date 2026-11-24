/**
 * @vitest-environment node
 *
 * A payment the provider has already taken is booked in full, even when it
 * is more than the invoice still owes. The desk's payment form refuses an
 * amount above the balance; a customer's card has been charged by then, and
 * dropping that row would lose real money from the books. The webhooks go
 * through recordVendorPayment, which writes what the provider confirmed
 * without asking for the balance.
 */
import { createHmac } from 'node:crypto'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { db, payments, verifyPayment } = vi.hoisted(() => ({
  db: {
    serviceRecord: { findUnique: vi.fn(), findFirst: vi.fn() },
    payment: { createManyAndReturn: vi.fn(), findFirst: vi.fn(), aggregate: vi.fn() },
    $transaction: vi.fn(),
    $queryRaw: vi.fn(),
  },
  payments: { paymentProviderFor: vi.fn() },
  verifyPayment: vi.fn(),
}))

vi.mock('@/lib/backup/freeze', () => ({
  isRestoring: vi.fn(() => false),
  RESTORE_IN_PROGRESS_MESSAGE: 'A restore of this workshop is in progress.',
}))
vi.mock('@/lib/db', () => ({ db }))
vi.mock('@/features/integrations/Lib/payments', () => payments)
vi.mock('@/lib/payment-providers/paystack', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/payment-providers/paystack')>()
  return {
    ...actual,
    PaystackProvider: class {
      lookup(reference: string) {
        return verifyPayment(reference)
      }
    },
  }
})

import { POST } from '@/app/api/webhooks/paystack/route'

const ORG = 'org_1'
const KEY = 'sk_test_workshop'

function post() {
  const body = JSON.stringify({
    event: 'charge.success',
    data: { reference: 'inv-sr_1-1', metadata: { serviceRecordId: 'sr_1', orgId: ORG } },
  })
  return POST(
    new Request('http://app.test/api/webhooks/paystack', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-paystack-signature': createHmac('sha512', KEY).update(body).digest('hex'),
      },
      body,
    })
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  db.serviceRecord.findUnique.mockResolvedValue({ id: 'sr_1', organizationId: ORG })
  // The invoice owes £552.74 and has £500 against it already.
  db.serviceRecord.findFirst.mockResolvedValue({ id: 'sr_1', totalAmount: 552.74, cost: 0 })
  db.payment.aggregate.mockResolvedValue({ _sum: { amount: 500 } })
  db.payment.createManyAndReturn.mockResolvedValue([{ id: 'pay_1' }])
  payments.paymentProviderFor.mockResolvedValue({
    setup: { credentials: { secretKey: KEY } },
    provider: { verifyPayment },
  })
})

describe('a provider-confirmed payment above the balance due', () => {
  it('is booked for the full amount the provider took', async () => {
    verifyPayment.mockResolvedValue({
      paid: true,
      amount: 1000,
      serviceRecordId: 'sr_1',
      organizationId: ORG,
    })

    const response = await post()

    expect(response.status).toBe(200)
    expect(db.payment.createManyAndReturn).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [expect.objectContaining({ serviceRecordId: 'sr_1', amount: 1000 })],
      })
    )
    expect(db.$transaction).not.toHaveBeenCalled()
  })
})
