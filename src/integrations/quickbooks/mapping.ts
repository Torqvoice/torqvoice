/**
 * Torqvoice records as QuickBooks Online entities, and back.
 *
 * Pure functions so the shape the API receives can be tested without a
 * company. QuickBooks recalculates tax from the tax code on each line, so a
 * body carries what the workshop billed and the connector checks afterwards
 * that the ledger arrived at the same total.
 */

import type {
  AccountingCustomer,
  AccountingInvoice,
  AccountingPayment,
} from '@/features/integrations/Lib/accounting-sync'
import { zonedDayKey } from '@/lib/timezone'

/** Intuit retires older minor versions; this one carries the current field set. */
export const MINOR_VERSION = '75'
/** DocNumber, PaymentRefNum and a few other reference fields stop here. */
export const REF_MAX = 21
export const PRODUCTION_API = 'https://quickbooks.api.intuit.com'
export const SANDBOX_API = 'https://sandbox-quickbooks.api.intuit.com'
export const PRODUCTION_APP = 'https://app.qbo.intuit.com'
export const SANDBOX_APP = 'https://app.sandbox.qbo.intuit.com'
export const REVOKE_URL = 'https://developer.api.intuit.com/v2/oauth2/tokens/revoke'
/** The customer counter sales are booked to when no customer was recorded. */
export const WALK_IN_NAME = 'Walk-in customer'
export const DEFAULT_ITEM_NAMES = { labor: 'Labour', part: 'Parts' } as const
/** Opens every private note this app writes, which is how its own records are recognised later. */
export const NOTE_MARK = 'Torqvoice'
/** Customer notes stop here. */
export const NOTES_MAX = 2000

export type Environment = 'production' | 'sandbox'

export interface QboRef {
  value: string
  name?: string
}

export interface QboFault {
  Fault?: { Error?: { Message?: string; Detail?: string; code?: string }[]; type?: string }
}

export interface QboCustomer {
  Id: string
  SyncToken: string
  DisplayName: string
  Active?: boolean
}

export interface QboItem {
  Id: string
  Name: string
  Type?: string
  Active?: boolean
}

export interface QboTaxRateDetail {
  TaxRateRef?: QboRef
  /** TaxOnAmount for a plain rate; TaxOnTax marks a compounding rate in a group. */
  TaxTypeApplicable?: string
}

export interface QboTaxCode {
  Id: string
  Name: string
  Active?: boolean
  Taxable?: boolean
  SalesTaxRateList?: { TaxRateDetail?: QboTaxRateDetail | QboTaxRateDetail[] }
}

export interface QboTaxRate {
  Id: string
  Name?: string
  Active?: boolean
  /** The percentage, 20 for 20%. */
  RateValue?: number
}

export interface QboAccount {
  Id: string
  Name: string
  AccountType?: string
  AccountSubType?: string
  Active?: boolean
}

export interface QboLine {
  Id?: string
  DetailType: string
  /** Required on every charge line; a description-only line carries none. */
  Amount?: number
  Description?: string
  SalesItemLineDetail?: {
    ItemRef: QboRef
    Qty?: number
    UnitPrice?: number
    ServiceDate?: string
    TaxCodeRef?: QboRef
  }
  DescriptionLineDetail?: { ServiceDate?: string }
  DiscountLineDetail?: { PercentBased: boolean; DiscountPercent?: number }
  TaxLineDetail?: {
    TaxRateRef: QboRef
    PercentBased: boolean
    TaxPercent?: number
    NetAmountTaxable?: number
  }
  LinkedTxn?: { TxnId: string; TxnType: string }[]
}

export interface QboInvoice {
  Id: string
  SyncToken: string
  DocNumber?: string
  TotalAmt?: number
  Balance?: number
  PrivateNote?: string
  status?: string
}

export interface QboPayment {
  Id: string
  SyncToken: string
  TotalAmt?: number
  TxnDate?: string
  PaymentRefNum?: string
  PrivateNote?: string
  PaymentMethodRef?: QboRef
  CustomerRef?: QboRef
  Line?: QboLine[]
  status?: string
}

export function apiHost(env: Environment): string {
  return env === 'sandbox' ? SANDBOX_API : PRODUCTION_API
}

export function appHost(env: Environment): string {
  return env === 'sandbox' ? SANDBOX_APP : PRODUCTION_APP
}

export function invoiceUrl(env: Environment, id: string): string {
  return `${appHost(env)}/app/invoice?txnId=${encodeURIComponent(id)}`
}

export function customerUrl(env: Environment, id: string): string {
  return `${appHost(env)}/app/customerdetail?nameId=${encodeURIComponent(id)}`
}

export function paymentUrl(env: Environment, id: string): string {
  return `${appHost(env)}/app/recvpayment?txnId=${encodeURIComponent(id)}`
}

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

/** A value for the query language, which escapes a quote with a backslash. */
export function sqlString(value: string): string {
  return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`
}

export function refField(value: string | null | undefined): string | undefined {
  const v = value?.trim()
  return v ? v.slice(0, REF_MAX) : undefined
}

/** The vendor's own wording for a failed call, or the raw body when there is none. */
export function faultMessage(body: string): string {
  try {
    const parsed = JSON.parse(body) as QboFault
    const errors = parsed.Fault?.Error ?? []
    const lines = errors
      .map((e) => [e.Message, e.Detail].filter(Boolean).join(': '))
      .filter(Boolean)
    if (lines.length) return lines.join('; ')
  } catch {
    // not JSON
  }
  return body.slice(0, 300)
}

export function faultCode(body: string): string | null {
  try {
    const parsed = JSON.parse(body) as QboFault
    return parsed.Fault?.Error?.[0]?.code ?? null
  } catch {
    return null
  }
}

/** Object Not Found, which QuickBooks answers with a 400 rather than a 404. */
export const NOT_FOUND_CODE = '610'
/** Duplicate Name Exists Error. */
export const DUPLICATE_NAME_CODE = '6240'
/** Duplicate Document Number Error, raised only when custom transaction numbers are on. */
export const DUPLICATE_DOCNUMBER_CODE = '6140'

export function customerDisplayName(c: AccountingCustomer): string {
  return c.name.trim().slice(0, 500) || c.company?.trim().slice(0, 500) || 'Customer'
}

/**
 * The customer as QuickBooks stores one. The address is one free-text block
 * here and up to five lines there, so it is split on line breaks rather than
 * guessed into city and postcode.
 */
export function buildCustomer(
  c: AccountingCustomer,
  displayName: string,
  options: {
    /** Only on create: a customer's currency is fixed once it exists. */
    currency?: string | null
  } = {}
) {
  const addressLines = (c.address ?? '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 5)
  const notes = [
    c.customerNumber ? `Torqvoice customer ${c.customerNumber}` : null,
    c.taxId ? `Tax id ${c.taxId}` : null,
  ]
    .filter(Boolean)
    .join('\n')
  const body: Record<string, unknown> = {
    DisplayName: displayName,
    ...(c.company && { CompanyName: c.company.slice(0, 100) }),
    ...(c.email && { PrimaryEmailAddr: { Address: c.email.slice(0, 100) } }),
    ...(c.phone && { PrimaryPhone: { FreeFormNumber: c.phone.slice(0, 30) } }),
    ...(addressLines.length > 0 && {
      BillAddr: Object.fromEntries(addressLines.map((l, i) => [`Line${i + 1}`, l.slice(0, 500)])),
    }),
    ...(notes && { Notes: notes.slice(0, NOTES_MAX) }),
    Taxable: !c.taxExempt,
    ...(options.currency && { CurrencyRef: { value: options.currency } }),
  }
  return body
}

export interface InvoiceOptions {
  customerRef: string
  customerEmail: string | null
  laborItemId: string | null
  partsItemId: string | null
  taxCodeId: string | null
  zeroTaxCodeId: string | null
  /** Whether the company uses the global (non-US) tax model. */
  globalTax: boolean
  /** Required whenever the company runs multi-currency; null otherwise. */
  currency: string | null
  /**
   * Whether the company lets a transaction carry its own number. When it
   * does not, QuickBooks numbers the invoice itself and a DocNumber sent on
   * create only risks duplicates, so none is sent.
   */
  customTxnNumbers: boolean
  timezone: string
  url: string
  taxExempt: boolean
  /** A text line naming the vehicle above the charges, so the books say which car. */
  includeVehicle: boolean
  /**
   * The tax as billed, for QuickBooks to keep instead of its own figure:
   * TxnTaxDetail as the tax module builds it, or null to let QuickBooks
   * work the tax out from the code.
   */
  txnTaxDetail: Record<string, unknown> | null
}

/** "2018 Toyota Corolla, AB 12345, 84 200 km", or null without a vehicle. */
export function vehicleDescription(inv: AccountingInvoice): string | null {
  if (!inv.vehicle) return null
  const name = [inv.vehicle.year, inv.vehicle.make, inv.vehicle.model].filter(Boolean).join(' ')
  const parts = [name, inv.vehicle.licensePlate, inv.mileage ? `${inv.mileage} km` : null]
  return parts.filter(Boolean).join(', ')
}

function itemLine(
  line: AccountingInvoice['lines'][number],
  itemId: string,
  taxCode: string | null,
  serviceDate: string,
  netFactor: number
): QboLine {
  const description = [line.partNumber, line.description].filter(Boolean).join(' ').slice(0, 4000)
  // QuickBooks derives Amount from Qty × UnitPrice and rejects a line where
  // they disagree. A line whose total was edited by hand goes as one unit.
  const consistent = Math.abs(line.quantity * line.unitPrice - line.total) < 0.005
  const qty = consistent ? line.quantity : 1
  const unit = consistent ? line.unitPrice : line.total
  return {
    DetailType: 'SalesItemLineDetail',
    Amount: round2(line.total * netFactor),
    Description: description,
    SalesItemLineDetail: {
      ItemRef: { value: itemId },
      Qty: qty,
      UnitPrice: round2(unit * netFactor),
      ServiceDate: serviceDate,
      ...(taxCode && { TaxCodeRef: { value: taxCode } }),
    },
  }
}

/**
 * The invoice body for a create, or for a sparse update once Id and
 * SyncToken are added. Lines replace what the ledger had, so an edited job
 * arrives whole.
 */
export function buildInvoice(inv: AccountingInvoice, o: InvoiceOptions): Record<string, unknown> {
  const taxable = inv.taxRate > 0 && !o.taxExempt
  const taxCode = taxable ? o.taxCodeId : o.zeroTaxCodeId
  const serviceDate = zonedDayKey(inv.serviceDate, o.timezone)
  // A US company has no tax-inclusive mode: QuickBooks adds tax on top of
  // the lines whatever they say. Gross prices go over as net so the total,
  // with the billed tax on top, is the gross the customer saw.
  const netFactor = !o.globalTax && inv.taxInclusive && taxable ? 1 / (1 + inv.taxRate / 100) : 1
  const lines: QboLine[] = []
  const vehicle = o.includeVehicle ? vehicleDescription(inv) : null
  if (vehicle) {
    lines.push({
      DetailType: 'DescriptionOnly',
      Description: `Vehicle: ${vehicle}`.slice(0, 4000),
      DescriptionLineDetail: { ServiceDate: serviceDate },
    })
  }
  for (const line of inv.lines) {
    const itemId = line.kind === 'labor' ? o.laborItemId : o.partsItemId
    if (!itemId) continue
    lines.push(itemLine(line, itemId, taxCode, serviceDate, netFactor))
  }
  if (inv.discountAmount > 0) {
    const percent = inv.discountType === 'percentage' && inv.discountValue > 0
    lines.push({
      DetailType: 'DiscountLineDetail',
      Amount: round2(inv.discountAmount * netFactor),
      DiscountLineDetail: percent
        ? { PercentBased: true, DiscountPercent: inv.discountValue }
        : { PercentBased: false },
    })
  }
  const body: Record<string, unknown> = {
    CustomerRef: { value: o.customerRef },
    TxnDate: zonedDayKey(inv.invoiceDate, o.timezone),
    ...(inv.dueDate && { DueDate: zonedDayKey(inv.dueDate, o.timezone) }),
    ...(o.customTxnNumbers &&
      refField(inv.invoiceNumber) && { DocNumber: refField(inv.invoiceNumber) }),
    Line: lines,
    ...(inv.notes && { CustomerMemo: { value: inv.notes.slice(0, 1000) } }),
    PrivateNote: `${NOTE_MARK} ${o.url}`.slice(0, 4000),
    ...(o.customerEmail && { BillEmail: { Address: o.customerEmail.slice(0, 100) } }),
    ...(o.currency && { CurrencyRef: { value: o.currency } }),
    // Torqvoice taxes the amount after the discount, so the ledger must too.
    ...(inv.discountAmount > 0 && { ApplyTaxAfterDiscount: true }),
    ...(o.txnTaxDetail && { TxnTaxDetail: o.txnTaxDetail }),
  }
  if (o.globalTax) {
    body.GlobalTaxCalculation = !taxable
      ? 'NotApplicable'
      : inv.taxInclusive
        ? 'TaxInclusive'
        : 'TaxExcluded'
  }
  return body
}

export interface PaymentOptions {
  customerRef: string
  invoiceRemoteId: string
  depositAccountId: string | null
  currency: string | null
  timezone: string
}

export function buildPayment(p: AccountingPayment, o: PaymentOptions): Record<string, unknown> {
  const note = [
    `${NOTE_MARK} payment, ${p.method}`,
    p.provider ? `via ${p.provider}` : null,
    p.note,
  ]
    .filter(Boolean)
    .join('. ')
  return {
    CustomerRef: { value: o.customerRef },
    TotalAmt: round2(p.amount),
    TxnDate: zonedDayKey(p.date, o.timezone),
    ...(refField(p.externalId) && { PaymentRefNum: refField(p.externalId) }),
    PrivateNote: note.slice(0, 4000),
    ...(o.depositAccountId && { DepositToAccountRef: { value: o.depositAccountId } }),
    ...(o.currency && { CurrencyRef: { value: o.currency } }),
    Line: [
      {
        Amount: round2(p.amount),
        LinkedTxn: [{ TxnId: o.invoiceRemoteId, TxnType: 'Invoice' }],
      },
    ],
  }
}

/** A QuickBooks payment method name as one of the app's own methods. */
export function localPaymentMethod(name: string | undefined): string {
  const n = (name ?? '').toLowerCase()
  if (!n) return 'other'
  if (/cash/.test(n)) return 'cash'
  if (/card|visa|master|amex|express/.test(n)) return 'card'
  if (/transfer|bank|ach|eft|wire|giro|bacs|sepa/.test(n)) return 'transfer'
  return 'other'
}

/** Stable hash of a body, so an unchanged record is not pushed twice. */
export function checksumOf(body: unknown): string {
  const input = JSON.stringify(body)
  let h = 2166136261
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i)
    h = Math.imul(h, 16777619) >>> 0
  }
  return h.toString(16)
}
