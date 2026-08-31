/**
 * Tests for the invoice and quote edit lock.
 *
 * This guards money that has already left the workshop, so the cases that
 * matter most are the ones where the lock must NOT engage: a lock that catches
 * too much strands a document someone still has to correct, and the usual
 * outcome is that the whole feature gets switched off. Each rule is therefore
 * tested from both sides.
 */

import { describe, it, expect } from 'vitest'
import {
  DOCUMENT_LOCK_DEFAULTS,
  DocumentLockedError,
  assertEditable,
  invoiceLockState,
  invoicePaymentStatus,
  quoteLockState,
  readDocumentLockSettings,
  type DocumentLockSettings,
} from '@/lib/document-lock'

const KEYS = {
  invoiceLockEnabled: 'workshop.invoiceLockEnabled',
  invoiceLockTrigger: 'workshop.invoiceLockTrigger',
  quoteLockEnabled: 'workshop.quoteLockEnabled',
  quoteLockTrigger: 'workshop.quoteLockTrigger',
}

const settingsFor = (over: Partial<DocumentLockSettings> = {}): DocumentLockSettings => ({
  ...DOCUMENT_LOCK_DEFAULTS,
  ...over,
})

const invoice = (over: Partial<Parameters<typeof invoiceLockState>[0]> = {}) => ({
  sentAt: null,
  manuallyPaid: false,
  totalAmount: 500,
  cost: 0,
  payments: [],
  editUnlockedAt: null,
  ...over,
})

describe('readDocumentLockSettings', () => {
  it('is off by default, so an upgrade changes nothing', () => {
    const read = readDocumentLockSettings({}, KEYS)
    expect(read.invoiceLockEnabled).toBe(false)
    expect(read.quoteLockEnabled).toBe(false)
  })

  it('defaults each trigger to the later, less disruptive point', () => {
    const read = readDocumentLockSettings({}, KEYS)
    expect(read.invoiceLockTrigger).toBe('paid')
    expect(read.quoteLockTrigger).toBe('accepted')
  })

  it('reads the stored strings', () => {
    const read = readDocumentLockSettings(
      {
        [KEYS.invoiceLockEnabled]: 'true',
        [KEYS.invoiceLockTrigger]: 'sent',
        [KEYS.quoteLockEnabled]: 'true',
        [KEYS.quoteLockTrigger]: 'sent',
      },
      KEYS
    )
    expect(read).toEqual({
      invoiceLockEnabled: true,
      invoiceLockTrigger: 'sent',
      quoteLockEnabled: true,
      quoteLockTrigger: 'sent',
    })
  })

  it('treats anything other than the string "true" as off', () => {
    for (const value of ['false', '1', 'yes', 'TRUE', '']) {
      expect(
        readDocumentLockSettings({ [KEYS.invoiceLockEnabled]: value }, KEYS).invoiceLockEnabled
      ).toBe(false)
    }
  })

  it('falls back to the default trigger for an unrecognised value', () => {
    // A hand-edited settings row must not take out every invoice page.
    const read = readDocumentLockSettings(
      { [KEYS.invoiceLockTrigger]: 'whenever', [KEYS.quoteLockTrigger]: 'rejected' },
      KEYS
    )
    expect(read.invoiceLockTrigger).toBe('paid')
    expect(read.quoteLockTrigger).toBe('accepted')
  })
})

describe('invoicePaymentStatus', () => {
  it('counts what has been recorded against the total', () => {
    expect(
      invoicePaymentStatus({ manuallyPaid: false, totalAmount: 500, cost: 0, payments: [] })
    ).toBe('unpaid')
    expect(
      invoicePaymentStatus({
        manuallyPaid: false,
        totalAmount: 500,
        cost: 0,
        payments: [{ amount: 200 }],
      })
    ).toBe('partial')
    expect(
      invoicePaymentStatus({
        manuallyPaid: false,
        totalAmount: 500,
        cost: 0,
        payments: [{ amount: 200 }, { amount: 300 }],
      })
    ).toBe('paid')
  })

  it('treats an overpayment as paid', () => {
    expect(
      invoicePaymentStatus({
        manuallyPaid: false,
        totalAmount: 500,
        cost: 0,
        payments: [{ amount: 600 }],
      })
    ).toBe('paid')
  })

  it('honours a manual mark regardless of what is recorded', () => {
    expect(
      invoicePaymentStatus({ manuallyPaid: true, totalAmount: 500, cost: 0, payments: [] })
    ).toBe('paid')
  })

  it('falls back to cost for records predating itemised totals', () => {
    expect(
      invoicePaymentStatus({
        manuallyPaid: false,
        totalAmount: 0,
        cost: 400,
        payments: [{ amount: 400 }],
      })
    ).toBe('paid')
  })

  it('calls an empty draft unpaid rather than settled', () => {
    // Otherwise every zero-total draft locks itself the moment the setting is
    // turned on, which is the worst possible first impression of the feature.
    expect(
      invoicePaymentStatus({ manuallyPaid: false, totalAmount: 0, cost: 0, payments: [] })
    ).toBe('unpaid')
  })

  it('reads a missing payments list as nothing paid', () => {
    expect(invoicePaymentStatus({ manuallyPaid: false, totalAmount: 500, cost: 0 })).toBe('unpaid')
  })
})

describe('invoiceLockState, with locking switched off', () => {
  it('leaves a sent and fully paid invoice editable', () => {
    const state = invoiceLockState(
      invoice({ sentAt: new Date('2026-01-01'), manuallyPaid: true }),
      settingsFor({ invoiceLockEnabled: false })
    )
    expect(state).toEqual({ locked: false, reason: null, unlockedAt: null })
  })
})

describe('invoiceLockState, locking when sent', () => {
  const settings = settingsFor({ invoiceLockEnabled: true, invoiceLockTrigger: 'sent' })

  it('locks once the invoice has reached the customer', () => {
    const state = invoiceLockState(invoice({ sentAt: new Date('2026-01-01') }), settings)
    expect(state.locked).toBe(true)
    expect(state.reason).toBe('sent')
  })

  it('leaves an unsent invoice editable, however large', () => {
    expect(invoiceLockState(invoice({ totalAmount: 99999 }), settings).locked).toBe(false)
  })

  it('ignores payment entirely', () => {
    // Paid but never sent: this trigger is about the customer holding a copy.
    expect(invoiceLockState(invoice({ manuallyPaid: true }), settings).locked).toBe(false)
  })
})

describe('invoiceLockState, locking when paid', () => {
  const settings = settingsFor({ invoiceLockEnabled: true, invoiceLockTrigger: 'paid' })

  it('locks once the balance is settled', () => {
    const state = invoiceLockState(invoice({ payments: [{ amount: 500 }] }), settings)
    expect(state.locked).toBe(true)
    expect(state.reason).toBe('paid')
  })

  it('locks on a manual mark', () => {
    expect(invoiceLockState(invoice({ manuallyPaid: true }), settings).locked).toBe(true)
  })

  it('leaves a part-paid invoice editable', () => {
    // The outstanding balance is often exactly what is being discussed.
    expect(invoiceLockState(invoice({ payments: [{ amount: 200 }] }), settings).locked).toBe(false)
  })

  it('ignores sending entirely', () => {
    expect(invoiceLockState(invoice({ sentAt: new Date('2026-01-01') }), settings).locked).toBe(
      false
    )
  })

  it('leaves an empty draft editable', () => {
    expect(invoiceLockState(invoice({ totalAmount: 0, cost: 0 }), settings).locked).toBe(false)
  })
})

describe('invoiceLockState, after an owner or admin unlocks it', () => {
  const settings = settingsFor({ invoiceLockEnabled: true, invoiceLockTrigger: 'paid' })
  const unlockedAt = new Date('2026-02-01')

  it('reopens the document and says when', () => {
    const state = invoiceLockState(
      invoice({ manuallyPaid: true, editUnlockedAt: unlockedAt }),
      settings
    )
    expect(state).toEqual({ locked: false, reason: null, unlockedAt })
  })

  it('outranks either trigger', () => {
    const sentSettings = settingsFor({ invoiceLockEnabled: true, invoiceLockTrigger: 'sent' })
    const record = invoice({ sentAt: new Date('2026-01-01'), editUnlockedAt: unlockedAt })
    expect(invoiceLockState(record, sentSettings).locked).toBe(false)
  })
})

describe('quoteLockState', () => {
  const accepted = settingsFor({ quoteLockEnabled: true, quoteLockTrigger: 'accepted' })
  const sent = settingsFor({ quoteLockEnabled: true, quoteLockTrigger: 'sent' })

  it('leaves everything editable while switched off', () => {
    expect(quoteLockState({ status: 'accepted' }, settingsFor()).locked).toBe(false)
  })

  describe('locking when accepted', () => {
    it('locks an accepted quote', () => {
      expect(quoteLockState({ status: 'accepted' }, accepted)).toEqual({
        locked: true,
        reason: 'accepted',
        unlockedAt: null,
      })
    })

    it('locks a converted quote, whose job is already running', () => {
      expect(quoteLockState({ status: 'converted' }, accepted).locked).toBe(true)
    })

    it('leaves a sent quote editable, because quotes get negotiated', () => {
      expect(quoteLockState({ status: 'sent' }, accepted).locked).toBe(false)
    })

    it('leaves drafts, rejections and expiries editable', () => {
      for (const status of ['draft', 'rejected', 'expired']) {
        expect(quoteLockState({ status }, accepted).locked).toBe(false)
      }
    })
  })

  describe('locking when sent', () => {
    it('locks a sent quote and everything past it', () => {
      for (const status of ['sent', 'accepted', 'converted']) {
        expect(quoteLockState({ status }, sent).locked).toBe(true)
      }
    })

    it('leaves a draft editable', () => {
      expect(quoteLockState({ status: 'draft' }, sent).locked).toBe(false)
    })

    it('leaves a rejected or expired quote editable, so it can be revised', () => {
      for (const status of ['rejected', 'expired']) {
        expect(quoteLockState({ status }, sent).locked).toBe(false)
      }
    })
  })

  it('reopens after an unlock', () => {
    const unlockedAt = new Date('2026-02-01')
    expect(quoteLockState({ status: 'accepted', editUnlockedAt: unlockedAt }, accepted)).toEqual({
      locked: false,
      reason: null,
      unlockedAt,
    })
  })

  it('does not lock on an unknown status', () => {
    expect(quoteLockState({ status: 'something-new' }, sent).locked).toBe(false)
  })
})

describe('assertEditable', () => {
  it('passes an editable document through', () => {
    expect(() => assertEditable({ locked: false, reason: null, unlockedAt: null })).not.toThrow()
  })

  it('throws with the reason attached, so the message can name the rule', () => {
    try {
      assertEditable({ locked: true, reason: 'paid', unlockedAt: null })
      expect.unreachable('should have thrown')
    } catch (err) {
      expect(err).toBeInstanceOf(DocumentLockedError)
      expect((err as DocumentLockedError).reason).toBe('paid')
    }
  })
})
