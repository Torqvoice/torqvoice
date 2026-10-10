/**
 * Torqvoice records as Fiken entities, and back.
 *
 * Pure functions so the shape the API receives can be tested without a
 * company. Fiken counts money in whole øre and takes the net and the VAT of
 * every line as given, so a body carries exactly what the workshop billed:
 * the lines here are shares of the invoice's own net and VAT, and add up to
 * its total to the øre.
 */

import type {
  AccountingCustomer,
  AccountingInvoice,
  AccountingPayment,
} from '@/features/integrations/Lib/accounting-sync'
import { roundAsPrinted } from '@/lib/money'
import { zonedDayKey } from '@/lib/timezone'

export { checksumOf } from '@/features/integrations/Lib/checksum'

export const API = 'https://api.fiken.no/api/v2'
export const REVOKE_URL = 'https://fiken.no/oauth/revoke'
/** Fiken keeps its books in kroner; a sale in another currency needs both amounts. */
export const CURRENCY = 'NOK'
/** The contact counter sales are booked to when no customer was recorded. */
export const WALK_IN_NAME = 'Kontantkunde'
/** Sales income liable to VAT in the Norwegian standard chart of accounts. */
export const DEFAULT_INCOME_ACCOUNT = '3000'
/** Contact names, emails and line descriptions stop here. */
export const TEXT_MAX = 200
export const PHONE_MAX = 20
/** The most a list call returns per page. */
export const PAGE_SIZE = 100

/** The VAT types a sale can carry, as Fiken names them. */
export const SALES_VAT_TYPES = [
  'NONE',
  'HIGH',
  'MEDIUM',
  'RAW_FISH',
  'LOW',
  'EXEMPT_IMPORT_EXPORT',
  'EXEMPT',
  'OUTSIDE',
  'EXEMPT_REVERSE',
] as const

/** The ones without a rate, for an invoice that carries no VAT. */
export const ZERO_VAT_TYPES = [
  'NONE',
  'EXEMPT',
  'OUTSIDE',
  'EXEMPT_IMPORT_EXPORT',
  'EXEMPT_REVERSE',
] as const

export type ZeroVatType = (typeof ZERO_VAT_TYPES)[number]

export interface FikenUser {
  name?: string
  email?: string
}

export interface FikenCompany {
  name?: string
  slug: string
  organizationNumber?: string
  /** "no" when the company is not registered for VAT, otherwise how often it reports. */
  vatType?: string
  hasApiAccess?: boolean
  testCompany?: boolean
}

export interface FikenContact {
  contactId: number
  name: string
  email?: string
  organizationNumber?: string
  customer?: boolean
  supplier?: boolean
  inactive?: boolean
  [key: string]: unknown
}

export interface FikenAccount {
  code: string
  name?: string
}

export interface FikenBankAccount {
  bankAccountId?: number
  name?: string
  accountCode: string
  type?: string
  inactive?: boolean
}

export interface FikenPayment {
  paymentId?: number
  date: string
  account: string
  /** Øre. */
  amount: number
  currency?: string
}

export interface FikenOrderLine {
  description: string
  /** Øre, without VAT. */
  netPrice: number
  /** Øre. Left out when there is none: Fiken refuses a line that names an amount of 0. */
  vat?: number
  account: string
  vatType: string
}

export interface FikenSale {
  saleId: number
  saleNumber?: string
  date?: string
  kind?: string
  netAmount?: number
  vatAmount?: number
  settled?: boolean
  totalPaid?: number
  outstandingBalance?: number
  salePayments?: FikenPayment[]
  lines?: Partial<FikenOrderLine>[]
  dueDate?: string
  customer?: { contactId?: number }
  deleted?: boolean
}

/**
 * An amount as Fiken counts it: whole øre, rounded exactly the way the
 * invoice prints it, so a sale is never one øre away from the invoice the
 * customer holds and pays.
 */
export function toCents(amount: number): number {
  return Math.round(roundAsPrinted(amount) * 100)
}

export function fromCents(cents: number): number {
  return Math.round(cents) / 100
}

/**
 * The Norwegian VAT type that carries a rate, or null when no type does.
 * These are the rates of the VAT act: 25 general, 15 food, 12 transport and
 * lodging, 11.11 first-hand sale of fish.
 */
export function vatTypeForRate(rate: number): string | null {
  if (Math.abs(rate - 25) < 0.005) return 'HIGH'
  if (Math.abs(rate - 15) < 0.005) return 'MEDIUM'
  if (Math.abs(rate - 12) < 0.005) return 'LOW'
  if (Math.abs(rate - 11.11) < 0.005) return 'RAW_FISH'
  return null
}

export function isZeroVatType(value: unknown): value is ZeroVatType {
  return typeof value === 'string' && (ZERO_VAT_TYPES as readonly string[]).includes(value)
}

/**
 * Split a whole number of øre over weights so the parts add up to it
 * exactly: each part is rounded down and the øre left over go to the parts
 * that lost the most to the rounding.
 */
export function allocate(total: number, weights: number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0)
  if (weights.length === 0 || sum === 0) return weights.map(() => 0)
  const exact = weights.map((w) => (total * w) / sum)
  const parts = exact.map((x) => Math.floor(x))
  let left = total - parts.reduce((a, b) => a + b, 0)
  const order = exact
    .map((x, i) => ({ i, lost: x - Math.floor(x) }))
    .sort((a, b) => b.lost - a.lost || a.i - b.i)
  for (const { i } of order) {
    if (left <= 0) break
    parts[i] += 1
    left -= 1
  }
  return parts
}

/** The vendor's own wording for a failed call, or the raw body when there is none. */
export function faultMessage(body: string): string {
  try {
    const parsed = JSON.parse(body) as unknown
    const rows = Array.isArray(parsed) ? parsed : [parsed]
    const lines = rows
      .map((row) => {
        if (!row || typeof row !== 'object') return null
        const r = row as Record<string, unknown>
        const text = r.error_description ?? r.message ?? r.error
        return typeof text === 'string' ? text : null
      })
      .filter(Boolean)
    if (lines.length) return lines.join('; ')
  } catch {
    // not JSON
  }
  return body.slice(0, 300)
}

/** The id a create answers with: the last segment of its Location header. */
export function idFromLocation(location: string | null): number | null {
  const last = location?.split('?')[0].replace(/\/$/, '').split('/').pop()
  const id = Number(last)
  return last && Number.isInteger(id) && id > 0 ? id : null
}

export function contactName(c: AccountingCustomer): string {
  return c.name.trim().slice(0, TEXT_MAX) || c.company?.trim().slice(0, TEXT_MAX) || 'Kunde'
}

/**
 * A Norwegian organisation number out of a free-text tax id, or null. Nine
 * digits, however it was typed: "NO 987 654 321 MVA" is the same number.
 */
export function organizationNumber(taxId: string | null): string | null {
  const digits = (taxId ?? '').replace(/\D/g, '')
  return digits.length === 9 ? digits : null
}

/**
 * The contact as Fiken stores one. The address stays out: it is one
 * free-text block here and Fiken wants street, postcode, city and a country
 * it recognises, and a wrong guess would refuse the whole contact.
 */
export function buildContact(c: AccountingCustomer): Record<string, unknown> {
  const orgNumber = organizationNumber(c.taxId)
  return {
    name: contactName(c),
    ...(c.email && { email: c.email.slice(0, TEXT_MAX) }),
    ...(orgNumber && { organizationNumber: orgNumber }),
    ...(c.phone && { phoneNumber: c.phone.slice(0, PHONE_MAX) }),
    ...(c.customerNumber && { memberNumberString: c.customerNumber }),
    customer: true,
  }
}

/** What a contact update may carry over from the one Fiken already has. */
const CONTACT_KEPT = [
  'supplier',
  'bankAccountNumber',
  'language',
  'inactive',
  'daysUntilInvoicingDueDate',
  'address',
  'groups',
  'discount',
] as const

/**
 * The body for an update. Fiken replaces the contact with what it is sent,
 * so what the bookkeeper filled in there rides along, and only the fields
 * this app owns are overwritten.
 */
export function mergeContact(
  current: FikenContact,
  ours: Record<string, unknown>
): Record<string, unknown> {
  const kept: Record<string, unknown> = {}
  for (const key of CONTACT_KEPT) {
    if (current[key] !== undefined && current[key] !== null) kept[key] = current[key]
  }
  return {
    ...kept,
    // Without one of ours, the email and organisation number there stay.
    ...(current.email && { email: current.email }),
    ...(current.organizationNumber && { organizationNumber: current.organizationNumber }),
    ...ours,
  }
}

export interface SaleOptions {
  customerId: number
  laborAccount: string
  partsAccount: string
  /** Income account for an invoice without VAT; the two above when null. */
  zeroAccount: string | null
  /** The VAT type for this invoice's rate, when it carries VAT. */
  vatType: string | null
  /** The VAT type for an invoice without VAT. */
  zeroVatType: string
  timezone: string
}

/** Whether VAT was billed, which is what decides how the sale is booked. */
export function carriesVat(inv: AccountingInvoice): boolean {
  return toCents(inv.taxAmount) > 0
}

function lineDescription(line: AccountingInvoice['lines'][number]): string {
  const text = [line.partNumber, line.description].filter(Boolean).join(' ').trim()
  return (text || (line.kind === 'labor' ? 'Arbeid' : 'Deler')).slice(0, TEXT_MAX)
}

/**
 * The sale body: "Annet salg" of the kind Fiken keeps for invoices written
 * and numbered elsewhere. The invoice's net and VAT are shared over its
 * lines by their size, which spreads a discount the way the invoice did and
 * keeps the total to the øre whether prices were entered with or without
 * VAT. Lines without an amount carry no money and stay out.
 */
export function buildSale(inv: AccountingInvoice, o: SaleOptions): Record<string, unknown> {
  const gross = toCents(inv.totalAmount)
  const taxable = carriesVat(inv)
  const vat = taxable ? toCents(inv.taxAmount) : 0
  const net = gross - vat
  const vatType = taxable && o.vatType ? o.vatType : o.zeroVatType
  const accountFor = (kind: 'labor' | 'part') =>
    (!taxable && o.zeroAccount) || (kind === 'labor' ? o.laborAccount : o.partsAccount)

  const charged = inv.lines.filter((l) => toCents(l.total) !== 0)
  const weights = charged.map((l) => toCents(l.total))
  const weightSum = weights.reduce((a, b) => a + b, 0)
  let lines: FikenOrderLine[]
  if (charged.length > 0 && weightSum !== 0 && net !== 0) {
    const nets = allocate(net, weights)
    const vats = allocate(vat, nets)
    lines = charged.map((line, i) => ({
      description: lineDescription(line),
      netPrice: nets[i],
      ...(vats[i] !== 0 && { vat: vats[i] }),
      account: accountFor(line.kind),
      vatType,
    }))
  } else {
    // An old record with a total and no lines, or lines that cancel out.
    lines = [
      {
        description: `Faktura ${inv.invoiceNumber ?? ''}`.trim().slice(0, TEXT_MAX),
        netPrice: net,
        ...(vat !== 0 && { vat }),
        account: accountFor('labor'),
        vatType,
      },
    ]
  }
  return {
    saleNumber: inv.invoiceNumber,
    date: zonedDayKey(inv.invoiceDate, o.timezone),
    kind: 'external_invoice',
    lines,
    customerId: o.customerId,
    currency: CURRENCY,
    ...(inv.dueDate && { dueDate: zonedDayKey(inv.dueDate, o.timezone) }),
  }
}

export function buildPayment(
  p: Pick<AccountingPayment, 'amount' | 'date'>,
  o: { account: string; timezone: string }
): FikenPayment {
  return {
    date: zonedDayKey(p.date, o.timezone),
    account: o.account,
    amount: toCents(p.amount),
  }
}

/**
 * What Fiken booked for a sale, in øre: the sum of its lines, or its own
 * totals when it lists none. Null when the answer carries neither.
 */
export function bookedTotals(sale: FikenSale): { net: number; vat: number } | null {
  if (Array.isArray(sale.lines) && sale.lines.length > 0) {
    return {
      net: sale.lines.reduce((a, l) => a + (l.netPrice ?? 0), 0),
      vat: sale.lines.reduce((a, l) => a + (l.vat ?? 0), 0),
    }
  }
  if (typeof sale.netAmount === 'number') return { net: sale.netAmount, vat: sale.vatAmount ?? 0 }
  return null
}

/**
 * How a sale in Fiken differs from the one the invoice would make now, in
 * the things the books are about: the date, the due date, the customer, the
 * net and the VAT. Empty when Fiken already holds what the invoice says.
 *
 * Accounts and VAT types are left out on purpose. They come from the
 * settings, and a workshop that moves labour to another account means its
 * next sales, not a reversal of every sale already booked. Null when Fiken's
 * answer carries no amounts to compare.
 */
export function saleDifferences(sale: FikenSale, body: Record<string, unknown>): string[] | null {
  const there = bookedTotals(sale)
  const here = bookedTotals({ saleId: sale.saleId, lines: body.lines as FikenSale['lines'] })
  if (!there || !here) return null
  const differences: string[] = []
  if (sale.date !== undefined && sale.date !== body.date) {
    differences.push(`date ${sale.date} there, ${String(body.date)} here`)
  }
  if (sale.dueDate !== undefined && body.dueDate !== undefined && sale.dueDate !== body.dueDate) {
    differences.push(`due date ${sale.dueDate} there, ${String(body.dueDate)} here`)
  }
  const contactId = sale.customer?.contactId
  if (contactId !== undefined && contactId !== body.customerId) {
    differences.push('another customer')
  }
  if (there.net !== here.net) {
    differences.push(`net ${money(there.net)} there, ${money(here.net)} here`)
  }
  if (there.vat !== here.vat) {
    differences.push(`VAT ${money(there.vat)} there, ${money(here.vat)} here`)
  }
  return differences
}

/** Øre as an amount with two decimals, for a log line. */
export function money(cents: number): string {
  return fromCents(cents).toFixed(2)
}

/**
 * A Fiken payment account as one of the app's own methods. 1900 is cash in
 * hand in the standard chart; everything else a payment lands on is a bank
 * account.
 */
export function localPaymentMethod(account: string | undefined): string {
  return (account ?? '').startsWith('1900') ? 'cash' : 'transfer'
}
