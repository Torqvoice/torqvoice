import {
  type CurrencySettings,
  resolveCurrencyCode,
  resolveCurrencySettings,
} from '@/lib/currencies'
import { SETTING_KEYS } from '@/features/settings/Schema/settingsSchema'
import { formatCurrency, formatDate, type CurrencyFormat } from '@/lib/format'
import { resolveWorkshopTimeZone } from '@/lib/workshop-timezone'
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

export interface TeamInvitationEmailContext extends BaseContext {
  /** The sign-up link carrying the invitation token. */
  inviteLink: string
  /** The role the person is invited as, in the workshop's own words. */
  role?: string | null
  /** When the link stops working. */
  expiresAt?: Date | string | null
}

export type EmailContextByKind = {
  invoice_sent: DocumentEmailContext
  quote_sent: DocumentEmailContext
  inspection_sent: DocumentEmailContext
  message: MessageEmailContext
  portal_signin: PortalSigninEmailContext
  team_invitation: TeamInvitationEmailContext
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
  const currency = resolveCurrencyCode(doc.currencyCode)
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
  const invitation = context as TeamInvitationEmailContext
  const inviteExpires = asDate(invitation.expiresAt)

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
    invite_link: text(invitation.inviteLink),
    role: text(invitation.role),
    invite_expires: inviteExpires ? formatDate(inviteExpires) : undefined,
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
/**
 * The workshop's currency and date format, for the stand-in amounts and dates.
 * A sent mail writes them the workshop's way, so the preview does too: a
 * workshop in dollars should not see euros in its designer.
 */
export interface SampleFormat {
  currency: CurrencySettings
  date: DateFormatter
}

/**
 * The sample format from a workshop's settings, as `getSettings` returns them:
 * the caller asks for SAMPLE_FORMAT_KEYS. The time zone is resolved the way a
 * send resolves it (the one set, else the one detected, else UTC), so the
 * preview and a test mail show the same day.
 */
export function sampleFormatFrom(settings: Record<string, string | undefined>): SampleFormat {
  const dateFormat = settings[SETTING_KEYS.DATE_FORMAT] || undefined
  const timezone = resolveWorkshopTimeZone(
    settings[SETTING_KEYS.TIMEZONE],
    settings[SETTING_KEYS.TIMEZONE_DETECTED]
  )
  return {
    currency: resolveCurrencySettings(settings),
    date: (date) => formatDate(date, dateFormat, timezone),
  }
}

/** The settings `sampleFormatFrom` reads, for the page that loads them. */
export const SAMPLE_FORMAT_KEYS = [
  SETTING_KEYS.CURRENCY_CODE,
  SETTING_KEYS.CURRENCY_FORMAT,
  SETTING_KEYS.DATE_FORMAT,
  SETTING_KEYS.TIMEZONE,
  SETTING_KEYS.TIMEZONE_DETECTED,
]

const DEFAULT_SAMPLE_FORMAT = sampleFormatFrom({})

/** The stand-in invoice: what it comes to, what is paid, and when the rest is due. */
const SAMPLE_TOTAL = 1250
const SAMPLE_PAID = 1000
const SAMPLE_DUE = new Date('2026-09-30T12:00:00Z')
/** When the stand-in team invitation runs out. */
const SAMPLE_INVITE_EXPIRES = new Date('2026-09-16T12:00:00Z')

function sampleMoney(format: SampleFormat): (amount: number) => string {
  return (amount) =>
    formatCurrency(amount, format.currency.currencyCode, format.currency.currencyFormat)
}

export function sampleValuesFor(
  kind: EmailKind,
  workshop: WorkshopContext,
  format: SampleFormat = DEFAULT_SAMPLE_FORMAT
): TagValues {
  const money = sampleMoney(format)
  const samples = sampleTagValues({
    total: money(SAMPLE_TOTAL),
    balance_due: money(SAMPLE_TOTAL - SAMPLE_PAID),
    due_date: format.date(SAMPLE_DUE),
    invite_expires: format.date(SAMPLE_INVITE_EXPIRES),
  })
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

export function sampleSummaryRows(
  kind: EmailKind,
  labels: SummaryLabels,
  format: SampleFormat = DEFAULT_SAMPLE_FORMAT
): SummaryRow[] {
  if (!kindSpec(kind).hasSummary) return []
  const money = sampleMoney(format)
  return [
    { key: 'reference', label: labels.reference, value: 'INV-1042' },
    { key: 'vehicle', label: labels.vehicle, value: '2019 Volvo V70' },
    { key: 'total', label: labels.total, value: money(SAMPLE_TOTAL) },
    { key: 'balance', label: labels.balance, value: money(SAMPLE_TOTAL - SAMPLE_PAID) },
    { key: 'due', label: labels.due, value: format.date(SAMPLE_DUE) },
  ]
}

/**
 * A context with the same stand-in data the preview shows, for a test send
 * through the real pipeline.
 */
export function sampleContextFor(
  kind: EmailKind,
  currentUser?: string | null,
  currency: CurrencySettings = DEFAULT_SAMPLE_FORMAT.currency
): EmailContext {
  const base: BaseContext = {
    customerName: TAGS.customer_name.sample,
    vehicle: { year: 2019, make: 'Volvo', model: 'V70', licensePlate: 'AB 12345', mileage: 92000 },
    currentUser: currentUser ?? TAGS.current_user.sample,
    message: TAGS.message.sample,
  }
  switch (kind) {
    case 'portal_signin':
      return { ...base, signinLink: TAGS.signin_link.sample }
    case 'team_invitation':
      return {
        ...base,
        inviteLink: TAGS.invite_link.sample,
        role: TAGS.role.sample,
        expiresAt: SAMPLE_INVITE_EXPIRES,
      }
    case 'message':
      return { ...base, message: TAGS.message.sample, portalLink: TAGS.portal_link.sample }
    default:
      return {
        ...base,
        document: {
          number: TAGS.document_number.sample,
          title: TAGS.document_title.sample,
          total: SAMPLE_TOTAL,
          paid: SAMPLE_PAID,
          dueDate: SAMPLE_DUE,
          currencyCode: currency.currencyCode,
          currencyFormat: currency.currencyFormat,
        },
        shareLink: TAGS.share_link.sample,
      }
  }
}
