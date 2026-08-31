/**
 * Whether a finished invoice or quote may still be edited.
 *
 * A workshop that has sent an invoice, or been paid for one, generally cannot
 * treat it as a draft any more: the customer holds a copy, the numbers are in
 * the books, and in many places an issued invoice is a document that must be
 * corrected by a credit note rather than quietly rewritten. Locking makes the
 * document match that reality instead of relying on everyone remembering.
 *
 * The lock is deliberately narrow. It freezes what the document *says it is
 * owed* — its line items, discount, tax, number and date — and nothing else.
 * Payments, status changes, sharing, attachments and internal notes all keep
 * working, because a locked invoice that could not be paid would be worse than
 * no lock at all. See `LOCKED_FIELDS` for the exact list.
 *
 * Everything here is pure: the state is derived from the document and the
 * org's settings, never stored. That means turning the setting off releases
 * every document at once with nothing to migrate, and no record can drift into
 * disagreeing with the rule that produced it. The single exception is a
 * deliberate unlock by an owner or admin, which is recorded on the row.
 */

/** When an invoice stops being editable. */
export type InvoiceLockTrigger = 'sent' | 'paid'

/** When a quote stops being editable. */
export type QuoteLockTrigger = 'sent' | 'accepted'

export const INVOICE_LOCK_TRIGGERS: InvoiceLockTrigger[] = ['sent', 'paid']
export const QUOTE_LOCK_TRIGGERS: QuoteLockTrigger[] = ['sent', 'accepted']

export interface DocumentLockSettings {
  invoiceLockEnabled: boolean
  invoiceLockTrigger: InvoiceLockTrigger
  quoteLockEnabled: boolean
  quoteLockTrigger: QuoteLockTrigger
}

/**
 * Why a document is locked, or `null` when it is editable. The reason is
 * carried rather than a bare boolean so the screen and the error message can
 * say which rule applied, instead of "you cannot edit this".
 */
export type LockReason = 'sent' | 'paid' | 'accepted'

export interface LockState {
  locked: boolean
  reason: LockReason | null
  /** Set when an owner or admin has deliberately reopened the document. */
  unlockedAt: Date | null
}

const EDITABLE: LockState = { locked: false, reason: null, unlockedAt: null }

/**
 * Defaults are chosen so an upgrade changes nothing: locking is off until
 * someone turns it on. The triggers default to the later, less disruptive
 * point of the two, so switching it on for the first time locks as little as
 * possible.
 */
export const DOCUMENT_LOCK_DEFAULTS: DocumentLockSettings = {
  invoiceLockEnabled: false,
  invoiceLockTrigger: 'paid',
  quoteLockEnabled: false,
  quoteLockTrigger: 'accepted',
}

function readTrigger<T extends string>(value: string | undefined, allowed: T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback
}

/**
 * Reads the stored settings, which are strings and may be absent or hand-
 * edited. An unrecognised trigger falls back to the default rather than
 * throwing: a bad settings row must not take out every invoice page.
 */
export function readDocumentLockSettings(
  settings: Record<string, string | undefined>,
  keys: {
    invoiceLockEnabled: string
    invoiceLockTrigger: string
    quoteLockEnabled: string
    quoteLockTrigger: string
  }
): DocumentLockSettings {
  return {
    invoiceLockEnabled: settings[keys.invoiceLockEnabled] === 'true',
    invoiceLockTrigger: readTrigger(
      settings[keys.invoiceLockTrigger],
      INVOICE_LOCK_TRIGGERS,
      DOCUMENT_LOCK_DEFAULTS.invoiceLockTrigger
    ),
    quoteLockEnabled: settings[keys.quoteLockEnabled] === 'true',
    quoteLockTrigger: readTrigger(
      settings[keys.quoteLockTrigger],
      QUOTE_LOCK_TRIGGERS,
      DOCUMENT_LOCK_DEFAULTS.quoteLockTrigger
    ),
  }
}

export interface LockableInvoice {
  /** First time the invoice reached the customer, by email or share link. */
  sentAt: Date | null
  /** Marked paid by hand, regardless of what has been recorded against it. */
  manuallyPaid: boolean
  totalAmount: number
  cost: number
  payments?: { amount: number }[]
  editUnlockedAt?: Date | null
}

export interface LockableQuote {
  status: string
  editUnlockedAt?: Date | null
}

/**
 * What an invoice is owed and what has been paid against it.
 *
 * `cost` is the fallback total for records predating itemised totals, matching
 * what the header and the PDF display. A zero-total invoice with nothing
 * recorded is unpaid, not paid: otherwise every empty draft would count as
 * settled and lock itself the moment the setting was turned on.
 */
export function invoicePaymentStatus(invoice: {
  manuallyPaid: boolean
  totalAmount: number
  cost: number
  payments?: { amount: number }[]
}): 'paid' | 'partial' | 'unpaid' {
  const total = invoice.totalAmount > 0 ? invoice.totalAmount : invoice.cost
  if (invoice.manuallyPaid) return 'paid'
  const paid = (invoice.payments ?? []).reduce((sum, p) => sum + p.amount, 0)
  if (paid <= 0) return 'unpaid'
  return paid >= total ? 'paid' : 'partial'
}

export function invoiceLockState(
  invoice: LockableInvoice,
  settings: DocumentLockSettings
): LockState {
  if (!settings.invoiceLockEnabled) return EDITABLE
  // A deliberate unlock outranks the rule; re-locking is a separate action.
  if (invoice.editUnlockedAt) {
    return { locked: false, reason: null, unlockedAt: invoice.editUnlockedAt }
  }

  if (settings.invoiceLockTrigger === 'sent') {
    return invoice.sentAt ? { locked: true, reason: 'sent', unlockedAt: null } : EDITABLE
  }

  // Partly paid still edits: the balance is often exactly what is being
  // discussed, and locking there would strand the document mid-negotiation.
  return invoicePaymentStatus(invoice) === 'paid'
    ? { locked: true, reason: 'paid', unlockedAt: null }
    : EDITABLE
}

/**
 * Quote statuses that mean the customer has agreed to these numbers. A
 * converted quote is the source of a job that is already running, so it counts
 * too.
 */
const AGREED_QUOTE_STATUSES = ['accepted', 'converted']

/** Statuses that mean the quote has left the workshop. */
const ISSUED_QUOTE_STATUSES = ['sent', ...AGREED_QUOTE_STATUSES]

export function quoteLockState(quote: LockableQuote, settings: DocumentLockSettings): LockState {
  if (!settings.quoteLockEnabled) return EDITABLE
  if (quote.editUnlockedAt) {
    return { locked: false, reason: null, unlockedAt: quote.editUnlockedAt }
  }

  if (settings.quoteLockTrigger === 'sent') {
    return ISSUED_QUOTE_STATUSES.includes(quote.status)
      ? { locked: true, reason: 'sent', unlockedAt: null }
      : EDITABLE
  }

  return AGREED_QUOTE_STATUSES.includes(quote.status)
    ? { locked: true, reason: 'accepted', unlockedAt: null }
    : EDITABLE
}

/**
 * Raised when an edit is refused. Carries the reason so the caller can explain
 * which rule applied rather than reporting a bare failure.
 */
export class DocumentLockedError extends Error {
  constructor(readonly reason: LockReason) {
    super(`This document is locked because it has been ${reason}.`)
    this.name = 'DocumentLockedError'
  }
}

export function assertEditable(state: LockState): void {
  if (state.locked && state.reason) throw new DocumentLockedError(state.reason)
}
