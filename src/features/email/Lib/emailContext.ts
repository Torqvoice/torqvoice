import { formatCurrency, type CurrencyFormat } from '@/lib/format'
import type { EmailKind } from './emailKinds'
import { kindSpec } from './emailKinds'
import type { SummaryRowKey } from './emailTemplate'
import { type EmailTag, sampleTagValues, TAGS, type TagValues } from './tags'

/**
 * What a send knows, turned into what a template can say.
 *
 * Every send site passes a context of the shape its kind expects. This file
 * turns that into tag values and summary rows, once, so an invoice mail and
 * a quote mail format a total the same way and the preview in the designer
 * is filled from the same code as a real send.
 */

export interface WorkshopContext {
  name?: string | null
  phone?: string | null
  email?: string | null
  address?: string | null
}

export interface VehicleContext {
  year?: number | null
  make?: string | null
  model?: string | null
  licensePlate?: string | null
  mileage?: number | null
}

export interface DocumentContext {
  number?: string | null
  title?: string | null
  total?: number | null
  /** Already paid; the balance is worked out from it. */
  paid?: number | null
  dueDate?: Date | string | null
  currencyCode?: string
  currencyFormat?: CurrencyFormat
}

/** What every kind can carry. The workshop is filled in by the sender. */
interface BaseContext {
  customerName?: string | null
  vehicle?: VehicleContext | null
  /** Whoever pressed send, when a template wants to sign off with a name. */
  currentUser?: string | null
  /** The sender's own words for this send: a note on a document, or the whole message. */
  message?: string | null
}

export interface DocumentEmailContext extends BaseContext {
  document?: DocumentContext | null
  shareLink?: string | null
}

export interface MessageEmailContext extends BaseContext {
  message: string
  portalLink?: string | null
}

export interface PortalSigninEmailContext extends BaseContext {
  signinLink: string
}

export type EmailContextByKind = {
  invoice_sent: DocumentEmailContext
  quote_sent: DocumentEmailContext
  inspection_sent: DocumentEmailContext
  message: MessageEmailContext
  portal_signin: PortalSigninEmailContext
}

export type EmailContext<K extends EmailKind = EmailKind> = EmailContextByKind[K]

/** How a date is written for the reader. */
export type DateFormatter = (date: Date) => string

const isoDate: DateFormatter = (date) => date.toISOString().slice(0, 10)

/** Blank rather than "null": a tag with no value is left out. */
const text = (value: string | null | undefined): string | undefined =>
  value?.trim() ? value.trim() : undefined

function vehicleName(vehicle: VehicleContext | null | undefined): string | undefined {
  if (!vehicle) return undefined
  return text([vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(' '))
}

function asDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function money(doc: DocumentContext): (amount: number) => string {
  const currency = doc.currencyCode || 'USD'
  return (amount) => formatCurrency(amount, currency, doc.currencyFormat)
}

function balanceOf(doc: DocumentContext): number | null {
  if (doc.total === null || doc.total === undefined) return null
  return Math.max(0, doc.total - (doc.paid ?? 0))
}

export interface ContextOptions {
  workshop: WorkshopContext
  formatDate?: DateFormatter
}

/**
 * The tag values for one send. Only the tags the kind offers are filled;
 * anything the send has no value for is left out, and fillTags renders it
 * as nothing.
 */
export function tagValuesFor<K extends EmailKind>(
  kind: K,
  context: EmailContext<K>,
  options: ContextOptions
): TagValues {
  const { workshop } = options
  const formatDate = options.formatDate ?? isoDate
  const base = context as BaseContext
  const doc = (context as DocumentEmailContext).document ?? undefined
  const fmt = doc ? money(doc) : undefined
  const balance = doc ? balanceOf(doc) : null
  const dueDate = asDate(doc?.dueDate)

  const all: TagValues = {
    workshop_name: text(workshop.name),
    workshop_phone: text(workshop.phone),
    workshop_email: text(workshop.email),
    workshop_address: text(workshop.address),
    current_user: text(base.currentUser),
    customer_name: text(base.customerName),
    vehicle: vehicleName(base.vehicle),
    plate: text(base.vehicle?.licensePlate),
    mileage: base.vehicle?.mileage ? String(base.vehicle.mileage) : undefined,
    document_number: text(doc?.number),
    document_title: text(doc?.title),
    total: doc?.total !== null && doc?.total !== undefined && fmt ? fmt(doc.total) : undefined,
    balance_due: balance !== null && fmt ? fmt(balance) : undefined,
    due_date: dueDate ? formatDate(dueDate) : undefined,
    share_link: text((context as DocumentEmailContext).shareLink),
    message: text(base.message),
    signin_link: text((context as PortalSigninEmailContext).signinLink),
    portal_link: text((context as MessageEmailContext).portalLink),
  }

  const values: TagValues = {}
  for (const tag of kindSpec(kind).tags) {
    const value = all[tag]
    if (value !== undefined) values[tag] = value
  }
  return values
}

/** A row of the summary panel: which row it is, its label, and its value. */
export interface SummaryRow {
  key: SummaryRowKey
  label: string
  value: string
}

export type SummaryLabels = Record<SummaryRowKey, string>

/**
 * The rows the summary panel can show for one send. Labels come from the
 * caller, worded in the reader's language. The balance row only appears
 * when it differs from the total; otherwise it would repeat it.
 */
export function summaryRowsFor<K extends EmailKind>(
  kind: K,
  context: EmailContext<K>,
  labels: SummaryLabels,
  formatDate: DateFormatter = isoDate
): SummaryRow[] {
  if (!kindSpec(kind).hasSummary) return []
  const doc = (context as DocumentEmailContext).document
  const vehicle = vehicleName((context as BaseContext).vehicle)
  const rows: SummaryRow[] = []
  if (doc?.number) rows.push({ key: 'reference', label: labels.reference, value: doc.number })
  if (vehicle) rows.push({ key: 'vehicle', label: labels.vehicle, value: vehicle })
  if (doc && doc.total !== null && doc.total !== undefined) {
    const fmt = money(doc)
    rows.push({ key: 'total', label: labels.total, value: fmt(doc.total) })
    const balance = balanceOf(doc)
    if (balance !== null && balance !== doc.total) {
      rows.push({ key: 'balance', label: labels.balance, value: fmt(balance) })
    }
  }
  const dueDate = asDate(doc?.dueDate)
  if (dueDate) rows.push({ key: 'due', label: labels.due, value: formatDate(dueDate) })
  return rows
}

/**
 * Stand-in values for the designer's preview: the workshop's own details,
 * because seeing your own name in the footer is what tells you it is right,
 * and an invented customer and job for everything else.
 */
export function sampleValuesFor(kind: EmailKind, workshop: WorkshopContext): TagValues {
  const samples = sampleTagValues()
  // The workshop's real details replace the samples wholesale: a missing
  // phone shows as no phone, because that is what the customer would see.
  samples.workshop_name = text(workshop.name) ?? samples.workshop_name
  samples.workshop_phone = text(workshop.phone)
  samples.workshop_email = text(workshop.email)
  samples.workshop_address = text(workshop.address)
  const values: TagValues = {}
  for (const tag of kindSpec(kind).tags as readonly EmailTag[]) {
    const value = samples[tag]
    if (value !== undefined) values[tag] = value
  }
  return values
}

export function sampleSummaryRows(kind: EmailKind, labels: SummaryLabels): SummaryRow[] {
  if (!kindSpec(kind).hasSummary) return []
  return [
    { key: 'reference', label: labels.reference, value: 'INV-1042' },
    { key: 'vehicle', label: labels.vehicle, value: '2019 Volvo V70' },
    { key: 'total', label: labels.total, value: '1 250,00' },
    { key: 'balance', label: labels.balance, value: '250,00' },
    { key: 'due', label: labels.due, value: '30 Sep 2026' },
  ]
}

/**
 * A context with the same stand-in data the preview shows, for a test send
 * through the real pipeline.
 */
export function sampleContextFor(kind: EmailKind, currentUser?: string | null): EmailContext {
  const base: BaseContext = {
    customerName: TAGS.customer_name.sample,
    vehicle: { year: 2019, make: 'Volvo', model: 'V70', licensePlate: 'AB 12345', mileage: 92000 },
    currentUser: currentUser ?? TAGS.current_user.sample,
    message: TAGS.message.sample,
  }
  switch (kind) {
    case 'portal_signin':
      return { ...base, signinLink: TAGS.signin_link.sample }
    case 'message':
      return { ...base, message: TAGS.message.sample, portalLink: TAGS.portal_link.sample }
    default:
      return {
        ...base,
        document: {
          number: TAGS.document_number.sample,
          title: TAGS.document_title.sample,
          total: 1250,
          paid: 1000,
          dueDate: new Date('2026-09-30T12:00:00Z'),
          currencyCode: 'EUR',
        },
        shareLink: TAGS.share_link.sample,
      }
  }
}
