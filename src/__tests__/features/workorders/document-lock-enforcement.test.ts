/**
 * Enforcement tests for the invoice and quote edit lock.
 *
 * The rules themselves are covered in lib/document-lock.test.ts. What is
 * tested here is that every way of changing what a document says it is owed
 * actually goes through them, and that the things a locked document must still
 * be able to do are not caught by mistake.
 *
 * The second half matters as much as the first. A lock that also stopped
 * payments being recorded would make a sent invoice unpayable, which is a
 * worse failure than no locking at all.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/cached-session', () => ({
  getCachedSession: vi.fn(),
  getCachedMembership: vi.fn(),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/resolve-upload-path', () => ({
  resolveUploadPath: vi.fn((url: string) => `/uploads/${url}`),
}))
vi.mock('@/lib/notification-bus', () => ({
  notificationBus: { publish: vi.fn(), emit: vi.fn() },
}))
vi.mock('@/lib/audit', () => ({ logAudit: vi.fn() }))
// Sending and paying freeze what the invoice prints. That capture reads the
// whole record and the workshop's files; here only the lock is under test.
vi.mock('@/features/invoices/Lib/issueInvoice', () => ({
  issueInvoice: vi.fn().mockResolvedValue(false),
}))

vi.mock('@/lib/db', () => ({
  db: {
    user: { findUnique: vi.fn() },
    appSetting: { findMany: vi.fn() },
    serviceRecord: {
      findFirst: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
    },
    quote: { findFirst: vi.fn(), update: vi.fn(), updateMany: vi.fn(), deleteMany: vi.fn() },
    servicePart: { findMany: vi.fn(), create: vi.fn() },
    payment: { create: vi.fn(), findFirst: vi.fn(), delete: vi.fn() },
    $transaction: vi.fn(),
  },
}))

import { getCachedSession, getCachedMembership } from '@/lib/cached-session'
import { db } from '@/lib/db'
import {
  updateServiceRecord,
  deleteServiceRecord,
  updateServiceStatus,
  toggleManuallyPaid,
  generatePublicLink,
} from '@/features/vehicles/Actions/serviceActions'
import { updateQuote, deleteQuote, updateQuoteStatus } from '@/features/quotes/Actions/quoteActions'
import { generateQuotePublicLink } from '@/features/quotes/Actions/quoteShareActions'
import { deletePayment } from '@/features/payments/Actions/paymentActions'
import { addPart } from '@/features/vehicles/Lib/addPart'
import { SETTING_KEYS } from '@/features/settings/Schema/settingsSchema'

const ORG = 'org-1'

function signInAsOwner() {
  vi.mocked(getCachedSession).mockResolvedValue({ user: { id: 'user-1' } } as any)
  vi.mocked(getCachedMembership).mockResolvedValue({
    organizationId: ORG,
    role: 'owner',
    roleId: null,
    customRole: null,
  } as any)
  vi.mocked(db.user.findUnique).mockResolvedValue({ isSuperAdmin: false } as any)
}

/** The org's lock configuration, as rows in the settings table. */
function lockSettings(rows: Record<string, string>) {
  vi.mocked(db.appSetting.findMany).mockResolvedValue(
    Object.entries(rows).map(([key, value]) => ({ key, value })) as any
  )
}

const LOCK_INVOICES_WHEN_PAID = {
  [SETTING_KEYS.INVOICE_LOCK_ENABLED]: 'true',
  [SETTING_KEYS.INVOICE_LOCK_TRIGGER]: 'paid',
}
const LOCK_QUOTES_WHEN_ACCEPTED = {
  [SETTING_KEYS.QUOTE_LOCK_ENABLED]: 'true',
  [SETTING_KEYS.QUOTE_LOCK_TRIGGER]: 'accepted',
}

/**
 * Asserts the lock let this through. The action may still fail for its own
 * reasons against these mocks, or succeed outright and carry no error at all,
 * so this checks only that the lock was not what stopped it.
 */
function expectNotBlockedByLock(result: { error?: string }) {
  expect(result.error ?? '').not.toMatch(/locked/i)
}

const PAID_INVOICE = {
  sentAt: null,
  manuallyPaid: true,
  totalAmount: 500,
  cost: 0,
  editUnlockedAt: null,
  payments: [{ amount: 500 }],
}
const UNPAID_INVOICE = { ...PAID_INVOICE, manuallyPaid: false, payments: [] }

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(db.$transaction).mockImplementation(async (cb: any) => cb(db))
  vi.mocked(db.servicePart.findMany).mockResolvedValue([] as any)
  signInAsOwner()
})

describe('a locked invoice refuses edits', () => {
  beforeEach(() => lockSettings(LOCK_INVOICES_WHEN_PAID))

  it('refuses updateServiceRecord', async () => {
    vi.mocked(db.serviceRecord.findFirst).mockResolvedValue(PAID_INVOICE as any)

    const result = await updateServiceRecord({ id: 'rec-1', title: 'Rewritten' })

    expect(result.success).toBe(false)
    expect(result.error).toMatch(/locked/i)
    // Nothing may reach the database, not even a partial write.
    expect(db.serviceRecord.update).not.toHaveBeenCalled()
    expect(db.serviceRecord.updateMany).not.toHaveBeenCalled()
  })

  it('refuses deleteServiceRecord', async () => {
    vi.mocked(db.serviceRecord.findFirst).mockResolvedValue(PAID_INVOICE as any)

    const result = await deleteServiceRecord('rec-1')

    expect(result.success).toBe(false)
    expect(result.error).toMatch(/locked/i)
    expect(db.serviceRecord.delete).not.toHaveBeenCalled()
    expect(db.serviceRecord.deleteMany).not.toHaveBeenCalled()
  })

  it('refuses addPart, which both the editor and the technician API come through', async () => {
    vi.mocked(db.serviceRecord.findFirst).mockResolvedValue(PAID_INVOICE as any)

    await expect(
      addPart({
        organizationId: ORG,
        userId: 'user-1',
        input: {
          serviceRecordId: 'rec-1',
          name: 'Brake pads',
          quantity: 1,
          unitPrice: 100,
          total: 100,
          unitCost: 60,
        },
      })
    ).rejects.toThrow(/locked/i)

    expect(db.servicePart.create).not.toHaveBeenCalled()
    // No stock may move either: a line that was refused must not leave the
    // shelf count short.
    expect(db.$transaction).not.toHaveBeenCalled()
  })

  it('names the rule that applied, so the message can explain itself', async () => {
    vi.mocked(db.serviceRecord.findFirst).mockResolvedValue(PAID_INVOICE as any)
    const result = await updateServiceRecord({ id: 'rec-1', title: 'Rewritten' })
    expect(result.error).toContain('paid')
  })
})

describe('an invoice that is not locked still edits', () => {
  it('allows an edit while the invoice is unpaid', async () => {
    lockSettings(LOCK_INVOICES_WHEN_PAID)
    vi.mocked(db.serviceRecord.findFirst).mockResolvedValue(UNPAID_INVOICE as any)

    const result = await updateServiceRecord({ id: 'rec-1', title: 'Still a draft' })

    // It gets past the lock; whatever happens next is not the lock's doing.
    expectNotBlockedByLock(result)
  })

  it('allows an edit to a paid invoice while locking is switched off', async () => {
    lockSettings({})
    vi.mocked(db.serviceRecord.findFirst).mockResolvedValue(PAID_INVOICE as any)

    const result = await updateServiceRecord({ id: 'rec-1', title: 'Corrected' })

    expectNotBlockedByLock(result)
  })

  it('allows an edit once an admin has unlocked it', async () => {
    lockSettings(LOCK_INVOICES_WHEN_PAID)
    vi.mocked(db.serviceRecord.findFirst).mockResolvedValue({
      ...PAID_INVOICE,
      editUnlockedAt: new Date('2026-02-01'),
    } as any)

    const result = await updateServiceRecord({ id: 'rec-1', title: 'Corrected' })

    expectNotBlockedByLock(result)
  })

  it('allows an edit to a paid invoice when the trigger is "sent" and it never was', async () => {
    lockSettings({
      [SETTING_KEYS.INVOICE_LOCK_ENABLED]: 'true',
      [SETTING_KEYS.INVOICE_LOCK_TRIGGER]: 'sent',
    })
    vi.mocked(db.serviceRecord.findFirst).mockResolvedValue(PAID_INVOICE as any)

    const result = await updateServiceRecord({ id: 'rec-1', title: 'Corrected' })

    expectNotBlockedByLock(result)
  })
})

describe('a locked quote refuses edits', () => {
  beforeEach(() => lockSettings(LOCK_QUOTES_WHEN_ACCEPTED))

  it('refuses updateQuote', async () => {
    vi.mocked(db.quote.findFirst).mockResolvedValue({
      status: 'accepted',
      editUnlockedAt: null,
    } as any)

    const result = await updateQuote({ id: 'quote-1', title: 'Rewritten' })

    expect(result.success).toBe(false)
    expect(result.error).toMatch(/locked/i)
    expect(db.quote.update).not.toHaveBeenCalled()
  })

  it('refuses deleteQuote', async () => {
    vi.mocked(db.quote.findFirst).mockResolvedValue({
      status: 'converted',
      editUnlockedAt: null,
    } as any)

    const result = await deleteQuote('quote-1')

    expect(result.success).toBe(false)
    expect(result.error).toMatch(/locked/i)
    expect(db.quote.deleteMany).not.toHaveBeenCalled()
  })

  it('still allows editing a quote that has only been sent', async () => {
    vi.mocked(db.quote.findFirst).mockResolvedValue({ status: 'sent', editUnlockedAt: null } as any)

    const result = await updateQuote({ id: 'quote-1', title: 'Revised after a call' })

    expectNotBlockedByLock(result)
  })
})

describe('the settings the lock reads', () => {
  it('asks only for the four lock keys, scoped to the org', async () => {
    lockSettings(LOCK_INVOICES_WHEN_PAID)
    vi.mocked(db.serviceRecord.findFirst).mockResolvedValue(UNPAID_INVOICE as any)

    await updateServiceRecord({ id: 'rec-1', title: 'x' })

    const call = vi.mocked(db.appSetting.findMany).mock.calls[0]?.[0] as any
    expect(call.where.organizationId).toBe(ORG)
    expect(call.where.key.in).toEqual(
      expect.arrayContaining([
        SETTING_KEYS.INVOICE_LOCK_ENABLED,
        SETTING_KEYS.INVOICE_LOCK_TRIGGER,
        SETTING_KEYS.QUOTE_LOCK_ENABLED,
        SETTING_KEYS.QUOTE_LOCK_TRIGGER,
      ])
    )
  })

  it('treats a record from another org as editable, leaving the caller to 404', async () => {
    // findFirst is scoped by organizationId, so a foreign id returns null. The
    // lock must not turn that into "locked", which would confirm that a record
    // with that id exists somewhere.
    lockSettings(LOCK_INVOICES_WHEN_PAID)
    vi.mocked(db.serviceRecord.findFirst).mockResolvedValue(null as any)

    const result = await updateServiceRecord({ id: 'someone-elses', title: 'x' })

    expectNotBlockedByLock(result)
    expect(result.error).toMatch(/not found/i)
  })
})

describe('what a locked invoice must still be able to do', () => {
  beforeEach(() => lockSettings(LOCK_INVOICES_WHEN_PAID))

  it('still accepts a status change', async () => {
    // Status is workflow, not money. Freezing it would strand a paid job as
    // permanently in-progress on the work board.
    vi.mocked(db.serviceRecord.findFirst).mockResolvedValue({
      ...PAID_INVOICE,
      id: 'rec-1',
      status: 'in-progress',
      vehicleId: null,
      vehicle: null,
    } as any)

    const result = await updateServiceStatus('rec-1', 'completed')

    expectNotBlockedByLock(result)
    expect(db.serviceRecord.update).toHaveBeenCalled()
  })

  it('still accepts being marked paid or unpaid', async () => {
    vi.mocked(db.serviceRecord.findFirst).mockResolvedValue({
      ...PAID_INVOICE,
      id: 'rec-1',
      vehicleId: null,
    } as any)

    const result = await toggleManuallyPaid('rec-1')

    expectNotBlockedByLock(result)
    expect(db.serviceRecord.update).toHaveBeenCalled()
  })

  it('still allows a share link to be created, so it can be paid online', async () => {
    vi.mocked(db.serviceRecord.findFirst).mockResolvedValue({
      ...PAID_INVOICE,
      id: 'rec-1',
      vehicleId: null,
    } as any)

    const result = await generatePublicLink('rec-1')

    expectNotBlockedByLock(result)
    expect(result.success).toBe(true)
  })
})

describe('transitions that would release the lock', () => {
  // The lock derives from paid status and quote status, so the toggles that
  // move those fields are the admin-only unlock in disguise whenever the move
  // would release the lock. Moves that keep it locked (or lock it further)
  // stay open to everyone.

  it('refuses unmarking paid when the manual mark alone holds the lock', async () => {
    lockSettings(LOCK_INVOICES_WHEN_PAID)
    vi.mocked(db.serviceRecord.findFirst).mockResolvedValue({
      ...PAID_INVOICE,
      id: 'rec-1',
      vehicleId: null,
      payments: [],
    } as any)

    const result = await toggleManuallyPaid('rec-1')

    expect(result.success).toBe(false)
    expect(result.error).toMatch(/locked/i)
    expect(db.serviceRecord.update).not.toHaveBeenCalled()
  })

  it('still allows unmarking paid while recorded payments keep it settled', async () => {
    // The flip changes nothing the lock cares about, so it is workflow.
    lockSettings(LOCK_INVOICES_WHEN_PAID)
    vi.mocked(db.serviceRecord.findFirst).mockResolvedValue({
      ...PAID_INVOICE,
      id: 'rec-1',
      vehicleId: null,
    } as any)

    const result = await toggleManuallyPaid('rec-1')

    expectNotBlockedByLock(result)
    expect(db.serviceRecord.update).toHaveBeenCalled()
  })

  it('still allows marking an unpaid invoice as paid', async () => {
    lockSettings(LOCK_INVOICES_WHEN_PAID)
    vi.mocked(db.serviceRecord.findFirst).mockResolvedValue({
      ...UNPAID_INVOICE,
      id: 'rec-1',
      vehicleId: null,
    } as any)

    const result = await toggleManuallyPaid('rec-1')

    expectNotBlockedByLock(result)
    expect(db.serviceRecord.update).toHaveBeenCalled()
  })

  it('refuses deleting the payment that settled a locked invoice', async () => {
    lockSettings(LOCK_INVOICES_WHEN_PAID)
    vi.mocked(db.payment.findFirst).mockResolvedValue({
      id: 'pay-1',
      serviceRecord: {
        id: 'rec-1',
        vehicleId: null,
        sentAt: null,
        manuallyPaid: false,
        totalAmount: 500,
        cost: 0,
        editUnlockedAt: null,
        payments: [{ id: 'pay-1', amount: 500 }],
      },
    } as any)

    const result = await deletePayment('pay-1')

    expect(result.success).toBe(false)
    expect(result.error).toMatch(/locked/i)
    expect(db.payment.delete).not.toHaveBeenCalled()
  })

  it('still allows deleting a payment under the "sent" trigger', async () => {
    // Sending is what holds the lock there; the money record is workflow.
    lockSettings({
      [SETTING_KEYS.INVOICE_LOCK_ENABLED]: 'true',
      [SETTING_KEYS.INVOICE_LOCK_TRIGGER]: 'sent',
    })
    vi.mocked(db.payment.findFirst).mockResolvedValue({
      id: 'pay-1',
      serviceRecord: {
        id: 'rec-1',
        vehicleId: null,
        sentAt: new Date('2026-01-01'),
        manuallyPaid: false,
        totalAmount: 500,
        cost: 0,
        editUnlockedAt: null,
        payments: [{ id: 'pay-1', amount: 500 }],
      },
    } as any)

    const result = await deletePayment('pay-1')

    expectNotBlockedByLock(result)
    expect(db.payment.delete).toHaveBeenCalled()
  })

  it('refuses moving an accepted quote back to draft', async () => {
    lockSettings(LOCK_QUOTES_WHEN_ACCEPTED)
    vi.mocked(db.quote.findFirst).mockResolvedValue({
      status: 'accepted',
      sentAt: null,
      editUnlockedAt: null,
    } as any)

    const result = await updateQuoteStatus('quote-1', 'draft')

    expect(result.success).toBe(false)
    expect(result.error).toMatch(/locked/i)
    expect(db.quote.updateMany).not.toHaveBeenCalled()
  })

  it('still allows converting an accepted quote, which stays locked', async () => {
    lockSettings(LOCK_QUOTES_WHEN_ACCEPTED)
    vi.mocked(db.quote.findFirst).mockResolvedValue({
      status: 'accepted',
      sentAt: null,
      editUnlockedAt: null,
    } as any)

    const result = await updateQuoteStatus('quote-1', 'converted')

    expectNotBlockedByLock(result)
    expect(db.quote.updateMany).toHaveBeenCalled()
  })

  it('refuses a status the app does not know, locked or not', async () => {
    // The old accept-any-string behaviour was itself a way out: a made-up
    // status is not in any locked list, so it would have released the lock.
    lockSettings(LOCK_QUOTES_WHEN_ACCEPTED)
    vi.mocked(db.quote.findFirst).mockResolvedValue({
      status: 'accepted',
      sentAt: null,
      editUnlockedAt: null,
    } as any)

    const result = await updateQuoteStatus('quote-1', 'Accepted')

    expect(result.success).toBe(false)
    expect(db.quote.updateMany).not.toHaveBeenCalled()
  })
})

describe('sharing a quote link counts as sending it', () => {
  it('stamps sentAt and moves a draft to sent', async () => {
    lockSettings({})
    vi.mocked(db.quote.findFirst).mockResolvedValue({ id: 'quote-1' } as any)

    const result = await generateQuotePublicLink('quote-1')

    expect(result.success).toBe(true)
    const stampCalls = vi.mocked(db.quote.updateMany).mock.calls.map((c) => c[0] as any)
    expect(stampCalls.some((c) => c.data.sentAt instanceof Date)).toBe(true)
    // The status write leaves accepted and converted quotes alone.
    const statusCall = stampCalls.find((c) => c.data.status === 'sent')
    expect(statusCall?.where.status).toEqual({ notIn: ['accepted', 'converted'] })
  })
})

describe('recording when an invoice was sent', () => {
  beforeEach(() => lockSettings({}))

  it('stamps sentAt when a share link is first created', async () => {
    vi.mocked(db.serviceRecord.findFirst).mockResolvedValue({
      ...UNPAID_INVOICE,
      id: 'rec-1',
      vehicleId: null,
      sentAt: null,
    } as any)

    await generatePublicLink('rec-1')

    const data = vi.mocked(db.serviceRecord.update).mock.calls[0]?.[0]?.data as any
    expect(data.sentAt).toBeInstanceOf(Date)
  })

  it('moves sentAt forward when the link is created again', async () => {
    // Sharing again re-issues the document, and the lock compares this against
    // any unlock to decide whether the corrected copy locks itself.
    const firstSent = new Date('2026-01-01')
    vi.mocked(db.serviceRecord.findFirst).mockResolvedValue({
      ...UNPAID_INVOICE,
      id: 'rec-1',
      vehicleId: null,
      sentAt: firstSent,
    } as any)

    await generatePublicLink('rec-1')

    const data = vi.mocked(db.serviceRecord.update).mock.calls[0]?.[0]?.data as any
    expect(data.sentAt.getTime()).toBeGreaterThan(firstSent.getTime())
  })
})
