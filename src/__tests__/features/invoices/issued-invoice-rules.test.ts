/**
 * When an invoice prints from what it was issued with, and when issuing it
 * again captures a fresh copy. These two rules are the whole promise that a
 * changed address, logo or title cannot rewrite paper a customer holds, so
 * they are pinned down case by case.
 */
import { describe, expect, it } from 'vitest'
import {
  readIssuedInvoiceData,
  rendersFromIssue,
  shouldIssue,
  wasIssuedBeforeTracking,
} from '@/features/invoices/Lib/issuedInvoice'

const t0 = new Date('2026-09-01T10:00:00Z')
const t1 = new Date('2026-09-02T10:00:00Z')

describe('rendersFromIssue', () => {
  it('prints a draft from live rows', () => {
    expect(rendersFromIssue({ issuedAt: null, issuedData: null })).toBe(false)
  })

  it('prints an issued invoice from its snapshot', () => {
    expect(rendersFromIssue({ issuedAt: t0, issuedData: { version: 1 } })).toBe(true)
  })

  it('falls back to live rows when the snapshot is missing', () => {
    expect(rendersFromIssue({ issuedAt: t0, issuedData: null })).toBe(false)
  })

  it('reopens the document while an unlock is newer than the issue', () => {
    expect(rendersFromIssue({ issuedAt: t0, editUnlockedAt: t1, issuedData: { version: 1 } })).toBe(
      false
    )
  })

  it('keeps the snapshot once the issue is newer than the unlock', () => {
    expect(rendersFromIssue({ issuedAt: t1, editUnlockedAt: t0, issuedData: { version: 1 } })).toBe(
      true
    )
  })
})

describe('shouldIssue', () => {
  it('captures a never-issued invoice for any reason', () => {
    for (const reason of ['sent', 'paid', 'backfill'] as const) {
      expect(shouldIssue({ issuedAt: null }, reason)).toBe(true)
    }
  })

  it('keeps the snapshot when an issued invoice is sent again', () => {
    // The design, the address or the terms may all have changed since. The
    // customer holds the first copy, and the preview shows it, so the email
    // must carry that same copy. This is the case that went wrong once.
    expect(shouldIssue({ issuedAt: t0 }, 'sent')).toBe(false)
    expect(shouldIssue({ issuedAt: t1, editUnlockedAt: t0 }, 'sent')).toBe(false)
  })

  it('re-captures on send after an owner unlocked the invoice', () => {
    expect(shouldIssue({ issuedAt: t0, editUnlockedAt: t1 }, 'sent')).toBe(true)
  })

  it('never overwrites an issue on payment or backfill, even when unlocked', () => {
    expect(shouldIssue({ issuedAt: t0, editUnlockedAt: t1 }, 'paid')).toBe(false)
    expect(shouldIssue({ issuedAt: t0, editUnlockedAt: t1 }, 'backfill')).toBe(false)
  })
})

describe('wasIssuedBeforeTracking', () => {
  it('is true for an invoice that went out before issuing existed', () => {
    expect(
      wasIssuedBeforeTracking({ issuedAt: null, sentAt: t0, manuallyPaid: false, payments: [] })
    ).toBe(true)
    expect(
      wasIssuedBeforeTracking({ issuedAt: null, sentAt: null, manuallyPaid: true, payments: [] })
    ).toBe(true)
    expect(
      wasIssuedBeforeTracking({
        issuedAt: null,
        sentAt: null,
        manuallyPaid: false,
        payments: [{ amount: 10 }],
      })
    ).toBe(true)
  })

  it('is false for a draft and for anything already issued', () => {
    expect(
      wasIssuedBeforeTracking({ issuedAt: null, sentAt: null, manuallyPaid: false, payments: [] })
    ).toBe(false)
    expect(
      wasIssuedBeforeTracking({ issuedAt: t0, sentAt: t0, manuallyPaid: true, payments: [] })
    ).toBe(false)
  })
})

describe('readIssuedInvoiceData', () => {
  it('reads a snapshot with fields this version never heard of', () => {
    const data = readIssuedInvoiceData({
      version: 7,
      workshop: { name: 'Shop', address: 'Road 1', phone: '', email: '', futureField: 'x' },
      invoiceSettings: { paymentTerms: 'Net 14', somethingNew: true },
      customer: { name: 'Ann', loyaltyTier: 'gold' },
    })
    expect(data?.workshop.name).toBe('Shop')
    expect(data?.invoiceSettings.paymentTerms).toBe('Net 14')
    expect(data?.customer?.name).toBe('Ann')
  })

  it('fills the blocks every renderer reads when a snapshot lacks them', () => {
    const data = readIssuedInvoiceData({ version: 1 })
    expect(data?.workshop).toEqual({ name: '', address: '', phone: '', email: '' })
    expect(data?.invoiceSettings).toEqual({})
  })

  it('refuses what is not a snapshot at all', () => {
    expect(readIssuedInvoiceData(null)).toBeNull()
    expect(readIssuedInvoiceData('nope')).toBeNull()
    expect(readIssuedInvoiceData({ workshop: {} })).toBeNull()
  })
})
