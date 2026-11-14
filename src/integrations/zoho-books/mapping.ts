/**
 * Torqvoice records in the shapes the Zoho Books API takes, and Zoho's
 * answers read back. Pure functions only: the server decides what to send
 * and when, this decides what it looks like.
 *
 * Learned from the organisation this was built against (14 Nov 2026), not
 * from the reference alone:
 * - Zoho refuses a whole request when any text field holds `<` or `>`
 *   ("Invalid value passed for Notes"), even "5<10 Nm". Every text goes
 *   through zohoText, which swaps them for ‹ ›.
 * - Characters outside the Basic Multilingual Plane (emoji) come back as
 *   "?", so they are left out.
 * - A field left out of an update keeps its old value (a line's discount,
 *   the adjustment, the notes), and a new invoice without notes gets Zoho's
 *   "Thanks for your business." So every field is always sent.
 * - Lines need no item and take an income account of their own.
 */

import type {
  AccountingCustomer,
  AccountingInvoice,
  AccountingLine,
  AccountingPayment,
} from '@/features/integrations/Lib/accounting-sync'
import { roundAsPrinted } from '@/lib/money'
import { zonedDayKey } from '@/lib/timezone'
import { distribute, normalName, vehicleDescription } from '../xero/mapping'

export { distribute, normalName, vehicleDescription }

/** The contact a counter sale with no customer is billed to. */
export const WALK_IN_NAME = 'Walk-in customer'
/** Said to Zoho when an invoice it already marked sent changes; Zoho requires a reason. */
export const UPDATE_REASON = 'Changed in Torqvoice'
export const ROUNDING_LABEL = 'Rounding'

/* ---------- Zoho's shapes ---------- */

export interface ZohoOrganization {
  organization_id: string
  name?: string
  currency_id?: string
  currency_code?: string
  country_code?: string
  is_default_org?: boolean
  is_location_enabled?: boolean
  price_precision?: number
  is_org_active?: boolean
  plan_name?: string
}

export interface ZohoContactPerson {
  contact_person_id?: string
  first_name?: string
  last_name?: string
  email?: string
  is_primary_contact?: boolean
}

export interface ZohoContact {
  contact_id: string
  contact_name?: string
  company_name?: string
  first_name?: string
  last_name?: string
  email?: string
  status?: string
  contact_type?: string
  contact_persons?: ZohoContactPerson[]
}

export interface ZohoAccount {
  account_id: string
  account_name?: string
  account_code?: string
  account_type?: string
  is_active?: boolean
}

export interface ZohoItem {
  item_id: string
  name?: string
  sku?: string
  status?: string
  item_type?: string
  account_id?: string
}

export interface ZohoTax {
  tax_id: string
  tax_name?: string
  tax_percentage?: number
  tax_type?: string
}

export interface ZohoInvoicePayment {
  payment_id: string
  invoice_payment_id?: string
  date?: string
  amount?: number
  reference_number?: string
  payment_mode?: string
}

export interface ZohoDocument {
  document_id: string
  file_name?: string
}

export interface ZohoInvoice {
  invoice_id: string
  invoice_number?: string
  status?: string
  customer_id?: string
  date?: string
  total?: number
  balance?: number
  adjustment?: number
  last_modified_time?: string
  documents?: ZohoDocument[]
}

export interface ZohoLine {
  line_item_id?: string
  item_id?: string
  name: string
  description: string
  rate: number
  quantity: number
  discount: number
  tax_id: string
  account_id?: string
}

/* ---------- text ---------- */

/**
 * Text as Zoho takes it: no angle brackets, which make it refuse the whole
 * request, and no characters it would store as "?". Kept readable rather
 * than dropped: "5<10 Nm" goes over as "5‹10 Nm".
 */
export function zohoText(value: string | null | undefined, max: number): string {
  if (!value) return ''
  return (
    value
      .replace(/</g, '‹')
      .replace(/>/g, '›')
      // Outside the Basic Multilingual Plane (emoji, rare symbols).
      .replace(/[\u{10000}-\u{10FFFF}]/gu, '')
      // Variation selectors and joiners left behind by emoji.
      .replace(/[︎️‍]/g, '')
      .replace(/[ \t]+\n/g, '\n')
      .trim()
      .slice(0, max)
  )
}

/** Money as the printed invoice rounds it, so both systems agree to the cent. */
export function round2(n: number): number {
  return roundAsPrinted(n)
}

/* ---------- contacts ---------- */

/** A business customer is billed in the company's name; Zoho does not need names to be unique. */
export function contactName(c: AccountingCustomer): string {
  return zohoText(c.company, 200) || zohoText(c.name, 200) || 'Customer'
}

/**
 * Whether a Zoho contact is plausibly this customer by name: the person's
 * name, or the company's, as the contact, its person or its company. An
 * email address can be shared (a family, a company's accounts inbox), so it
 * only counts with this.
 */
export function sameName(
  c: Pick<AccountingCustomer, 'name' | 'company'>,
  contact: Pick<ZohoContact, 'contact_name' | 'company_name' | 'first_name' | 'last_name'>
): boolean {
  const ours = [normalName(c.name), normalName(c.company)].filter(Boolean)
  const theirs = [
    normalName(contact.contact_name),
    normalName(contact.company_name),
    normalName([contact.first_name, contact.last_name].filter(Boolean).join(' ')),
  ].filter(Boolean)
  return ours.some((o) => theirs.includes(o))
}

/**
 * The customer as a Zoho contact. Email and phone live on the primary
 * contact person; on an update that person is named by id, or Zoho adds a
 * second one. The address stays one free-text block, as it is here.
 */
export function buildContact(
  c: AccountingCustomer,
  name: string,
  primaryPersonId?: string | null
): Record<string, unknown> {
  const business = Boolean(c.company?.trim())
  const [first, ...rest] = zohoText(c.name, 200).split(/\s+/).filter(Boolean)
  const person: Record<string, unknown> = {
    first_name: (first ?? '').slice(0, 100),
    last_name: rest.join(' ').slice(0, 100),
    email: zohoText(c.email, 100),
    phone: zohoText(c.phone, 50),
    is_primary_contact: true,
  }
  if (primaryPersonId) person.contact_person_id = primaryPersonId
  const lines = zohoText(c.address, 500)
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
  return {
    contact_name: name,
    company_name: business ? zohoText(c.company, 200) : '',
    contact_type: 'customer',
    customer_sub_type: business ? 'business' : 'individual',
    contact_persons: [person],
    billing_address: {
      address: (lines[0] ?? '').slice(0, 500),
      street2: lines.slice(1).join(', ').slice(0, 255),
    },
  }
}

/* ---------- invoices ---------- */

export type ReferenceChoice = 'vehicle' | 'title' | 'invoiceNumber' | 'none'

/** The reference field, from the workshop's choice. */
export function referenceFor(inv: AccountingInvoice, choice: ReferenceChoice): string {
  if (choice === 'none') return ''
  if (choice === 'invoiceNumber') return zohoText(inv.invoiceNumber, 100)
  if (choice === 'title' || !inv.vehicle) return zohoText(inv.title, 100)
  const name = [inv.vehicle.make, inv.vehicle.model].filter(Boolean).join(' ')
  return zohoText([inv.vehicle.licensePlate, name].filter(Boolean).join(' '), 100)
}

export interface InvoiceOptions {
  customerId: string
  /** The number to send, or null to let Zoho number it. */
  invoiceNumber: string | null
  reference: string
  dueDate: string
  timezone: string
  includeVehicle: boolean
  /** "Vehicle" or "Vessel" in the workshop's document language, in front of the vehicle line. */
  vehicleLabel: string
  includeNotes: boolean
  /** Where the vehicle and the notes go: Zoho's customer notes, or a line above or below the charges. */
  notesPosition: 'customerNotes' | 'above' | 'below'
  includePartNumbers: boolean
  distanceUnit: string
  templateId: string | null
  locationId: string | null
  currencyId: string | null
  accounts: { labor: string | null; parts: string | null; shopFee: string | null }
  items: { labor: string | null; parts: string | null }
  /** Zoho item ids by SKU, for parts matched by part number; empty when that is off. */
  partItems: ReadonlyMap<string, string>
  /** The tax for taxed lines, or null when the invoice carries none. */
  taxId: string | null
  /** The tax for untaxed lines; '' leaves them without one. */
  zeroTaxId: string
  taxExempt: boolean
  /** Existing line ids in order, so an update edits lines instead of replacing them all. */
  lineIds: string[]
  /** The rounding difference from the last answer, carried until it is recomputed. */
  adjustment: number
}

function accountFor(line: AccountingLine, o: InvoiceOptions): string | null {
  if (line.kind === 'part') return o.accounts.parts
  if (line.shopFee) return o.accounts.shopFee ?? o.accounts.labor
  return o.accounts.labor
}

function itemFor(line: AccountingLine, o: InvoiceOptions): string | null {
  if (line.kind === 'part') {
    const sku = line.partNumber?.trim()
    const matched = sku ? o.partItems.get(sku) : undefined
    return matched ?? o.items.parts
  }
  return o.items.labor
}

function lineDescription(line: AccountingLine, includePartNumbers: boolean): string {
  const pn = includePartNumbers && line.kind === 'part' ? line.partNumber?.trim() : null
  const text = line.description.trim() || (line.kind === 'part' ? 'Part' : 'Labour')
  return pn ? `${pn} ${text}` : text
}

function plainNumber(n: number): string {
  return String(Number(n.toFixed(4)))
}

/**
 * Quantity times a two-place rate in whole cents, when Zoho would get
 * exactly that: the rate has no more than the two places Zoho keeps, and
 * the product no part of a cent. Null otherwise.
 */
export function exactCents(quantity: number, rate: number): number | null {
  const r = Math.round(rate * 100)
  if (Math.abs(r / 100 - rate) > 1e-9) return null
  const q = Math.round(quantity * 10_000)
  if (Math.abs(q / 10_000 - quantity) > 1e-9) return null
  const product = BigInt(q) * BigInt(r)
  const scale = BigInt(10_000)
  if (product % scale !== BigInt(0)) return null
  return Number(product / scale)
}

/**
 * The invoice as Zoho takes it, adding up to the printed invoice to the cent.
 *
 * As for Xero: the printed subtotal is split over the lines in whole cents,
 * the printed discount over those, and a line goes as quantity times rate
 * only when that product is exactly its amount; otherwise as one unit at its
 * amount with the quantity and price kept in the description. Zoho works out
 * the tax itself, per rate on the line totals, the way Torqvoice does; what
 * is left is a cent or two, which the adjustment takes (see the server).
 */
export function buildInvoice(inv: AccountingInvoice, o: InvoiceOptions): Record<string, unknown> {
  const taxed = Boolean(o.taxId) && inv.taxRate > 0 && !o.taxExempt
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
  const grossDiscounts =
    discount > 0 ? distribute(Math.min(discount, linesSum), amounts) : priced.map(() => 0)
  // Zoho takes a line discount off the amount before tax, even when prices
  // include it. Torqvoice's discount on a tax-inclusive invoice is off the
  // price with tax, so a taxed line gets its share net of tax: 100 off a
  // 25% line goes over as 80, and Zoho's total lands where the invoice did.
  const inclusive = inv.taxInclusive && taxed
  const netShares = grossDiscounts.map((d, i) =>
    inclusive && priced[i].taxable ? d / (1 + inv.taxRate / 100) : d
  )
  const discounts = inclusive
    ? distribute(
        netShares.reduce((a, b) => a + b, 0),
        netShares
      )
    : grossDiscounts

  const vehicle = o.includeVehicle ? vehicleDescription(inv, o.distanceUnit) : null
  const notes = o.includeNotes ? inv.notes?.trim() || null : null
  const extra = [vehicle ? `${o.vehicleLabel}: ${vehicle}` : null, notes]
    .filter(Boolean)
    .join('\n\n')

  const lines: ZohoLine[] = []
  const textLine = (text: string): ZohoLine => ({
    name: '',
    description: zohoText(text, 2000),
    rate: 0,
    quantity: 1,
    discount: 0,
    tax_id: '',
  })
  if (extra && o.notesPosition === 'above') lines.push(textLine(extra))
  priced.forEach((line, i) => {
    const cents = Math.round(amounts[i] * 100)
    const description = lineDescription(line, o.includePartNumbers)
    const item = itemFor(line, o)
    let quantity: number
    let rate: number
    let text = description
    if (exactCents(line.quantity, line.unitPrice) === cents) {
      quantity = line.quantity
      rate = line.unitPrice
    } else if (item && line.quantity > 0) {
      // A line sold as a Zoho item keeps its quantity, or Zoho takes the
      // wrong count off the shelf. The rate moves to the two places Zoho
      // keeps; a cent the line is then off goes into the rounding adjustment.
      quantity = line.quantity
      rate = round2(amounts[i] / line.quantity)
    } else {
      // One unit at the line's amount, so Zoho has nothing left to round.
      quantity = 1
      rate = amounts[i]
      if (!(line.quantity === 1 && Math.abs(line.unitPrice - amounts[i]) < 0.005)) {
        text = `${description} (${plainNumber(line.quantity)} × ${plainNumber(line.unitPrice)})`
      }
    }
    const zl: ZohoLine = {
      name: '',
      description: zohoText(text, 2000),
      rate,
      quantity,
      discount: discounts[i],
      tax_id: taxed && line.taxable ? (o.taxId ?? '') : o.zeroTaxId,
    }
    if (item) zl.item_id = item
    const account = accountFor(line, o)
    if (account) zl.account_id = account
    lines.push(zl)
  })
  if (extra && o.notesPosition === 'below') lines.push(textLine(extra))
  // Lines are matched to the ones Zoho has by position, so an edit keeps their ids.
  lines.forEach((l, i) => {
    if (o.lineIds[i]) l.line_item_id = o.lineIds[i]
  })

  const body: Record<string, unknown> = {
    customer_id: o.customerId,
    date: zonedDayKey(inv.invoiceDate, o.timezone),
    due_date: o.dueDate,
    reference_number: o.reference,
    // Always sent: left out, Zoho keeps the old notes or adds its own.
    notes: o.notesPosition === 'customerNotes' ? zohoText(extra, 5000) : '',
    is_inclusive_tax: inv.taxInclusive && taxed,
    discount_type: 'item_level',
    is_discount_before_tax: true,
    line_items: lines,
    adjustment: o.adjustment,
    adjustment_description: o.adjustment ? ROUNDING_LABEL : '',
  }
  if (o.invoiceNumber) body.invoice_number = zohoText(o.invoiceNumber, 100)
  if (o.templateId) body.template_id = o.templateId
  if (o.locationId) body.location_id = o.locationId
  if (o.currencyId) body.currency_id = o.currencyId
  return body
}

/* ---------- payments ---------- */

/** Zoho's payment modes, from the method recorded here. */
export function paymentMode(p: Pick<AccountingPayment, 'method' | 'provider'>): string {
  if (p.provider) return 'others'
  if (p.method === 'cash') return 'cash'
  if (p.method === 'card') return 'creditcard'
  if (p.method === 'transfer') return 'banktransfer'
  return 'others'
}

export function buildPayment(
  p: AccountingPayment,
  o: { customerId: string; invoiceId: string; accountId: string; timezone: string; amount: number }
): Record<string, unknown> {
  const reference = [`Torqvoice ${p.method}`, p.provider ? `via ${p.provider}` : null]
    .filter(Boolean)
    .join(' ')
  const description = [p.externalId, p.note].filter(Boolean).join(', ')
  return {
    customer_id: o.customerId,
    payment_mode: paymentMode(p),
    amount: round2(o.amount),
    date: zonedDayKey(p.date, o.timezone),
    reference_number: zohoText(reference, 100),
    description: zohoText(description, 500),
    account_id: o.accountId,
    invoices: [{ invoice_id: o.invoiceId, amount_applied: round2(o.amount) }],
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

/* ---------- reading Zoho's answers ---------- */

/** Zoho's answer to a refused call: a code and a sentence. */
export function errorParts(body: string): { code: number | null; message: string } {
  try {
    const parsed = JSON.parse(body) as { code?: number; message?: string }
    return {
      code: typeof parsed.code === 'number' ? parsed.code : null,
      message: parsed.message?.trim() || body.slice(0, 300) || 'no details',
    }
  } catch {
    return { code: null, message: body.slice(0, 300) || 'no details' }
  }
}

/**
 * The API host the token answer named, if it is one of Zoho's: the stored
 * value came through a token response, but it decides where the workshop's
 * token is sent, so anything else is refused.
 */
export function apiBase(apiDomain: unknown): string {
  const raw = typeof apiDomain === 'string' && apiDomain ? apiDomain : 'https://www.zohoapis.com'
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    throw new Error(`Zoho named an API host that is not an address: ${raw}`)
  }
  if (
    url.protocol !== 'https:' ||
    !/^www\.zohoapis\.(com|eu|in|com\.au|jp|ca|com\.cn|sa|ae|uk|sg)$/.test(url.hostname)
  ) {
    throw new Error(`Zoho named an API host that is not Zoho's: ${url.hostname}`)
  }
  return `https://${url.hostname}/books/v3`
}

/** Zoho Books' web app for the API host's region, for links into it. */
export function webBase(apiDomain: unknown): string {
  const host = new URL(apiBase(apiDomain)).hostname.replace(/^www\.zohoapis\./, '')
  return host === 'ca' ? 'https://books.zohocloud.ca' : `https://books.zoho.${host}`
}

export function invoiceUrl(apiDomain: unknown, organizationId: string, invoiceId: string): string {
  return `${webBase(apiDomain)}/app/${organizationId}#/invoices/${invoiceId}`
}

export function contactUrl(apiDomain: unknown, organizationId: string, contactId: string): string {
  return `${webBase(apiDomain)}/app/${organizationId}#/contacts/${contactId}`
}

/** Zoho's last_modified_time filter: ISO with a numeric offset and no colon, as its answers write it. */
export function modifiedSince(at: Date): string {
  return `${at.toISOString().slice(0, 19)}+0000`
}

/**
 * A payment's day as an instant here: noon on that day in the workshop's
 * time zone, so it shows on the same day in every zone.
 */
export { paymentDay } from '../xero/mapping'

export { checksumOf } from '@/features/integrations/Lib/checksum'
