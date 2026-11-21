/**
 * Torqvoice records as QuickBooks Online entities, and back.
 *
 * Pure functions so the shape the API receives can be tested without a
 * company. QuickBooks recalculates tax from the tax code on each line, so a
 * body carries what the workshop billed and the connector checks afterwards
 * that the ledger arrived at the same total.
 */

import { taxDisplay } from '@/lib/tax'
import { createHash } from 'node:crypto'
import type {
  AccountingCustomer,
  AccountingInvoice,
  AccountingPayment,
} from '@/features/integrations/Lib/accounting-sync'
import { roundAsPrinted } from '@/lib/money'
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

/** A stable, non-reversible reference for a company id, for rows the browser sees. */
export function realmRef(realm: string): string {
  return `qbo-${createHash('sha256').update(realm).digest('hex').slice(0, 16)}`
}

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
  CustomerMemo?: { value?: string }
  CustomField?: { DefinitionId: string; StringValue?: string }[]
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

/** To the cent, the way the invoice prints the amount, so the ledger carries the printed figure. */
export function round2(n: number): number {
  return roundAsPrinted(n)
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
  /**
   * Where the customer's reference / PO goes, when the workshop has chosen a
   * place for it; absent, it is not sent and the invoice is what it always
   * was. `memo` leads the message the customer reads, under the caption
   * given; `customField` fills one of the company's sales custom fields.
   */
  customerReference?:
    | { place: 'memo'; label: string }
    | { place: 'customField'; definitionId: string }
    | null
}

/**
 * The longest value a sales custom field is sent with. Intuit's reference
 * gives no figure; 31 is the limit the QuickBooks form itself enforces, so a
 * longer reference is cut here rather than have the whole invoice refused.
 */
export const CUSTOM_FIELD_MAX = 31

/** The message on the invoice: the reference first when it goes there, then the notes. */
function customerMemo(inv: AccountingInvoice, o: InvoiceOptions): string | null {
  const reference =
    o.customerReference?.place === 'memo' && inv.customerReference
      ? `${o.customerReference.label}: ${inv.customerReference}`
      : null
  if (!reference) return inv.notes ? inv.notes.slice(0, 1000) : null
  return [reference, inv.notes].filter(Boolean).join('\n').slice(0, 1000)
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
  const serviceDate = zonedDayKey(inv.serviceDate, o.timezone)
  // A US company has no tax-inclusive mode: QuickBooks adds tax on top of
  // the lines whatever they say. Gross prices go over as net so the total,
  // with the billed tax on top, is the gross the customer saw.
  const netFactor = !o.globalTax && inv.taxInclusive && taxable ? 1 / (1 + inv.taxRate / 100) : 1
  // A line left out of the tax goes under the code that says so, the way
  // QuickBooks itself expects a parts-only sales tax to be booked, and it
  // holds no tax to take out of its price.
  const codeFor = (line: AccountingInvoice['lines'][number]) =>
    taxable && line.taxable ? o.taxCodeId : o.zeroTaxCodeId
  const factorFor = (line: AccountingInvoice['lines'][number]) => (line.taxable ? netFactor : 1)
  // The discount is shared over taxed and untaxed lines in proportion, so
  // taken net it shrinks by as much as the subtotal as a whole does.
  const netDiscount =
    netFactor === 1
      ? inv.discountAmount
      : taxDisplay({ taxRate: inv.taxRate, taxInclusive: true }).discount(
          inv.discountAmount,
          inv.subtotal,
          inv.taxableSubtotal
        )
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
    lines.push(itemLine(line, itemId, codeFor(line), serviceDate, factorFor(line)))
  }
  if (inv.discountAmount > 0) {
    const percent = inv.discountType === 'percentage' && inv.discountValue > 0
    lines.push({
      DetailType: 'DiscountLineDetail',
      Amount: round2(netDiscount),
      DiscountLineDetail: percent
        ? { PercentBased: true, DiscountPercent: inv.discountValue }
        : { PercentBased: false },
    })
  }
  const memo = customerMemo(inv, o)
  const body: Record<string, unknown> = {
    CustomerRef: { value: o.customerRef },
    TxnDate: zonedDayKey(inv.invoiceDate, o.timezone),
    ...(inv.dueDate && { DueDate: zonedDayKey(inv.dueDate, o.timezone) }),
    ...(o.customTxnNumbers &&
      refField(inv.invoiceNumber) && { DocNumber: refField(inv.invoiceNumber) }),
    Line: lines,
    ...(memo && { CustomerMemo: { value: memo } }),
    // Only when the job has a reference: a sparse update leaves a field it
    // does not mention alone, and an empty value on a new invoice is not
    // something Intuit documents.
    ...(o.customerReference?.place === 'customField' &&
      inv.customerReference && {
        CustomField: [
          {
            DefinitionId: o.customerReference.definitionId,
            Type: 'StringType',
            StringValue: inv.customerReference.slice(0, CUSTOM_FIELD_MAX),
          },
        ],
      }),
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

/** One entry of Preferences.SalesFormsPrefs.CustomField, as QuickBooks returns it. */
export interface QboPreferenceField {
  Name?: string
  Type?: string
  StringValue?: string
  BooleanValue?: boolean
}

/**
 * The company's sales custom fields that are switched on, by the id an
 * invoice names them with.
 *
 * QuickBooks lists them as flat name and value pairs in two groups:
 * `SalesFormsPrefs.UseSalesCustom2` says whether slot 2 is in use and
 * `SalesFormsPrefs.SalesCustomName2` what the company calls it. The number
 * is the DefinitionId. A field can only be created or switched on in
 * QuickBooks itself, so one that is off is not offered.
 */
export function salesCustomFields(
  groups: ReadonlyArray<{ CustomField?: ReadonlyArray<QboPreferenceField> }> | undefined
): { definitionId: string; name: string }[] {
  const entries = (groups ?? []).flatMap((group) => group.CustomField ?? [])
  const used = new Set<string>()
  const names = new Map<string, string>()
  for (const entry of entries) {
    const use = /^SalesFormsPrefs\.UseSalesCustom(\d+)$/.exec(entry.Name ?? '')
    if (use && entry.BooleanValue === true) used.add(use[1])
    const name = /^SalesFormsPrefs\.SalesCustomName(\d+)$/.exec(entry.Name ?? '')
    if (name && entry.StringValue?.trim()) names.set(name[1], entry.StringValue.trim())
  }
  return [...used]
    .sort((a, b) => Number(a) - Number(b))
    .map((id) => ({ definitionId: id, name: names.get(id) ?? `Custom field ${id}` }))
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

export { checksumOf } from '@/features/integrations/Lib/checksum'

/**
 * The free text this connector last wrote on an invoice: the customer's
 * message and the custom field the reference goes in. Kept on the invoice's
 * link, so a later sync can take back its own words and nobody else's.
 */
export interface WrittenText {
  memo: string | null
  customField: { definitionId: string; value: string } | null
}

/** What an invoice body writes into the message and the reference's custom field. */
export function writtenText(body: Record<string, unknown>): WrittenText {
  const memo = (body.CustomerMemo as { value?: string } | undefined)?.value ?? null
  const [field] = (body.CustomField as { DefinitionId: string; StringValue: string }[]) ?? []
  return {
    memo: memo || null,
    customField: field?.StringValue
      ? { definitionId: field.DefinitionId, value: field.StringValue }
      : null,
  }
}

/** A link's record of what was written, or null for one from before it was kept. */
export function writtenTextOf(metadata: Record<string, unknown> | null | undefined): WrittenText {
  const written = metadata?.written as Partial<WrittenText> | undefined
  const field = written?.customField
  return {
    memo: typeof written?.memo === 'string' ? written.memo : null,
    customField:
      field && typeof field.definitionId === 'string' && typeof field.value === 'string'
        ? { definitionId: field.definitionId, value: field.value }
        : null,
  }
}

const sameText = (a: string | undefined, b: string) =>
  (a ?? '').replace(/\r\n/g, '\n').trim() === b.replace(/\r\n/g, '\n').trim()

/**
 * What a sparse update adds to take away text this connector wrote that the
 * job no longer has: a reference taken off the work order, with no notes to
 * fill the message instead. A sparse update leaves alone a field it does not
 * mention, so without this the old reference would stay in QuickBooks.
 *
 * Only text still exactly as this connector wrote it is cleared: a message
 * or a custom field the bookkeeper has typed into since is theirs and stays.
 */
export function clearWrittenText(
  body: Record<string, unknown>,
  current: Pick<QboInvoice, 'CustomerMemo' | 'CustomField'>,
  written: WrittenText
): Record<string, unknown> {
  const clears: Record<string, unknown> = {}
  if (!body.CustomerMemo && written.memo && sameText(current.CustomerMemo?.value, written.memo)) {
    clears.CustomerMemo = { value: '' }
  }
  const field = written.customField
  const sent = (body.CustomField as { DefinitionId: string }[] | undefined) ?? []
  if (field && !sent.some((f) => f.DefinitionId === field.definitionId)) {
    const theirs = current.CustomField?.find((f) => f.DefinitionId === field.definitionId)
    if (theirs && sameText(theirs.StringValue, field.value)) {
      clears.CustomField = [
        ...sent,
        { DefinitionId: field.definitionId, Type: 'StringType', StringValue: '' },
      ]
    }
  }
  return clears
}
