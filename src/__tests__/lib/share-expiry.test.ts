/**
 * When a share link stops working. The workshop here is in Auckland, half a
 * day ahead of the server's UTC, so a rule that counted days on the server's
 * clock would close a link a day early or late.
 */
import { describe, expect, it } from 'vitest'
import {
  invoicePayment,
  isShareExpired,
  readShareExpiryRules,
  type ShareLinkFacts,
  shareExpiry,
  shareOpenUntilDay,
} from '@/lib/share-expiry'
import { formatDate } from '@/lib/format'

const ZONE = 'Pacific/Auckland'

const link = (over: Partial<ShareLinkFacts> = {}): ShareLinkFacts => ({
  sharedAt: new Date('2026-03-01T22:00:00Z'), // 2 March, 11:00 in Auckland
  renewedAt: null,
  expiresAt: null,
  neverExpires: false,
  ...over,
})

describe('the workshop’s rule', () => {
  it('is 30 days for a workshop that never set one: after payment for invoices, after sending for the rest', () => {
    expect(readShareExpiryRules({})).toEqual({
      invoice: { mode: 'afterPayment', days: 30 },
      quote: { mode: 'afterSharing', days: 30 },
      inspection: { mode: 'afterSharing', days: 30 },
    })
  })

  it('leaves links open for a workshop that chose never', () => {
    const rules = readShareExpiryRules({ 'shareLinks.quoteExpiry': 'never' })
    expect(shareExpiry(link(), rules.quote, ZONE)).toEqual({ kind: 'never', source: 'workshop' })
  })

  it('does not offer "after payment" for a quote, whatever was saved', () => {
    const rules = readShareExpiryRules({ 'shareLinks.quoteExpiry': 'afterPayment' })
    expect(rules.quote.mode).toBe('afterSharing')
  })

  it('keeps a link open through the whole last day on the workshop’s clock', () => {
    const expiry = shareExpiry(link(), { mode: 'afterSharing', days: 30 }, ZONE)
    // Shared on 2 March in Auckland, so it works through 1 April there:
    // the last instant is 1 April 23:59:59.999 NZDT, which is 10:59 UTC.
    expect(expiry).toMatchObject({ kind: 'date', source: 'workshop' })
    if (expiry.kind !== 'date') throw new Error('expected a date')
    expect(expiry.at.toISOString()).toBe('2026-04-01T10:59:59.999Z')
    expect(isShareExpired(expiry, new Date('2026-04-01T10:00:00Z'))).toBe(false)
    expect(isShareExpired(expiry, new Date('2026-04-01T11:00:00Z'))).toBe(true)
  })

  it('counts again from the day the link was sent again', () => {
    const expiry = shareExpiry(
      link({ renewedAt: new Date('2026-06-10T01:00:00Z') }),
      { mode: 'afterSharing', days: 7 },
      ZONE
    )
    if (expiry.kind !== 'date') throw new Error('expected a date')
    // 10 June 13:00 in Auckland, plus seven days, through 17 June there.
    expect(expiry.at.toISOString()).toBe('2026-06-17T11:59:59.999Z')
  })
})

describe('an invoice link under "after payment"', () => {
  const rule = { mode: 'afterPayment', days: 14 } as const

  it('stays open for as long as the invoice is owed on', () => {
    const expiry = shareExpiry(link({ payment: { paid: false, at: null } }), rule, ZONE)
    expect(expiry).toEqual({ kind: 'untilPaid', source: 'workshop' })
    expect(isShareExpired(expiry, new Date('2040-01-01T00:00:00Z'))).toBe(false)
  })

  it('counts from the day it was paid', () => {
    const expiry = shareExpiry(
      link({ payment: { paid: true, at: new Date('2026-03-20T03:00:00Z') } }),
      rule,
      ZONE
    )
    if (expiry.kind !== 'date') throw new Error('expected a date')
    // Paid 20 March in Auckland, open through 3 April there.
    expect(expiry.at.toISOString()).toBe('2026-04-03T10:59:59.999Z')
  })

  it('counts from the day it was sent when the receipt went out after payment', () => {
    const expiry = shareExpiry(
      link({
        sharedAt: new Date('2026-05-01T00:00:00Z'),
        payment: { paid: true, at: new Date('2026-01-05T00:00:00Z') },
      }),
      rule,
      ZONE
    )
    if (expiry.kind !== 'date') throw new Error('expected a date')
    expect(expiry.at > new Date('2026-05-14T00:00:00Z')).toBe(true)
  })
})

describe('what one document says about its own link', () => {
  const rule = { mode: 'afterSharing', days: 1 } as const

  it('wins over the workshop’s rule when it says never', () => {
    expect(shareExpiry(link({ neverExpires: true }), rule, ZONE)).toEqual({
      kind: 'never',
      source: 'document',
    })
  })

  it('wins over the workshop’s rule when it names a date', () => {
    const at = new Date('2027-01-01T10:59:59.999Z')
    expect(shareExpiry(link({ expiresAt: at }), { mode: 'never', days: 90 }, ZONE)).toEqual({
      kind: 'date',
      at,
      source: 'document',
    })
  })
})

describe('whether an invoice is paid, and when', () => {
  const invoice = {
    totalAmount: 1000,
    manuallyPaid: false,
    manuallyPaidAt: null,
    payments: [] as { amount: number; date: Date }[],
  }

  it('is unpaid while a balance is left', () => {
    const payments = [{ amount: 400, date: new Date('2026-02-01T00:00:00Z') }]
    expect(invoicePayment({ ...invoice, payments })).toEqual({ paid: false, at: null })
  })

  it('is paid on the day of the payment that covered it', () => {
    const payments = [
      { amount: 400, date: new Date('2026-02-01T00:00:00Z') },
      { amount: 600, date: new Date('2026-02-09T00:00:00Z') },
    ]
    expect(invoicePayment({ ...invoice, payments })).toEqual({
      paid: true,
      at: new Date('2026-02-09T00:00:00Z'),
    })
  })

  it('is paid on the day it was marked paid by hand', () => {
    const at = new Date('2026-02-11T08:00:00Z')
    expect(invoicePayment({ ...invoice, manuallyPaid: true, manuallyPaidAt: at })).toEqual({
      paid: true,
      at,
    })
  })
})

describe('the day the share page says a link works until', () => {
  // The end of 8 December in Auckland is 10:59:59.999 UTC.
  const endOf8Dec = new Date('2026-12-08T10:59:59.999Z')
  const now = new Date('2026-11-24T12:00:00Z')
  const day = (at: Date) => {
    const until = shareOpenUntilDay({ kind: 'date', at, source: 'document' }, ZONE, now)
    return until ? formatDate(until, 'dd/MM/yyyy', ZONE) : null
  }

  it('is the day the link closes at the end of', () => {
    expect(day(endOf8Dec)).toBe('08/12/2026')
  })

  it('is the same day when the close was stored without its last milliseconds', () => {
    // 23:59:59 and 23:59 on 8 December. The staff page names 08/12 for
    // both; the share page used to say "until 07/12/2026".
    expect(day(new Date(endOf8Dec.getTime() - 999))).toBe('08/12/2026')
    expect(day(new Date(endOf8Dec.getTime() - 59_999))).toBe('08/12/2026')
  })

  it('is the day before for a link that closes partway through a day', () => {
    // 14 days to the minute: closing at 17:30 on the 8th, it is promised
    // only through the 7th.
    expect(day(new Date('2026-12-08T04:30:00Z'))).toBe('07/12/2026')
  })
})
