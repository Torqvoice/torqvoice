/**
 * Torqvoice records in the shapes Xero's Accounting API takes, and Xero's
 * answers read back. Pure functions only: the server decides what to send
 * and when, this decides what it looks like.
 */

import type {
  AccountingCustomer,
  AccountingInvoice,
  AccountingLine,
  AccountingPayment,
} from '@/features/integrations/Lib/accounting-sync'
import { roundAsPrinted } from '@/lib/money'
import { zonedDate, zonedDayKey } from '@/lib/timezone'

export const API_BASE = 'https://api.xero.com/api.xro/2.0'
export const CONNECTIONS_URL = 'https://api.xero.com/connections'
export const REVOKE_URL = 'https://identity.xero.com/connect/revocation'
/** The contact a counter sale with no customer is billed to. */
export const WALK_IN_NAME = 'Walk-in customer'
/** Contacts made here carry this in ContactNumber, so they are found again without a name search. */
export const CONTACT_NUMBER_PREFIX = 'TV-'

/* ---------- Xero's shapes ---------- */

export interface XeroConnection {
  id: string
  tenantId: string
  tenantType?: string
  tenantName?: string | null
}

export interface XeroOrganisation {
  OrganisationID?: string
  Name?: string
  LegalName?: string
  BaseCurrency?: string
  CountryCode?: string
  ShortCode?: string
  IsDemoCompany?: boolean
  PaysTax?: boolean
  PaymentTerms?: { Sales?: { Day?: number; Type?: string } }
}

export interface XeroContact {
  ContactID: string
  Name?: string
  ContactNumber?: string
  EmailAddress?: string
  ContactStatus?: string
}

export interface XeroAccount {
  AccountID: string
  Code?: string
  Name?: string
  Type?: string
  Class?: string
  Status?: string
  EnablePaymentsToAccount?: boolean
}

export interface XeroItem {
  ItemID: string
  Code: string
  Name?: string
  IsSold?: boolean
  IsTrackedAsInventory?: boolean
}

export interface XeroTrackingCategory {
  TrackingCategoryID: string
  Name: string
  Status?: string
  Options?: { TrackingOptionID: string; Name: string; Status?: string }[]
}

export interface XeroBrandingTheme {
  BrandingThemeID: string
  Name: string
  SortOrder?: number
}

export interface XeroPayment {
  PaymentID: string
  Date?: string
  Amount?: number
  Reference?: string
  Status?: string
  PaymentType?: string
  Invoice?: { InvoiceID?: string; InvoiceNumber?: string }
  UpdatedDateUTC?: string
}

export interface XeroInvoice {
  InvoiceID: string
  InvoiceNumber?: string
  Reference?: string
  Status?: string
  Type?: string
  Date?: string
  Contact?: { ContactID?: string; Name?: string }
  SubTotal?: number
  TotalTax?: number
  Total?: number
  AmountDue?: number
  AmountPaid?: number
  Payments?: XeroPayment[]
  HasAttachments?: boolean
  UpdatedDateUTC?: string
}

export interface XeroLine {
  Description?: string
  Quantity?: number
  UnitAmount?: number
  AccountCode?: string
  ItemCode?: string
  TaxType?: string
  TaxAmount?: number
  DiscountRate?: number
  DiscountAmount?: number
  Tracking?: { Name: string; Option: string }[]
}

/* ---------- small helpers ---------- */

/** Money as the printed invoice rounds it, so both systems agree to the cent. */
export function round2(n: number): number {
  return roundAsPrinted(n)
}

/** Four places, which Xero keeps for unit prices when asked with unitdp=4. */
export function round4(n: number): number {
  return Math.round((n + Number.EPSILON) * 10_000) / 10_000
}

/**
 * Xero's JSON dates come as `/Date(1539993600000+0000)/`, the milliseconds
 * at midnight UTC of the day; a few fields are ISO strings instead.
 */
export function parseXeroDate(value: string | undefined | null): Date | null {
  if (!value) return null
  const ms = /\/Date\((-?\d+)(?:[+-]\d{4})?\)\//.exec(value)
  if (ms) return new Date(Number(ms[1]))
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? new Date(parsed) : null
}

/** The day a Xero date names. Xero sends it as midnight UTC of that day. */
export function xeroDayKey(value: string | undefined | null): string | null {
  const d = parseXeroDate(value)
  return d ? d.toISOString().slice(0, 10) : null
}

/**
 * A payment's day as an instant here: noon on that day in the workshop's
 * time zone, so it shows on the same day in every zone, New Zealand's +13
 * included, where noon UTC would already be the next day.
 */
export function paymentDay(value: string | undefined, timeZone: string): Date {
  const day = xeroDayKey(value)
  if (!day) return new Date()
  const [y, m, d] = day.split('-').map(Number)
  return zonedDate(y, m, d, 12, 0, timeZone)
}

/**
 * Splits an amount over weights in whole cents, the remainder going to the
 * largest shares first, so the parts add up to exactly the whole.
 */
export function distribute(total: number, weights: number[]): number[] {
  const cents = Math.round(roundAsPrinted(total) * 100)
  const sum = weights.reduce((a, b) => a + Math.max(0, b), 0)
  if (sum <= 0 || cents === 0) return weights.map(() => 0)
  const raw = weights.map((w) => (Math.max(0, w) / sum) * cents)
  const floors = raw.map((r) => Math.floor(r))
  let left = cents - floors.reduce((a, b) => a + b, 0)
  const order = raw
    .map((r, i) => ({ i, frac: r - Math.floor(r) }))
    .sort((a, b) => b.frac - a.frac || weights[b.i] - weights[a.i])
  for (const { i } of order) {
    if (left <= 0) break
    floors[i]++
    left--
  }
  return floors.map((c) => c / 100)
}

/** Text a Xero field takes, cut to its length. */
function clip(value: string | null | undefined, max: number): string | undefined {
  const v = value?.trim()
  return v ? v.slice(0, max) : undefined
}

/* ---------- contacts ---------- */

/**
 * The contact's name. A business customer is billed in the company's name,
 * with the person as first and last name; Xero keeps names unique, so this
 * is also how an existing contact is recognised.
 */
export function contactName(c: AccountingCustomer): string {
  return xeroName(c.company) ?? xeroName(c.name) ?? 'Customer'
}

/** Xero refuses angle brackets, spaces at either end and runs of spaces in a contact name. */
function xeroName(value: string | null | undefined): string | undefined {
  const v = value?.replace(/[<>]/g, '').replace(/\s+/g, ' ').trim()
  return v ? v.slice(0, 255) : undefined
}

export function contactNumber(c: AccountingCustomer): string {
  return `${CONTACT_NUMBER_PREFIX}${c.customerNumber ?? c.id}`.slice(0, 50)
}

/**
 * The customer as a Xero contact. The address is one free-text block here
 * and up to four lines there, so it is split on line breaks rather than
 * guessed into city and postcode.
 */
export function buildContact(c: AccountingCustomer, name: string): Record<string, unknown> {
  const person = c.company?.trim() ? c.name.trim() : ''
  const [first, ...rest] = person.split(/\s+/).filter(Boolean)
  const lines = (c.address ?? '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
  const address =
    lines.length > 4 ? [...lines.slice(0, 3), lines.slice(3).join(', ')] : lines.slice(0, 4)
  const body: Record<string, unknown> = {
    Name: name,
    ContactNumber: contactNumber(c),
  }
  // Xero refuses an address with letters outside plain ASCII; better none than no contact.
  const email = clip(c.email, 255)
  if (email && /^[\x21-\x7e]+$/.test(email)) body.EmailAddress = email
  if (first) body.FirstName = first.slice(0, 255)
  if (rest.length) body.LastName = rest.join(' ').slice(0, 255)
  const phone = clip(c.phone, 50)
  if (phone) body.Phones = [{ PhoneType: 'DEFAULT', PhoneNumber: phone }]
  if (address.length) {
    const postal: Record<string, unknown> = { AddressType: 'POBOX' }
    address.forEach((line, i) => {
      postal[`AddressLine${i + 1}`] = line.slice(0, 500)
    })
    body.Addresses = [postal]
  }
  const taxNumber = clip(c.taxId, 50)
  if (taxNumber) body.TaxNumber = taxNumber
  return body
}

/* ---------- invoices ---------- */

export type InvoiceStatus = 'DRAFT' | 'SUBMITTED' | 'AUTHORISED'

/** How far along Xero's approval an invoice is; an update never moves it back. */
export const STATUS_RANK: Record<string, number> = { DRAFT: 0, SUBMITTED: 1, AUTHORISED: 2 }

export interface InvoiceOptions {
  contactId: string
  status: InvoiceStatus
  /** The number to send, or null to let Xero number it. */
  invoiceNumber: string | null
  reference: string | null
  dueDate: string
  brandingThemeId: string | null
  currency: string | null
  timezone: string
  /** Back to the job here; Xero shows it as a link on the invoice. */
  url: string
  includeVehicle: boolean
  includeNotes: boolean
  includePartNumbers: boolean
  distanceUnit: string
  accounts: { labor: string | null; parts: string | null; shopFee: string | null; fallback: string }
  items: { labor: string | null; parts: string | null }
  /** Codes of Xero items sold by part number; empty when that is off. */
  partItemCodes: ReadonlySet<string>
  /** 'NoTax' when the organisation is not registered for tax. */
  registeredForTax: boolean
  taxType: string | null
  zeroTaxType: string | null
  /** Send the billed tax per line rather than let Xero work it out. */
  billedTax: boolean
  taxExempt: boolean
  tracking: { Name: string; Option: string }[]
  sentToContact: boolean
}

export function vehicleDescription(inv: AccountingInvoice, distanceUnit: string): string | null {
  if (!inv.vehicle) return null
  const name = [inv.vehicle.year, inv.vehicle.make, inv.vehicle.model].filter(Boolean).join(' ')
  const parts = [
    name,
    inv.vehicle.licensePlate,
    inv.mileage ? `${inv.mileage.toLocaleString('en')} ${distanceUnit}` : null,
  ]
  return parts.filter(Boolean).join(', ') || null
}

/** The Reference field, from the workshop's choice. */
export function referenceFor(
  inv: AccountingInvoice,
  choice: 'vehicle' | 'title' | 'invoiceNumber' | 'none'
): string | null {
  if (choice === 'none') return null
  if (choice === 'invoiceNumber') return clip(inv.invoiceNumber, 255) ?? null
  if (choice === 'title') return clip(inv.title, 255) ?? null
  if (!inv.vehicle) return clip(inv.title, 255) ?? null
  const name = [inv.vehicle.make, inv.vehicle.model].filter(Boolean).join(' ')
  return clip([inv.vehicle.licensePlate, name].filter(Boolean).join(' '), 255) ?? null
}

function accountFor(line: AccountingLine, o: InvoiceOptions): string | null {
  if (line.kind === 'part') return o.accounts.parts
  if (line.shopFee) return o.accounts.shopFee ?? o.accounts.labor
  return o.accounts.labor
}

function itemFor(line: AccountingLine, o: InvoiceOptions): string | null {
  if (line.kind === 'part') {
    const code = line.partNumber?.trim()
    if (code && o.partItemCodes.has(code)) return code
    return o.items.parts
  }
  return o.items.labor
}

function lineDescription(line: AccountingLine, includePartNumbers: boolean): string {
  const pn = includePartNumbers && line.kind === 'part' ? line.partNumber?.trim() : null
  const text = line.description.trim() || (line.kind === 'part' ? 'Part' : 'Labour')
  return (pn ? `${pn} ${text}` : text).slice(0, 4000)
}

/**
 * A quantity times a unit price in whole cents, when Xero would get exactly
 * that: both fit the four places Xero keeps, and the product has no part of
 * a cent for Xero to round its own way. Null otherwise.
 */
export function exactCents(quantity: number, unitPrice: number): number | null {
  const q = Math.round(quantity * 10_000)
  const u = Math.round(unitPrice * 10_000)
  if (Math.abs(q / 10_000 - quantity) > 1e-9 || Math.abs(u / 10_000 - unitPrice) > 1e-9) return null
  // Scaled by 10^8: whole cents are the multiples of 10^6.
  const product = BigInt(q) * BigInt(u)
  const centScale = BigInt(1_000_000)
  if (product % centScale !== BigInt(0)) return null
  return Number(product / centScale)
}

function plainNumber(n: number): string {
  return String(Number(n.toFixed(4)))
}

/**
 * The invoice as Xero takes it, adding up to the printed invoice to the cent.
 *
 * Torqvoice keeps each line's exact total and rounds the subtotal from their
 * sum, the discount and the tax on their own (calculateTotals). Xero instead
 * rounds every line and adds the results, which can land a cent away. So the
 * printed subtotal is split over the lines in whole cents first (each line
 * stays within a cent of its printed total), the printed discount and tax are
 * split over those in whole cents too, and a line goes as quantity times unit
 * price only when that product is exactly its amount. Otherwise it goes as
 * one unit at its amount with the quantity and price kept in the description,
 * so Xero has nothing left to round. Prices go over as billed, tax-inclusive
 * or not, with the line amount type saying which.
 */
export function buildInvoice(inv: AccountingInvoice, o: InvoiceOptions): Record<string, unknown> {
  const taxed = o.registeredForTax && inv.taxRate > 0 && !o.taxExempt
  // What the customer was asked to pay, as printed: that is the figure a
  // ledger must carry (see roundAsPrinted). The lines add up to the printed
  // total less its tax (the gross itself when prices include tax), plus the
  // discount that comes off them.
  const total = round2(inv.totalAmount)
  const tax = round2(inv.taxAmount)
  const discount = round2(inv.discountAmount)
  const linesSum = Math.max(0, round2((inv.taxInclusive ? total : total - tax) + discount))
  let priced = inv.lines.filter((l) => Math.abs(l.total) > 0 || l.quantity > 0)
  // Records from before itemised lines carry only their total.
  if (priced.reduce((a, l) => a + Math.max(0, l.total), 0) <= 0 && linesSum > 0) {
    priced = [
      {
        kind: 'labor',
        description: inv.title?.trim() || 'Service',
        partNumber: null,
        quantity: 1,
        unitPrice: linesSum,
        total: linesSum,
        taxable: true,
      },
    ]
  }
  const amounts = distribute(
    linesSum,
    priced.map((l) => l.total)
  )
  const discounts =
    discount > 0 ? distribute(Math.min(discount, linesSum), amounts) : priced.map(() => 0)
  const taxedLine = (l: AccountingLine) => taxed && l.taxable
  const taxes =
    taxed && o.billedTax
      ? distribute(
          tax,
          priced.map((l, i) => (taxedLine(l) ? amounts[i] - discounts[i] : 0))
        )
      : priced.map(() => 0)

  const lines: XeroLine[] = []
  const vehicle = o.includeVehicle ? vehicleDescription(inv, o.distanceUnit) : null
  if (vehicle) lines.push({ Description: `Vehicle: ${vehicle}`.slice(0, 4000) })

  priced.forEach((line, i) => {
    const cents = Math.round(amounts[i] * 100)
    const description = lineDescription(line, o.includePartNumbers)
    const account = accountFor(line, o)
    const item = itemFor(line, o)
    let xl: XeroLine
    if (exactCents(line.quantity, line.unitPrice) === cents) {
      xl = { Description: description, Quantity: line.quantity, UnitAmount: line.unitPrice }
    } else if (item && line.quantity > 0) {
      // An item keeps its quantity, or Xero takes the wrong count off the
      // shelf. The unit price moves by a fraction of a cent to make the line
      // exact where four places allow it; otherwise Xero rounds this line.
      const unit = round4(amounts[i] / line.quantity)
      xl = {
        Description: description,
        Quantity: line.quantity,
        UnitAmount: exactCents(line.quantity, unit) === cents ? unit : line.unitPrice,
      }
    } else {
      xl = {
        Description:
          line.quantity === 1 && Math.abs(line.unitPrice - amounts[i]) < 0.005
            ? description
            : `${description} (${plainNumber(line.quantity)} × ${plainNumber(line.unitPrice)})`.slice(
                0,
                4000
              ),
        Quantity: 1,
        UnitAmount: amounts[i],
      }
    }
    if (item) xl.ItemCode = item
    // A chosen account wins over the item's; with neither, the default sales account.
    if (account) xl.AccountCode = account
    else if (!item) xl.AccountCode = o.accounts.fallback
    if (o.registeredForTax) {
      const type = taxedLine(line) ? o.taxType : o.zeroTaxType
      if (type) xl.TaxType = type
      if (taxed && o.billedTax) xl.TaxAmount = taxedLine(line) ? taxes[i] : 0
    }
    if (discounts[i] > 0) xl.DiscountAmount = discounts[i]
    if (o.tracking.length) xl.Tracking = o.tracking
    lines.push(xl)
  })

  const notes = o.includeNotes ? inv.notes?.trim() : null
  if (notes) lines.push({ Description: notes.slice(0, 4000) })

  const body: Record<string, unknown> = {
    Type: 'ACCREC',
    Contact: { ContactID: o.contactId },
    Date: zonedDayKey(inv.invoiceDate, o.timezone),
    DueDate: o.dueDate,
    LineAmountTypes: !o.registeredForTax ? 'NoTax' : inv.taxInclusive ? 'Inclusive' : 'Exclusive',
    LineItems: lines,
    Status: o.status,
  }
  // Shown in Xero as a link back to the job. Only a secure address: Xero's
  // rules for this field are not published, and a local http one may be refused.
  if (o.url.startsWith('https://')) body.Url = o.url.slice(0, 2000)
  if (o.invoiceNumber) body.InvoiceNumber = o.invoiceNumber.slice(0, 255)
  if (o.reference) body.Reference = o.reference
  if (o.brandingThemeId) body.BrandingThemeID = o.brandingThemeId
  if (o.currency) body.CurrencyCode = o.currency
  if (o.sentToContact && o.status === 'AUTHORISED') body.SentToContact = true
  return body
}

/**
 * The due date when the invoice carries none: the organisation's default
 * sales terms in Xero, else the invoice date (due on receipt).
 */
export function defaultDueDate(
  invoiceDay: string,
  terms: XeroOrganisation['PaymentTerms'] | undefined
): string {
  const sales = terms?.Sales
  const day = sales?.Day
  if (!sales || typeof day !== 'number' || day < 0) return invoiceDay
  const [y, m, d] = invoiceDay.split('-').map(Number)
  const at = (year: number, month: number, dom: number) => {
    // A day past the month's end lands on its last day, as Xero does.
    const last = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
    return new Date(Date.UTC(year, month, Math.min(Math.max(dom, 1), last)))
      .toISOString()
      .slice(0, 10)
  }
  switch (sales.Type) {
    case 'DAYSAFTERBILLDATE':
      return new Date(Date.UTC(y, m - 1, d + day)).toISOString().slice(0, 10)
    case 'DAYSAFTERBILLMONTH':
      return new Date(Date.UTC(y, m, day)).toISOString().slice(0, 10)
    case 'OFCURRENTMONTH':
      return at(y, m - 1, day)
    case 'OFFOLLOWINGMONTH':
      return at(y, m, day)
    default:
      return invoiceDay
  }
}

/* ---------- payments ---------- */

export function buildPayment(
  p: AccountingPayment,
  o: { invoiceId: string; accountId: string; timezone: string; currencyRate?: number }
): Record<string, unknown> {
  const reference = [
    `Torqvoice ${p.method}`,
    p.provider ? `via ${p.provider}` : null,
    p.externalId,
    p.note,
  ]
    .filter(Boolean)
    .join(', ')
  return {
    Invoice: { InvoiceID: o.invoiceId },
    Account: { AccountID: o.accountId },
    Date: zonedDayKey(p.date, o.timezone),
    Amount: round2(p.amount),
    Reference: reference.slice(0, 255),
  }
}

/** Which payment-method setting a payment from here goes under. */
export function methodAccountKey(
  p: Pick<AccountingPayment, 'method' | 'provider'>
): 'onlineAccount' | 'cashAccount' | 'cardAccount' | 'transferAccount' | null {
  if (p.provider) return 'onlineAccount'
  if (p.method === 'cash') return 'cashAccount'
  if (p.method === 'card') return 'cardAccount'
  if (p.method === 'transfer') return 'transferAccount'
  return null
}

/* ---------- reading Xero's answers ---------- */

interface ValidationBody {
  Message?: string
  Detail?: string
  Title?: string
  /** A 403 comes as a problem document, in lower case. */
  detail?: string
  title?: string
  Elements?: { ValidationErrors?: { Message?: string }[] }[]
}

/** The sentence Xero's error body says, for the log. */
export function errorMessage(body: string): string {
  try {
    const parsed = JSON.parse(body) as ValidationBody
    const validation = (parsed.Elements ?? [])
      .flatMap((e) => e.ValidationErrors ?? [])
      .map((v) => v.Message)
      .filter(Boolean)
    if (validation.length) return [...new Set(validation)].join(' ')
    return (
      parsed.Detail ??
      parsed.Message ??
      parsed.detail ??
      parsed.Title ??
      parsed.title ??
      body.slice(0, 300)
    )
  } catch {
    return body.slice(0, 300) || 'no details'
  }
}

/**
 * A deep link into Xero's web app, in the form Xero documents: the
 * organisation's short code and the page, both as they are, unencoded.
 */
function deepLink(shortCode: string | null, path: string): string {
  return shortCode
    ? `https://go.xero.com/organisationlogin/default.aspx?shortcode=${shortCode}&redirecturl=${path}`
    : `https://go.xero.com${path}`
}

/** Where an invoice opens in Xero. */
export function invoiceUrl(shortCode: string | null, invoiceId: string): string {
  return deepLink(shortCode, `/AccountsReceivable/View.aspx?InvoiceID=${invoiceId}`)
}

export function contactUrl(shortCode: string | null, contactId: string): string {
  return deepLink(shortCode, `/Contacts/View/${contactId}`)
}

/** Xero's If-Modified-Since: UTC to the second, without a zone suffix. */
export function modifiedSinceHeader(at: Date): string {
  return at.toISOString().slice(0, 19)
}

/** Escapes a string for Xero's where-clause, which quotes with double quotes. */
export function whereString(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
}

export { checksumOf } from '@/features/integrations/Lib/checksum'
