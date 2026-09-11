import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Booking a reported payment once.
 *
 * The database is what refuses the second row, and the end-to-end test
 * `e2e/specs/payments/booked-once.spec.ts` races real reports against it.
 * These pin what the code does around that: skip a row the key already holds
 * rather than raise on it, hand back the row that won, say it was not created,
 * and never pass off a different failure as a duplicate.
 */

const createManyAndReturn = vi.fn()
const findFirst = vi.fn()
vi.mock('@/lib/db', () => ({
  db: {
    payment: {
      createManyAndReturn: (a: unknown) => createManyAndReturn(a),
      findFirst: (a: unknown) => findFirst(a),
    },
  },
}))

const { recordVendorPayment } = await import('@/lib/payment-providers/record-payment')

const input = {
  serviceRecordId: 'job_1',
  provider: 'stripe',
  externalId: 'cs_test_1',
  amount: 400,
  method: 'stripe',
}

beforeEach(() => {
  createManyAndReturn.mockReset()
  findFirst.mockReset()
})

describe('a payment reported for the first time', () => {
  it('is written, and said to be new', async () => {
    createManyAndReturn.mockResolvedValue([{ id: 'pay_1' }])
    await expect(recordVendorPayment(input)).resolves.toEqual({ id: 'pay_1', created: true })
    expect(findFirst).not.toHaveBeenCalled()
  })

  it('is written so that a row the key already holds is skipped, not raised on', async () => {
    // A duplicate is the normal case for a card payment, so it must not be an
    // error: raised and caught, it would be logged for most payments taken.
    createManyAndReturn.mockResolvedValue([{ id: 'pay_1' }])
    await recordVendorPayment(input)
    expect(createManyAndReturn).toHaveBeenCalledWith(
      expect.objectContaining({
        skipDuplicates: true,
        data: [
          expect.objectContaining({
            serviceRecordId: 'job_1',
            provider: 'stripe',
            externalId: 'cs_test_1',
            amount: 400,
          }),
        ],
      })
    )
  })
})

describe('a payment another report has just written', () => {
  it('comes back as the row that won, not as a second one', async () => {
    createManyAndReturn.mockResolvedValue([])
    findFirst.mockResolvedValue({ id: 'pay_1' })

    await expect(recordVendorPayment(input)).resolves.toEqual({ id: 'pay_1', created: false })
    // Looked up by the same three things the database keeps unique.
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { serviceRecordId: 'job_1', provider: 'stripe', externalId: 'cs_test_1' },
      })
    )
  })
})

describe('anything else going wrong', () => {
  it('is not mistaken for a duplicate', async () => {
    const down = Object.assign(new Error('Connection lost'), { code: 'P1001' })
    createManyAndReturn.mockRejectedValue(down)
    await expect(recordVendorPayment(input)).rejects.toBe(down)
    expect(findFirst).not.toHaveBeenCalled()
  })

  it('is not swallowed when nothing was written and no row holds the payment', async () => {
    createManyAndReturn.mockResolvedValue([])
    findFirst.mockResolvedValue(null)
    await expect(recordVendorPayment(input)).rejects.toThrow(/was not written and no row holds it/)
  })
})
