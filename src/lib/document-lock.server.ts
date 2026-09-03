import 'server-only'

import { cache } from 'react'
import { db } from './db'
import {
  assertEditable,
  invoiceLockState,
  quoteLockState,
  readDocumentLockSettings,
  type DocumentLockSettings,
  type LockState,
} from './document-lock'
import { SETTING_KEYS } from '@/features/settings/Schema/settingsSchema'

const LOCK_SETTING_KEYS = {
  invoiceLockEnabled: SETTING_KEYS.INVOICE_LOCK_ENABLED,
  invoiceLockTrigger: SETTING_KEYS.INVOICE_LOCK_TRIGGER,
  quoteLockEnabled: SETTING_KEYS.QUOTE_LOCK_ENABLED,
  quoteLockTrigger: SETTING_KEYS.QUOTE_LOCK_TRIGGER,
}

/**
 * The org's lock configuration, read straight from the settings table.
 * Wrapped in React's per-request cache so a render or action that checks the
 * lock more than once pays for the settings query once.
 */
export const getDocumentLockSettings = cache(
  async (organizationId: string): Promise<DocumentLockSettings> => {
    const rows = await db.appSetting.findMany({
      where: { organizationId, key: { in: Object.values(LOCK_SETTING_KEYS) } },
      select: { key: true, value: true },
    })
    const map: Record<string, string> = {}
    for (const row of rows) map[row.key] = row.value
    return readDocumentLockSettings(map, LOCK_SETTING_KEYS)
  }
)

/**
 * The lock state of one invoice, loading only the fields the rules need.
 * A record that does not exist is reported as editable, leaving the caller's
 * own not-found handling to produce the error.
 */
export async function getInvoiceLockState(
  recordId: string,
  organizationId: string
): Promise<LockState> {
  const [record, settings] = await Promise.all([
    db.serviceRecord.findFirst({
      where: { id: recordId, organizationId },
      select: {
        sentAt: true,
        manuallyPaid: true,
        totalAmount: true,
        cost: true,
        editUnlockedAt: true,
        payments: { select: { amount: true } },
      },
    }),
    getDocumentLockSettings(organizationId),
  ])
  if (!record) return { locked: false, reason: null, unlockedAt: null }
  return invoiceLockState(record, settings)
}

export async function getQuoteLockState(
  quoteId: string,
  organizationId: string
): Promise<LockState> {
  const [quote, settings] = await Promise.all([
    db.quote.findFirst({
      where: { id: quoteId, organizationId },
      select: { status: true, sentAt: true, editUnlockedAt: true },
    }),
    getDocumentLockSettings(organizationId),
  ])
  if (!quote) return { locked: false, reason: null, unlockedAt: null }
  return quoteLockState(quote, settings)
}

/**
 * Refuses an edit to a locked invoice. Call this before any change to what the
 * document says it is owed; payments, status and sharing do not go through it.
 */
export async function assertInvoiceEditable(recordId: string, organizationId: string) {
  assertEditable(await getInvoiceLockState(recordId, organizationId))
}

export async function assertQuoteEditable(quoteId: string, organizationId: string) {
  assertEditable(await getQuoteLockState(quoteId, organizationId))
}

/**
 * Records that the invoice reached the customer, which is what "lock when
 * sent" keys off. Every send channel — email, share link, SMS with the link —
 * must come through here (or stamp sentAt in the same write, as
 * generatePublicLink does): a channel that forgets makes the lock silently
 * wrong for everyone who only uses that channel. Every send counts, not just
 * the first, so re-issuing after an unlock locks the corrected copy too.
 */
export async function markInvoiceSent(
  recordId: string,
  organizationId: string,
  options: {
    /**
     * The caller already issued the invoice, to render the copy it sent from
     * the same snapshot. Skips the second, identical capture.
     */
    alreadyIssued?: boolean
  } = {}
) {
  // Issued before the stamp: under "lock when sent" the stamp is what locks
  // the invoice, and a locked invoice is one whose issue is kept as it is.
  if (!options.alreadyIssued) {
    const { issueInvoice } = await import('@/features/invoices/Lib/issueInvoice')
    await issueInvoice(recordId, organizationId, 'sent')
  }
  await db.serviceRecord.updateMany({
    where: { id: recordId, organizationId },
    data: { sentAt: new Date() },
  })
}

/**
 * The quote counterpart of markInvoiceSent. Also moves a draft to "sent",
 * matching what emailing a quote has always done, so a shared link and an
 * emailed copy agree about whether the quote went to the customer. Accepted
 * and converted quotes keep their status; only sentAt moves.
 */
export async function markQuoteSent(quoteId: string, organizationId: string) {
  await db.quote.updateMany({
    where: { id: quoteId, organizationId },
    data: { sentAt: new Date() },
  })
  await db.quote.updateMany({
    where: { id: quoteId, organizationId, status: { notIn: ['accepted', 'converted'] } },
    data: { status: 'sent' },
  })
}
