import 'server-only'

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

/** The org's lock configuration, read straight from the settings table. */
export async function getDocumentLockSettings(
  organizationId: string
): Promise<DocumentLockSettings> {
  const rows = await db.appSetting.findMany({
    where: { organizationId, key: { in: Object.values(LOCK_SETTING_KEYS) } },
    select: { key: true, value: true },
  })
  const map: Record<string, string> = {}
  for (const row of rows) map[row.key] = row.value
  return readDocumentLockSettings(map, LOCK_SETTING_KEYS)
}

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
      select: { status: true, editUnlockedAt: true },
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
