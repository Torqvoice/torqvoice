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
      expect(shouldIssue({ issuedAt: null }, false, reason)).toBe(true)
    }
  })

  it('re-captures on send while the invoice is not locked', () => {
    expect(shouldIssue({ issuedAt: t0 }, false, 'sent')).toBe(true)
  })

  it('keeps the snapshot a locked invoice already has when sent again', () => {
    expect(shouldIssue({ issuedAt: t0 }, true, 'sent')).toBe(false)
  })

  it('never overwrites an issue on payment or backfill', () => {
    expect(shouldIssue({ issuedAt: t0 }, false, 'paid')).toBe(false)
    expect(shouldIssue({ issuedAt: t0 }, false, 'backfill')).toBe(false)
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
