import { describe, expect, it } from 'vitest'
import { paymentMatchesRecord } from '@/lib/payment-providers/attribution'

const expected = { serviceRecordId: 'rec_1', organizationId: 'org_1' }

describe('paymentMatchesRecord', () => {
  it('matches when the order names the same record and organisation', () => {
    expect(
      paymentMatchesRecord({ serviceRecordId: 'rec_1', organizationId: 'org_1' }, expected)
    ).toBe(true)
  })

  it('refuses an order paid for another record or organisation', () => {
    expect(
      paymentMatchesRecord({ serviceRecordId: 'rec_2', organizationId: 'org_1' }, expected)
    ).toBe(false)
    expect(
      paymentMatchesRecord({ serviceRecordId: 'rec_1', organizationId: 'org_2' }, expected)
    ).toBe(false)
  })

  it('refuses an order that carries no attribution at all', () => {
    expect(paymentMatchesRecord({}, expected)).toBe(false)
    expect(paymentMatchesRecord({ serviceRecordId: 'rec_1' }, expected)).toBe(false)
    expect(paymentMatchesRecord({ serviceRecordId: 'rec_1', organizationId: null }, expected)).toBe(
      false
    )
    expect(paymentMatchesRecord({ serviceRecordId: '', organizationId: 'org_1' }, expected)).toBe(
      false
    )
  })

  it('refuses when the record itself has no organisation', () => {
    expect(
      paymentMatchesRecord(
        { serviceRecordId: 'rec_1', organizationId: 'org_1' },
        { serviceRecordId: 'rec_1', organizationId: '' }
      )
    ).toBe(false)
  })
})
