import { addZonedDays, startOfZonedDay } from '@/lib/timezone'

/**
 * When a share link stops working.
 *
 * A link to an invoice, a quote or an inspection used to work until somebody
 * revoked it. Now the workshop sets a rule per kind of document, and each
 * document may answer for itself. The document's own answer always wins. A
 * workshop that has set nothing gets the defaults below.
 *
 * Nothing here is stored as a deadline except a date the workshop typed on
 * one document: the workshop's rule is worked out when the link is opened,
 * so changing the rule also closes (or reopens) links already sent.
 *
 * An invoice link is also where the customer pays. Under "after payment" it
 * stays open for as long as money is owed, and the days start on the day the
 * invoice was paid in full.
 *
 * Days are whole workshop days: a link that expires on the 14th works for the
 * whole of the 14th on the workshop's clock.
 */

export type ShareKind = 'invoice' | 'quote' | 'inspection'

export type ShareExpiryMode = 'never' | 'afterSharing' | 'afterPayment'

export interface ShareExpiryRule {
  mode: ShareExpiryMode
  days: number
}

export type ShareExpiryRules = Record<ShareKind, ShareExpiryRule>

export const SHARE_KINDS: ShareKind[] = ['invoice', 'quote', 'inspection']

/** The modes each kind of document offers. Only an invoice is ever paid. */
export const SHARE_EXPIRY_MODES: Record<ShareKind, ShareExpiryMode[]> = {
  invoice: ['never', 'afterPayment', 'afterSharing'],
  quote: ['never', 'afterSharing'],
  inspection: ['never', 'afterSharing'],
}

export const SHARE_EXPIRY_DEFAULT_DAYS = 30

/**
 * What a workshop gets before it has chosen anything: an invoice link closes
 * 30 days after the invoice is paid, a quote or inspection link 30 days
 * after it was sent. A workshop that wants its links to last says so.
 */
export const SHARE_EXPIRY_DEFAULT_MODES: Record<ShareKind, ShareExpiryMode> = {
  invoice: 'afterPayment',
  quote: 'afterSharing',
  inspection: 'afterSharing',
}
export const SHARE_EXPIRY_MAX_DAYS = 3650

/** The setting keys, spelled out here so this file stays free of the settings schema. */
export const SHARE_EXPIRY_SETTING_KEYS: Record<ShareKind, { mode: string; days: string }> = {
  invoice: { mode: 'shareLinks.invoiceExpiry', days: 'shareLinks.invoiceExpiryDays' },
  quote: { mode: 'shareLinks.quoteExpiry', days: 'shareLinks.quoteExpiryDays' },
  inspection: { mode: 'shareLinks.inspectionExpiry', days: 'shareLinks.inspectionExpiryDays' },
}

export const ALL_SHARE_EXPIRY_SETTING_KEYS: string[] = SHARE_KINDS.flatMap((kind) => [
  SHARE_EXPIRY_SETTING_KEYS[kind].mode,
  SHARE_EXPIRY_SETTING_KEYS[kind].days,
])

/** Whole days between 1 and ten years, or the default for anything else. */
export function shareExpiryDays(value: string | number | null | undefined): number {
  const n = typeof value === 'number' ? value : Number.parseInt(value ?? '', 10)
  if (!Number.isFinite(n) || n < 1) return SHARE_EXPIRY_DEFAULT_DAYS
  return Math.min(Math.floor(n), SHARE_EXPIRY_MAX_DAYS)
}

/**
 * The workshop's rules as saved. A workshop that never opened the page, and a
 * value this build does not know, both read as the default for that kind of
 * document. "Never" is only ever a choice the workshop made.
 */
export function readShareExpiryRules(
  settings: Record<string, string | undefined>
): ShareExpiryRules {
  const rule = (kind: ShareKind): ShareExpiryRule => {
    const keys = SHARE_EXPIRY_SETTING_KEYS[kind]
    const saved = settings[keys.mode] as ShareExpiryMode | undefined
    const mode =
      saved && SHARE_EXPIRY_MODES[kind].includes(saved) ? saved : SHARE_EXPIRY_DEFAULT_MODES[kind]
    return { mode, days: shareExpiryDays(settings[keys.days]) }
  }
  return { invoice: rule('invoice'), quote: rule('quote'), inspection: rule('inspection') }
}

/**
 * A new link starts with nothing said about its expiry, and a revoked link
 * takes what was said with it: the answer belonged to that link.
 */
export const FRESH_SHARE_LINK = {
  shareExpiresAt: null,
  shareNeverExpires: false,
  shareRenewedAt: null,
} as const

/** What one document says about its own link, and when the link was handed out. */
export interface ShareLinkFacts {
  sharedAt: Date | null
  /** Last time the link was sent again or reopened. */
  renewedAt: Date | null
  /** A date the workshop set on this document. */
  expiresAt: Date | null
  /** The workshop said this document's link never expires. */
  neverExpires: boolean
  /**
   * Invoices only. `undefined` for a quote or an inspection; for an invoice,
   * whether it is paid in full and, when known, the day that happened.
   */
  payment?: { paid: boolean; at: Date | null }
}

/**
 * - `never`: works until revoked.
 * - `untilPaid`: an invoice that is still owed on, under "after payment".
 * - `date`: stops working after `at`.
 *
 * `source` says who decided: this document, or the workshop's rule.
 */
export type ShareExpiry =
  | { kind: 'never'; source: 'document' | 'workshop' }
  | { kind: 'untilPaid'; source: 'workshop' }
  | { kind: 'date'; at: Date; source: 'document' | 'workshop' }

function latest(...dates: (Date | null | undefined)[]): Date | null {
  let best: Date | null = null
  for (const d of dates) if (d && (!best || d > best)) best = d
  return best
}

/** The last instant of the workshop day `days` after the day `from` falls on. */
function endOfDayAfter(from: Date, days: number, timeZone: string): Date {
  return new Date(addZonedDays(from, days + 1, timeZone).getTime() - 1)
}

export function shareExpiry(
  facts: ShareLinkFacts,
  rule: ShareExpiryRule,
  timeZone: string
): ShareExpiry {
  if (facts.neverExpires) return { kind: 'never', source: 'document' }
  if (facts.expiresAt) return { kind: 'date', at: facts.expiresAt, source: 'document' }

  if (rule.mode === 'never') return { kind: 'never', source: 'workshop' }

  if (rule.mode === 'afterPayment' && facts.payment) {
    if (!facts.payment.paid) return { kind: 'untilPaid', source: 'workshop' }
    // A receipt sent after the invoice was paid counts from the day it was
    // sent: the customer has had the link no longer than that.
    const from = latest(facts.payment.at, facts.sharedAt, facts.renewedAt)
    if (!from) return { kind: 'never', source: 'workshop' }
    return { kind: 'date', at: endOfDayAfter(from, rule.days, timeZone), source: 'workshop' }
  }

  const from = latest(facts.sharedAt, facts.renewedAt)
  // A link with no known start cannot be counted from anything.
  if (!from) return { kind: 'never', source: 'workshop' }
  return { kind: 'date', at: endOfDayAfter(from, rule.days, timeZone), source: 'workshop' }
}

export function isShareExpired(expiry: ShareExpiry, now: Date = new Date()): boolean {
  return expiry.kind === 'date' && expiry.at.getTime() < now.getTime()
}

/**
 * The last day a customer can be told the link works, or null when there is
 * no such day to name: the link has no date, or the date has passed (a
 * portal customer still reading their own document).
 *
 * A link that closes at the end of a workshop day works for the whole of
 * that day. One that closes partway through a day (a status report lives 14
 * days to the minute) is promised only up to the day before, unless that
 * day is today.
 */
export function shareOpenUntilDay(
  expiry: ShareExpiry,
  timeZone: string,
  now: Date = new Date()
): Date | null {
  if (expiry.kind !== 'date' || isShareExpired(expiry, now)) return null
  const dayStart = startOfZonedDay(expiry.at, timeZone)
  const endsTheDay = addZonedDays(expiry.at, 1, timeZone).getTime() - 1 === expiry.at.getTime()
  if (endsTheDay || dayStart.getTime() <= now.getTime()) return expiry.at
  return new Date(dayStart.getTime() - 1)
}

/**
 * Whether an invoice is paid in full, and the day it was. Marked paid by hand
 * counts as paid whatever is recorded; otherwise the payments must cover the
 * total, and the day is the last payment's.
 */
export function invoicePayment(invoice: {
  totalAmount: number
  manuallyPaid: boolean
  manuallyPaidAt: Date | null
  payments: { amount: number; date: Date }[]
}): { paid: boolean; at: Date | null } {
  const lastPayment = latest(...invoice.payments.map((p) => p.date))
  if (invoice.manuallyPaid) return { paid: true, at: invoice.manuallyPaidAt ?? lastPayment }
  const recorded = invoice.payments.reduce((sum, p) => sum + p.amount, 0)
  // Half a cent of rounding is not a debt.
  const balance = Math.round((invoice.totalAmount - recorded) * 100) / 100
  return balance <= 0 ? { paid: true, at: lastPayment } : { paid: false, at: null }
}
