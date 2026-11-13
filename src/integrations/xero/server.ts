import { createHash } from 'node:crypto'
import {
  type AccountingCustomer,
  type AccountingInvoice,
  type AccountingPayment,
  CUSTOMER_ENTITY,
  INVOICE_ENTITY,
  PAYMENT_ENTITY,
  invoiceUrl as appInvoiceUrl,
  loadCustomerForAccounting,
  loadInvoiceForAccounting,
  loadInvoicePdfForAccounting,
  loadPaymentForAccounting,
  recordPulledPayment,
  removePulledPayment,
  workshopCurrency,
  workshopDistanceUnit,
} from '@/features/integrations/Lib/accounting-sync'
import { oauthSpec, resolveClient } from '@/features/integrations/Lib/oauth'
import {
  ConnectorHttpError,
  type ConnectorContext,
  type ConnectorServer,
  type JobOutcome,
  type LinkRecord,
} from '@/features/integrations/Lib/types'
import { zonedDayKey } from '@/lib/timezone'
import { manifest } from './manifest'
import {
  API_BASE,
  CONNECTIONS_URL,
  type InvoiceStatus,
  REVOKE_URL,
  STATUS_RANK,
  WALK_IN_NAME,
  type XeroAccount,
  type XeroBrandingTheme,
  type XeroConnection,
  type XeroContact,
  type XeroInvoice,
  type XeroItem,
  type XeroOrganisation,
  type XeroPayment,
  type XeroTrackingCategory,
  buildContact,
  buildInvoice,
  buildPayment,
  checksumOf,
  contactName,
  contactNumber,
  contactUrl,
  defaultDueDate,
  errorMessage,
  invoiceUrl,
  methodAccountKey,
  modifiedSinceHeader,
  parseXeroDate,
  paymentDay,
  referenceFor,
  sameName,
  xeroDayKey,
  round2,
  whereString,
} from './mapping'
import {
  type TaxRateEntry,
  type XeroTaxRate,
  pickTaxedRate,
  pickZeroRate,
  rateLabel,
  salesRates,
} from './tax'

const PROVIDER = 'xero'
/**
 * The lines are built to add up to the printed invoice to the cent, so any
 * difference means Xero changed something: a rate, an amount, its own tax.
 */
const TOTAL_TOLERANCE = 0.005
/** How long the organisation's lists (rates, accounts, items, tracking) are trusted. */
const CATALOG_TTL_MS = 6 * 60 * 60 * 1000
/** A payment waiting for its invoice to be approved in Xero is retried this often, for this long. */
const APPROVAL_RETRY_SECONDS = 60 * 60
const APPROVAL_WAIT_DAYS = 30
const NO_TENANT = 'choose the Xero organisation in the settings'
/** How far a payment may exceed Xero's amount due and still be the same payment, rounded differently. */
const ROUNDING_SLACK = 0.05

class XeroError extends Error {
  status: number
  /** Xero's correlation id for the failed call; their support asks for it. */
  requestId: string | null
  constructor(status: number, body: string, requestId: string | null = null) {
    super(`Xero: ${errorMessage(body)}${requestId ? ` (correlation id ${requestId})` : ''}`)
    this.status = status
    this.requestId = requestId
  }
}

/* ---------- settings and state ---------- */

type ReferenceChoice = 'vehicle' | 'title' | 'invoiceNumber' | 'none'

function settingsOf(ctx: ConnectorContext) {
  const s = ctx.connection.settings
  const str = (k: string) => (typeof s[k] === 'string' && (s[k] as string).trim()) || null
  const startDate = str('startDate')
  const status = str('invoiceStatus')
  const reference = str('reference')
  return {
    tenantId: str('tenantId'),
    pushInvoices: s.pushInvoices !== false,
    pushOnComplete: s.pushOnComplete === true,
    startDate: startDate && /^\d{4}-\d{2}-\d{2}$/.test(startDate) ? startDate : null,
    invoiceStatus: (status === 'DRAFT' || status === 'SUBMITTED'
      ? status
      : 'AUTHORISED') as InvoiceStatus,
    xeroNumbers: s.invoiceNumbers === 'xero',
    reference: (reference === 'title' || reference === 'invoiceNumber' || reference === 'none'
      ? reference
      : 'vehicle') as ReferenceChoice,
    includeVehicle: s.includeVehicle !== false,
    includeNotes: s.includeNotes !== false,
    notesAbove: s.notesPosition === 'above',
    includePartNumbers: s.includePartNumbers !== false,
    brandingThemeId: str('brandingThemeId'),
    laborAccount: str('laborAccount'),
    partsAccount: str('partsAccount'),
    shopFeeAccount: str('shopFeeAccount'),
    laborItem: str('laborItem'),
    partsItem: str('partsItem'),
    matchItemsByPartNumber: s.matchItemsByPartNumber === true,
    billedTax: s.taxAmounts !== 'xero',
    taxType: str('taxType'),
    zeroTaxType: str('zeroTaxType'),
    tracking: [str('tracking1'), str('tracking2')].filter((v): v is string => Boolean(v)),
    sendFromXero: s.sendFromXero === true,
    markAsSent: s.markAsSent !== false,
    attachPdf: s.attachPdf !== false,
    updateContacts: s.updateContacts !== false,
    /** Use a contact found by email even when its name is another. */
    reuseByEmail: s.sameEmail === 'reuse',
    voidOnDelete: s.voidOnDelete !== false,
    pushPayments: s.pushPayments !== false,
    paymentAccount: str('paymentAccount'),
    methodAccounts: {
      cashAccount: str('cashAccount'),
      cardAccount: str('cardAccount'),
      transferAccount: str('transferAccount'),
      onlineAccount: str('onlineAccount'),
    },
    manualPaidAsPayment: s.manualPaidAsPayment === true,
    pullPayments: s.pullPayments !== false,
  }
}

type Settings = ReturnType<typeof settingsOf>

interface OrgInfo {
  tenantId: string
  fetchedAt: string
  name: string
  shortCode: string | null
  baseCurrency: string | null
  countryCode: string | null
  paysTax: boolean
  paymentTerms: XeroOrganisation['PaymentTerms'] | null
  /** PARTNER organisations cannot invoice at all. */
  edition: string | null
}

/** The organisation's lists, read at most every few hours, for one tenant. */
interface Catalog {
  tenantId: string
  fetchedAt: string
  rates: TaxRateEntry[]
  defaultSalesAccount: string | null
  bankAccountId: string | null
  /** Items that can be sold, with their own sales account when they have one. */
  items: { code: string; salesAccount: string | null }[]
  tracking: { id: string; name: string; categoryId: string; categoryName: string }[]
}

interface State {
  org: OrgInfo | null
  catalog: Catalog | null
  walkIn: { tenantId: string; contactId: string } | null
  lastPull: { tenantId: string; at: string } | null
}

function stateOf(ctx: ConnectorContext): State {
  const s = ctx.connection.state
  const obj = (v: unknown) => (typeof v === 'object' && v !== null ? v : null)
  return {
    org: obj(s.org) as OrgInfo | null,
    catalog: obj(s.catalog) as Catalog | null,
    walkIn: obj(s.walkIn) as State['walkIn'],
    lastPull: obj(s.lastPull) as State['lastPull'],
  }
}

function fresh(at: string | undefined): boolean {
  const t = at ? Date.parse(at) : Number.NaN
  return Number.isFinite(t) && Date.now() - t < CATALOG_TTL_MS
}

/* ---------- calls ---------- */

interface CallInit {
  method?: string
  body?: unknown
  query?: Record<string, string>
  headers?: Record<string, string>
}

/**
 * One call to the Accounting API for the chosen organisation. Every call
 * names the tenant in a header; Xero answers JSON when asked, and puts its
 * reasons in a validation body that the error carries to the log.
 */
async function api<T>(ctx: ConnectorContext, path: string, init: CallInit = {}): Promise<T> {
  const tenantId = settingsOf(ctx).tenantId
  if (!tenantId) throw new Error(`No Xero organisation chosen; ${NO_TENANT}`)
  const url = new URL(`${API_BASE}/${path}`)
  for (const [k, v] of Object.entries(init.query ?? {})) url.searchParams.set(k, v)
  try {
    return await ctx.http.json<T>(url.toString(), {
      method: init.method ?? (init.body !== undefined ? 'POST' : 'GET'),
      headers: { Accept: 'application/json', 'xero-tenant-id': tenantId, ...init.headers },
      ...(init.body !== undefined && { body: JSON.stringify(init.body) }),
    })
  } catch (err) {
    if (err instanceof ConnectorHttpError) throw new XeroError(err.status, err.body, err.requestId)
    throw err
  }
}

function isNotFound(err: unknown): boolean {
  return err instanceof XeroError && err.status === 404
}

async function connectionsOf(ctx: ConnectorContext): Promise<XeroConnection[]> {
  try {
    const list = await ctx.http.json<XeroConnection[]>(CONNECTIONS_URL, {
      headers: { Accept: 'application/json' },
    })
    return (Array.isArray(list) ? list : []).filter(
      (c) => !c.tenantType || c.tenantType === 'ORGANISATION'
    )
  } catch (err) {
    if (err instanceof ConnectorHttpError) throw new XeroError(err.status, err.body, err.requestId)
    throw err
  }
}

/** Every page of a list endpoint. Xero pages by number and returns fewer than a page at the end. */
async function listAll<T>(
  ctx: ConnectorContext,
  path: string,
  key: string,
  init: CallInit = {},
  pageSize = 100
): Promise<T[]> {
  const out: T[] = []
  for (let page = 1; page <= 100; page++) {
    const res = await api<Record<string, T[] | undefined>>(ctx, path, {
      ...init,
      query: { ...init.query, page: String(page), pageSize: String(pageSize) },
    })
    const rows = res[key] ?? []
    out.push(...rows)
    if (rows.length < pageSize) break
  }
  return out
}

/* ---------- organisation and lists ---------- */

async function loadOrg(ctx: ConnectorContext, opts: { refresh?: boolean } = {}): Promise<OrgInfo> {
  const tenantId = settingsOf(ctx).tenantId
  if (!tenantId) throw new Error(`No Xero organisation chosen; ${NO_TENANT}`)
  const cached = stateOf(ctx).org
  if (!opts.refresh && cached?.tenantId === tenantId && fresh(cached.fetchedAt)) return cached
  const res = await api<{ Organisations?: XeroOrganisation[] }>(ctx, 'Organisation')
  const o = res.Organisations?.[0] ?? {}
  const org: OrgInfo = {
    tenantId,
    fetchedAt: new Date().toISOString(),
    name: o.Name ?? o.LegalName ?? 'Xero',
    shortCode: o.ShortCode ?? null,
    baseCurrency: o.BaseCurrency ?? null,
    countryCode: o.CountryCode ?? null,
    // Absent on older answers: assume registered, which only adds tax codes.
    paysTax: o.PaysTax !== false,
    paymentTerms: o.PaymentTerms ?? null,
    edition: (o as { Edition?: string }).Edition ?? null,
  }
  await ctx.saveState({ org })
  return org
}

async function loadCatalog(
  ctx: ConnectorContext,
  opts: { refresh?: boolean } = {}
): Promise<Catalog> {
  const tenantId = settingsOf(ctx).tenantId
  if (!tenantId) throw new Error(`No Xero organisation chosen; ${NO_TENANT}`)
  const cached = stateOf(ctx).catalog
  if (
    !opts.refresh &&
    cached?.tenantId === tenantId &&
    fresh(cached.fetchedAt) &&
    Array.isArray(cached.items)
  ) {
    return cached
  }
  const [rates, accounts, items, tracking] = await Promise.all([
    api<{ TaxRates?: XeroTaxRate[] }>(ctx, 'TaxRates'),
    api<{ Accounts?: XeroAccount[] }>(ctx, 'Accounts'),
    api<{ Items?: XeroItem[] }>(ctx, 'Items'),
    api<{ TrackingCategories?: XeroTrackingCategory[] }>(ctx, 'TrackingCategories'),
  ])
  const active = (accounts.Accounts ?? []).filter((a) => !a.Status || a.Status === 'ACTIVE')
  const revenue = active.filter((a) => a.Class === 'REVENUE' && a.Code)
  // Xero's own charts call it Sales, code 200 in most; any revenue account will do after that.
  const sales =
    revenue.find((a) => a.Code === '200') ??
    revenue.find((a) => a.Type === 'SALES' || /^sales$/i.test(a.Name ?? '')) ??
    revenue[0] ??
    null
  const bank = active.find((a) => a.Type === 'BANK') ?? null
  const catalog: Catalog = {
    tenantId,
    fetchedAt: new Date().toISOString(),
    rates: salesRates(rates.TaxRates ?? []),
    defaultSalesAccount: sales?.Code ?? null,
    bankAccountId: bank?.AccountID ?? null,
    items: (items.Items ?? [])
      .filter((i) => i.IsSold !== false)
      .map((i) => ({ code: i.Code, salesAccount: i.SalesDetails?.AccountCode ?? null })),
    tracking: (tracking.TrackingCategories ?? [])
      .filter((c) => !c.Status || c.Status === 'ACTIVE')
      .flatMap((c) =>
        (c.Options ?? [])
          .filter((o) => !o.Status || o.Status === 'ACTIVE')
          .map((o) => ({
            id: o.TrackingOptionID,
            name: o.Name,
            categoryId: c.TrackingCategoryID,
            categoryName: c.Name,
          }))
      ),
  }
  await ctx.saveState({ catalog })
  return catalog
}

/* ---------- links, scoped to the organisation ---------- */

/** A link counts only for the organisation it was made in; switching organisation starts afresh. */
async function linkFor(
  ctx: ConnectorContext,
  entityType: string,
  entityId: string
): Promise<LinkRecord | null> {
  const link = await ctx.links.get(entityType, entityId)
  if (!link) return null
  return link.metadata?.tenantId === settingsOf(ctx).tenantId ? link : null
}

async function setLink(
  ctx: ConnectorContext,
  entityType: string,
  entityId: string,
  link: { remoteId: string; remoteUrl?: string | null; checksum?: string | null },
  metadata: Record<string, unknown> = {}
): Promise<void> {
  await ctx.links.set(entityType, entityId, {
    remoteId: link.remoteId,
    remoteUrl: link.remoteUrl ?? null,
    checksum: link.checksum ?? null,
    metadata: { ...metadata, tenantId: settingsOf(ctx).tenantId },
  })
}

async function patchLink(
  ctx: ConnectorContext,
  entityType: string,
  entityId: string,
  link: LinkRecord,
  patch: Record<string, unknown>
): Promise<void> {
  await ctx.links.set(entityType, entityId, {
    remoteId: link.remoteId,
    remoteUrl: link.remoteUrl,
    checksum: link.checksum,
    metadata: { ...(link.metadata ?? {}), ...patch },
  })
}

/* ---------- contacts ---------- */

async function findContact(ctx: ConnectorContext, where: string): Promise<XeroContact | null> {
  const res = await api<{ Contacts?: XeroContact[] }>(ctx, 'Contacts', {
    query: { where, summaryOnly: 'true' },
  })
  return (res.Contacts ?? []).find((c) => c.ContactStatus !== 'ARCHIVED') ?? null
}

/**
 * Every live contact a where-clause finds, in full: the summary form leaves
 * out the first and last name, which matching by name needs.
 */
async function findContacts(ctx: ConnectorContext, where: string): Promise<XeroContact[]> {
  const res = await api<{ Contacts?: XeroContact[] }>(ctx, 'Contacts', { query: { where } })
  return (res.Contacts ?? []).filter((c) => c.ContactStatus !== 'ARCHIVED')
}

/** A contact made here before, by the code this app gave it; Xero looks that up by path. */
async function contactByNumber(ctx: ConnectorContext, number: string): Promise<XeroContact | null> {
  try {
    const res = await api<{ Contacts?: XeroContact[] }>(
      ctx,
      `Contacts/${encodeURIComponent(number)}`
    )
    const found = res.Contacts?.[0]
    return found && found.ContactStatus !== 'ARCHIVED' ? found : null
  } catch (err) {
    if (isNotFound(err)) return null
    throw err
  }
}

async function walkInContact(ctx: ConnectorContext): Promise<string> {
  const tenantId = settingsOf(ctx).tenantId
  const cached = stateOf(ctx).walkIn
  if (cached && cached.tenantId === tenantId) return cached.contactId
  let contact = await findContact(ctx, `Name==${whereString(WALK_IN_NAME)}`)
  if (!contact) {
    const res = await api<{ Contacts?: XeroContact[] }>(ctx, 'Contacts', {
      method: 'PUT',
      query: { summarizeErrors: 'true' },
      body: { Contacts: [{ Name: WALK_IN_NAME }] },
    })
    contact = res.Contacts?.[0] ?? null
  }
  if (!contact) throw new Error('Xero did not return the walk-in contact')
  await ctx.saveState({ walkIn: { tenantId, contactId: contact.ContactID } })
  return contact.ContactID
}

function isDuplicateName(err: unknown): boolean {
  return (
    err instanceof XeroError && err.status === 400 && /already (exists|assigned)/i.test(err.message)
  )
}

async function createContact(ctx: ConnectorContext, c: AccountingCustomer): Promise<XeroContact> {
  const name = contactName(c)
  const put = async (body: Record<string, unknown>) => {
    const res = await api<{ Contacts?: XeroContact[] }>(ctx, 'Contacts', {
      method: 'PUT',
      query: { summarizeErrors: 'true' },
      body: { Contacts: [body] },
    })
    const made = res.Contacts?.[0]
    if (!made) throw new Error('Xero did not return the new contact')
    return made
  }
  try {
    return await put(buildContact(c, name))
  } catch (err) {
    if (!isDuplicateName(err)) throw err
    // Xero keeps names unique; the customer number tells two of the same name apart.
    const suffix = c.customerNumber ?? c.id.slice(-4)
    return put(buildContact(c, `${name} (${suffix})`.slice(0, 255)))
  }
}

/**
 * A link to a contact that was already in Xero, made before a shared email
 * stopped being enough, is checked once: when the contact is neither one this
 * app made nor one with the customer's name, it was another customer behind
 * the same address, and the link is dropped so the customer gets its own.
 */
async function verifiedLink(
  ctx: ConnectorContext,
  c: AccountingCustomer,
  link: LinkRecord
): Promise<LinkRecord | null> {
  if (link.metadata?.reused !== true || link.metadata?.verified === true) return link
  const settings = settingsOf(ctx)
  let contact: XeroContact | null = null
  if (!settings.reuseByEmail) {
    try {
      const res = await api<{ Contacts?: XeroContact[] }>(ctx, `Contacts/${link.remoteId}`)
      contact = res.Contacts?.[0] ?? null
    } catch (err) {
      if (!isNotFound(err)) throw err
    }
    if (!contact) {
      await ctx.links.remove(CUSTOMER_ENTITY, c.id)
      return null
    }
    if (contact.ContactNumber !== contactNumber(c) && !sameName(c, contact)) {
      await ctx.links.remove(CUSTOMER_ENTITY, c.id)
      await ctx.log(
        'warn',
        `Customer ${c.name} was linked to the Xero contact "${contact.Name ?? link.remoteId}" because they share an email address, but the names differ; the customer now gets a contact of its own, and its unpaid invoices move to it when next sent.`
      )
      return null
    }
  }
  const next = { ...link, metadata: { ...(link.metadata ?? {}), verified: true } }
  await ctx.links.set(CUSTOMER_ENTITY, c.id, next)
  return next
}

/**
 * The Xero contact for a customer, made or updated as needed. A contact
 * already in Xero is found by the number this app gives its contacts, then
 * by email, then by name, so a bookkeeper's existing contact is reused
 * rather than doubled. An email address can be shared by several customers,
 * so a contact found by email is used only when its name agrees too, unless
 * the workshop chose to trust email alone; otherwise the customer gets a new
 * contact and the log names the one that shares the address.
 */
async function ensureContact(
  ctx: ConnectorContext,
  c: AccountingCustomer | null
): Promise<{ id: string; email: string | null; taxExempt: boolean }> {
  if (!c) return { id: await walkInContact(ctx), email: null, taxExempt: false }
  const settings = settingsOf(ctx)
  const org = await loadOrg(ctx)
  const name = contactName(c)
  const checksum = checksumOf(buildContact(c, name))
  const found = await linkFor(ctx, CUSTOMER_ENTITY, c.id)
  const link = found ? await verifiedLink(ctx, c, found) : null
  const result = (id: string) => ({ id, email: c.email, taxExempt: c.taxExempt })
  if (link) {
    if (link.checksum === checksum || !settings.updateContacts) return result(link.remoteId)
    try {
      await updateContact(ctx, link.remoteId, c, name)
      await setLink(ctx, CUSTOMER_ENTITY, c.id, {
        remoteId: link.remoteId,
        remoteUrl: contactUrl(org.shortCode, link.remoteId),
        checksum,
      })
      return result(link.remoteId)
    } catch (err) {
      if (!isNotFound(err)) throw err
      await ctx.links.remove(CUSTOMER_ENTITY, c.id)
    }
  }
  const email = c.email?.trim()
  let existing = await contactByNumber(ctx, contactNumber(c))
  let sharesEmail: XeroContact | null = null
  if (!existing && email) {
    const withEmail = await findContacts(ctx, `EmailAddress==${whereString(email)}`)
    existing =
      withEmail.find((x) => sameName(c, x)) ??
      (settings.reuseByEmail ? (withEmail[0] ?? null) : null)
    if (!existing) sharesEmail = withEmail[0] ?? null
  }
  existing ??= await findContact(ctx, `Name==${whereString(name)}`)
  const remote = existing ?? (await createContact(ctx, c))
  if (!existing && sharesEmail) {
    await ctx.log(
      'warn',
      `Customer ${c.name} got a new Xero contact, "${remote.Name ?? name}": the contact "${sharesEmail.Name ?? sharesEmail.ContactID}" has the same email address but another name. If they are the same customer, merge the two contacts in Xero, or choose to use the existing contact under "Customers with the same email" in the integration settings.`
    )
  }
  await setLink(
    ctx,
    CUSTOMER_ENTITY,
    c.id,
    {
      remoteId: remote.ContactID,
      remoteUrl: contactUrl(org.shortCode, remote.ContactID),
      checksum,
    },
    { reused: Boolean(existing), verified: true }
  )
  return result(remote.ContactID)
}

/** Copies the customer's details over. A name another contact already holds stays as it was. */
async function updateContact(
  ctx: ConnectorContext,
  contactId: string,
  c: AccountingCustomer,
  name: string
): Promise<void> {
  const body: Record<string, unknown> = { ...buildContact(c, name), ContactID: contactId }
  try {
    await api(ctx, `Contacts/${contactId}`, { body: { Contacts: [body] } })
  } catch (err) {
    if (!isDuplicateName(err)) throw err
    const { Name: _name, ...rest } = body
    await api(ctx, `Contacts/${contactId}`, { body: { Contacts: [rest] } })
  }
}

/* ---------- tax ---------- */

interface ResolvedTax {
  registered: boolean
  taxType: string | null
  zeroTaxType: string | null
  note: string | null
}

async function resolveTax(
  ctx: ConnectorContext,
  inv: AccountingInvoice,
  org: OrgInfo,
  taxExempt: boolean
): Promise<ResolvedTax> {
  const settings = settingsOf(ctx)
  if (!org.paysTax) {
    return {
      registered: false,
      taxType: null,
      zeroTaxType: null,
      note:
        inv.taxAmount > 0
          ? `The Xero organisation is not registered for tax, so invoice ${inv.invoiceNumber} went over without its ${round2(inv.taxAmount)} tax. Turn on tax in Xero's financial settings if it should carry it.`
          : null,
    }
  }
  let catalog = await loadCatalog(ctx)
  const zero = pickZeroRate(catalog.rates, settings.zeroTaxType)
  const taxed = inv.taxRate > 0 && !taxExempt
  if (!taxed)
    return { registered: true, taxType: null, zeroTaxType: zero?.taxType ?? null, note: null }
  let pick = pickTaxedRate(catalog.rates, inv.taxRate, settings.taxType)
  if (!pick.matched && !settings.taxType) {
    // The rate may be new in Xero since the list was read.
    catalog = await loadCatalog(ctx, { refresh: true })
    pick = pickTaxedRate(catalog.rates, inv.taxRate, settings.taxType)
  }
  let note: string | null = null
  if (!pick.matched) {
    note = pick.entry
      ? `Invoice ${inv.invoiceNumber} charges ${inv.taxRate}% but was booked under "${pick.entry.name}" (${pick.entry.percent}%), the tax rate chosen in the integration settings.`
      : `No Xero tax rate carries ${inv.taxRate}%, so invoice ${inv.invoiceNumber} went over without one and Xero used each account's default. Add a ${inv.taxRate}% rate in Xero or choose one in the integration settings.`
  }
  return {
    registered: true,
    taxType: pick.entry?.taxType ?? null,
    zeroTaxType: zero?.taxType ?? null,
    note,
  }
}

/* ---------- invoices ---------- */

/** Why the invoice stays out of Xero, or null when it goes. */
function whyNotEligible(inv: AccountingInvoice, s: Settings, tz: string): string | null {
  if (!s.pushInvoices) return 'invoice push switched off'
  if (!inv.invoiceNumber) return 'no invoice number'
  const issued = Boolean(inv.issuedAt) || (s.pushOnComplete && inv.status === 'completed')
  if (!issued) return 'not issued yet'
  if (s.startDate && zonedDayKey(inv.invoiceDate, tz) < s.startDate) {
    return 'dated before the start date'
  }
  return null
}

/**
 * The currency to put on the invoice: none when the workshop bills in the
 * organisation's own currency, which is Xero's default. Another currency is
 * sent as it is; Xero accepts it when the organisation has multi-currency
 * and that currency added, and says so when it has not.
 */
async function currencyFor(ctx: ConnectorContext, org: OrgInfo): Promise<string | null> {
  const ours = await workshopCurrency(ctx.connection.organizationId)
  if (!ours || !org.baseCurrency || ours === org.baseCurrency) return null
  return ours
}

async function readInvoice(ctx: ConnectorContext, invoiceId: string): Promise<XeroInvoice> {
  const res = await api<{ Invoices?: XeroInvoice[] }>(ctx, `Invoices/${invoiceId}`)
  const inv = res.Invoices?.[0]
  if (!inv) throw new XeroError(404, '{"Message":"Invoice not found"}')
  return inv
}

function isGone(inv: XeroInvoice): boolean {
  return inv.Status === 'VOIDED' || inv.Status === 'DELETED'
}

/** The invoice's number belongs to one voided or deleted in Xero, which Xero never gives out again. */
class NumberTaken extends Error {
  invoice: XeroInvoice
  constructor(invoice: XeroInvoice) {
    super(
      `Invoice number ${invoice.InvoiceNumber} is taken by a ${invoice.Status?.toLowerCase()} invoice in Xero`
    )
    this.invoice = invoice
  }
}

/**
 * An invoice voided or deleted in Xero cannot come back under its number.
 * With Torqvoice numbers it is left out, and the link remembers that so later
 * edits are skipped without failing; given a new number here, it is sent as
 * a new invoice. With Xero numbering it simply goes over again as new.
 */
async function markGone(
  ctx: ConnectorContext,
  inv: AccountingInvoice,
  remote: XeroInvoice
): Promise<JobOutcome> {
  const status = (remote.Status ?? 'voided').toLowerCase()
  await setLink(
    ctx,
    INVOICE_ENTITY,
    inv.id,
    { remoteId: remote.InvoiceID, remoteUrl: null, checksum: null },
    { goneInXero: status, invoiceNumber: inv.invoiceNumber }
  )
  await ctx.log(
    'warn',
    `Invoice ${inv.invoiceNumber} was ${status} in Xero, and Xero does not give its number out again, so edits here are not sent. Give the invoice a new number in Torqvoice to send it as a new invoice.`
  )
  return { summary: `invoice ${inv.invoiceNumber} ${status} in Xero; not sent again` }
}

function hasMoney(inv: XeroInvoice): boolean {
  return (inv.AmountPaid ?? 0) > 0 || (inv.Payments?.length ?? 0) > 0 || inv.Status === 'PAID'
}

/** The record is gone here: void or delete Xero's copy unless money was taken against it. */
async function retireInvoice(ctx: ConnectorContext, serviceRecordId: string): Promise<JobOutcome> {
  const settings = settingsOf(ctx)
  const link = await linkFor(ctx, INVOICE_ENTITY, serviceRecordId)
  if (!link) return { summary: 'nothing to do' }
  if (!settings.voidOnDelete) {
    await ctx.links.remove(INVOICE_ENTITY, serviceRecordId)
    return { summary: 'left in Xero, voiding switched off' }
  }
  try {
    const current = await readInvoice(ctx, link.remoteId)
    const label = current.InvoiceNumber ?? current.InvoiceID
    if (current.Status === 'VOIDED' || current.Status === 'DELETED') {
      await ctx.links.remove(INVOICE_ENTITY, serviceRecordId)
      return { summary: `invoice ${label} already ${current.Status.toLowerCase()} in Xero` }
    }
    if (hasMoney(current)) {
      await ctx.log(
        'warn',
        `Invoice ${label} was deleted here but has payments in Xero; left as is`
      )
      await ctx.links.remove(INVOICE_ENTITY, serviceRecordId)
      return { summary: 'left in Xero, has payments' }
    }
    // A draft or one awaiting approval is deleted; an approved one can only be voided.
    const status = current.Status === 'AUTHORISED' ? 'VOIDED' : 'DELETED'
    await api(ctx, `Invoices/${current.InvoiceID}`, {
      body: { Invoices: [{ InvoiceID: current.InvoiceID, Status: status }] },
    })
    await ctx.links.remove(INVOICE_ENTITY, serviceRecordId)
    return { summary: `invoice ${label} ${status.toLowerCase()} in Xero` }
  } catch (err) {
    if (!isNotFound(err)) throw err
    await ctx.links.remove(INVOICE_ENTITY, serviceRecordId)
    return { summary: 'already gone from Xero' }
  }
}

/** The tracking options chosen, as Xero names them on a line; at most one per category. */
function trackingFor(catalog: Catalog, chosen: string[]): { Name: string; Option: string }[] {
  const out: { Name: string; Option: string }[] = []
  const seen = new Set<string>()
  for (const value of chosen) {
    const optionId = value.includes(':') ? value.split(':')[1] : value
    const option = catalog.tracking.find((t) => t.id === optionId)
    if (!option || seen.has(option.categoryId)) continue
    seen.add(option.categoryId)
    out.push({ Name: option.categoryName, Option: option.name })
  }
  return out
}

async function buildBody(
  ctx: ConnectorContext,
  inv: AccountingInvoice,
  contact: { id: string; taxExempt: boolean },
  org: OrgInfo
): Promise<{ body: Record<string, unknown>; note: string | null }> {
  const settings = settingsOf(ctx)
  const tax = await resolveTax(ctx, inv, org, contact.taxExempt)
  const catalog = await loadCatalog(ctx)
  const fallback = catalog.defaultSalesAccount
  if (!fallback && !(settings.laborAccount && settings.partsAccount)) {
    throw new Error(
      'The Xero organisation has no sales account to book to; choose the accounts in the integration settings'
    )
  }
  const invoiceDay = zonedDayKey(inv.invoiceDate, ctx.timezone)
  const body = buildInvoice(inv, {
    contactId: contact.id,
    status: settings.invoiceStatus,
    invoiceNumber: settings.xeroNumbers ? null : inv.invoiceNumber,
    reference: referenceFor(inv, settings.reference),
    dueDate: inv.dueDate
      ? zonedDayKey(inv.dueDate, ctx.timezone)
      : defaultDueDate(invoiceDay, org.paymentTerms ?? undefined),
    brandingThemeId: settings.brandingThemeId,
    currency: await currencyFor(ctx, org),
    timezone: ctx.timezone,
    url: appInvoiceUrl(ctx.appUrl, inv),
    includeVehicle: settings.includeVehicle,
    includeNotes: settings.includeNotes,
    notesAbove: settings.notesAbove,
    includePartNumbers: settings.includePartNumbers,
    distanceUnit: await workshopDistanceUnit(ctx.connection.organizationId),
    accounts: {
      labor: settings.laborAccount,
      parts: settings.partsAccount,
      shopFee: settings.shopFeeAccount,
      fallback: fallback ?? settings.laborAccount ?? '',
    },
    items: { labor: settings.laborItem, parts: settings.partsItem },
    partItemCodes: new Set(settings.matchItemsByPartNumber ? catalog.items.map((i) => i.code) : []),
    itemAccounts: new Map(
      catalog.items.flatMap((i) => (i.salesAccount ? [[i.code, i.salesAccount] as const] : []))
    ),
    registeredForTax: tax.registered,
    taxType: tax.taxType,
    zeroTaxType: tax.zeroTaxType,
    billedTax: settings.billedTax,
    taxExempt: contact.taxExempt,
    tracking: trackingFor(catalog, settings.tracking),
    sentToContact: settings.markAsSent && !settings.sendFromXero,
  })
  return { body, note: tax.note }
}

/**
 * A new invoice in Xero. When the Torqvoice number is used and Xero already
 * has an invoice of that number that links back to this job, an earlier
 * push lost its link and that invoice is adopted instead of doubled.
 */
async function createInvoice(
  ctx: ConnectorContext,
  body: Record<string, unknown>,
  inv: AccountingInvoice,
  checksum: string
): Promise<{ invoice: XeroInvoice; adopted: boolean }> {
  const number = typeof body.InvoiceNumber === 'string' ? body.InvoiceNumber : null
  if (number) {
    const found = await api<{ Invoices?: XeroInvoice[] }>(ctx, 'Invoices', {
      query: { InvoiceNumbers: number, summaryOnly: 'true' },
    })
    const sales = (found.Invoices ?? []).filter((i) => i.Type === 'ACCREC')
    const live = sales.filter((i) => !isGone(i))
    // Xero keeps a voided or deleted invoice's number taken for good.
    const gone = sales.find(isGone)
    if (!live.length && gone) throw new NumberTaken(gone)
    if (live.length) {
      const full = (await readInvoice(ctx, live[0].InvoiceID)) as XeroInvoice & { Url?: string }
      // Ours when it links back to this job, or, without a link to compare,
      // when it is for the same customer on the same day.
      const ours = body.Url
        ? full.Url === body.Url
        : full.Contact?.ContactID === (body.Contact as { ContactID?: string }).ContactID &&
          zonedDayKey(parseXeroDate(full.Date) ?? new Date(0), 'UTC') === body.Date
      if (ours) {
        await ctx.log('info', `Invoice ${number} was already in Xero; linked to it`)
        await relinkPayments(ctx, inv, full)
        return {
          invoice: hasMoney(full) ? full : await saveInvoice(ctx, full, body),
          adopted: true,
        }
      }
      // Xero keeps sales invoice numbers unique and would refuse a second one.
      throw new Error(
        `Xero already has an invoice numbered ${number} that did not come from Torqvoice, so invoice ${inv.invoiceNumber} cannot be added under that number. Renumber one of them, or choose "Let Xero number them" in the integration settings.`
      )
    }
  }
  const res = await api<{ Invoices?: XeroInvoice[] }>(ctx, 'Invoices', {
    method: 'PUT',
    // Summarised, a refused invoice is a 400 with Xero's reasons, never a 200.
    query: { unitdp: '4', summarizeErrors: 'true' },
    // A retry after a lost answer must not make a second invoice.
    headers: { 'Idempotency-Key': `tv-${inv.id}-${checksum.slice(0, 24)}` },
    body: { Invoices: [body] },
  })
  const made = res.Invoices?.[0]
  if (!made) throw new Error('Xero did not return the new invoice')
  return { invoice: made, adopted: false }
}

/**
 * After a lost link (a reconnect forgets what was sent), the payments Xero
 * already holds for an invoice found again are linked to the ones here by
 * amount and day, so they are not recorded a second time. A payment that
 * came from Xero is known by its own id.
 */
async function relinkPayments(
  ctx: ConnectorContext,
  inv: AccountingInvoice,
  remote: XeroInvoice
): Promise<void> {
  const theirs = (remote.Payments ?? []).filter((x) => x.Status !== 'DELETED')
  const taken = new Set<string>()
  for (const p of inv.payments) {
    if (await linkFor(ctx, PAYMENT_ENTITY, p.id)) continue
    const fromXero = p.provider === PROVIDER && p.externalId
    const day = zonedDayKey(p.date, ctx.timezone)
    const match = fromXero
      ? theirs.find((x) => x.PaymentID === p.externalId)
      : theirs.find(
          (x) =>
            !taken.has(x.PaymentID) &&
            Math.abs((x.Amount ?? 0) - round2(p.amount)) <= ROUNDING_SLACK &&
            xeroDayKey(x.Date) === day
        )
    if (!match) continue
    taken.add(match.PaymentID)
    await setLink(
      ctx,
      PAYMENT_ENTITY,
      p.id,
      { remoteId: match.PaymentID },
      { createdByUs: !fromXero, serviceRecordId: inv.id, relinked: true }
    )
  }
}

/**
 * Writes our body over an invoice Xero still lets us change. An update never
 * moves it back in approval: a draft someone approved in Xero stays approved.
 */
async function saveInvoice(
  ctx: ConnectorContext,
  current: XeroInvoice,
  body: Record<string, unknown>
): Promise<XeroInvoice> {
  const ours = STATUS_RANK[String(body.Status)] ?? 0
  const theirs = STATUS_RANK[current.Status ?? ''] ?? 0
  const next: Record<string, unknown> = { ...body, InvoiceID: current.InvoiceID }
  if (theirs > ours) next.Status = current.Status
  // An invoice Xero numbered keeps its number.
  if (!body.InvoiceNumber) delete next.InvoiceNumber
  const res = await api<{ Invoices?: XeroInvoice[] }>(ctx, `Invoices/${current.InvoiceID}`, {
    query: { unitdp: '4' },
    body: { Invoices: [next] },
  })
  return res.Invoices?.[0] ?? current
}

async function pushInvoice(ctx: ConnectorContext, serviceRecordId: string): Promise<JobOutcome> {
  const settings = settingsOf(ctx)
  if (!settings.tenantId) return { summary: NO_TENANT }
  const inv = await loadInvoiceForAccounting(ctx.connection.organizationId, serviceRecordId)
  if (!inv) return retireInvoice(ctx, serviceRecordId)
  const skip = whyNotEligible(inv, settings, ctx.timezone)
  if (skip) return { summary: skip }

  const org = await loadOrg(ctx)
  const contact = await ensureContact(ctx, inv.customer)
  const { body, note } = await buildBody(ctx, inv, contact, org)
  const checksum = checksumOf(body)
  let link = await linkFor(ctx, INVOICE_ENTITY, serviceRecordId)
  if (link?.metadata?.goneInXero) {
    if (!settings.xeroNumbers && link.metadata.invoiceNumber === inv.invoiceNumber) {
      return {
        summary: `invoice ${inv.invoiceNumber} ${link.metadata.goneInXero} in Xero; not sent again`,
      }
    }
    // Renumbered here, or numbered by Xero: it goes over as a new invoice.
    await ctx.links.remove(INVOICE_ENTITY, serviceRecordId)
    link = null
  }

  let saved: XeroInvoice | null = null
  let action = 'unchanged'
  if (!link || link.checksum !== checksum) {
    if (note) await ctx.log('warn', note)
    if (link) {
      try {
        const current = await readInvoice(ctx, link.remoteId)
        if (isGone(current)) {
          // Gone in Xero: with Xero numbering a new one is made below; under
          // the same Torqvoice number Xero would refuse it.
          if (!settings.xeroNumbers) return markGone(ctx, inv, current)
          await ctx.links.remove(INVOICE_ENTITY, serviceRecordId)
          link = null
        } else if (hasMoney(current)) {
          saved = current
          action = await settledDifference(ctx, inv, current, link, checksum)
        } else {
          saved = await saveInvoice(ctx, current, body)
          action = 'updated'
        }
      } catch (err) {
        if (!isNotFound(err)) throw err
        await ctx.links.remove(INVOICE_ENTITY, serviceRecordId)
        link = null
      }
    }
    if (!link) {
      try {
        const made = await createInvoice(ctx, body, inv, checksum)
        saved = made.invoice
        action = made.adopted ? 'found in Xero and linked again' : 'created'
      } catch (err) {
        if (err instanceof NumberTaken) return markGone(ctx, inv, err.invoice)
        throw err
      }
    }
    if (saved && action !== 'left as paid') {
      await setLink(
        ctx,
        INVOICE_ENTITY,
        serviceRecordId,
        {
          remoteId: saved.InvoiceID,
          remoteUrl: invoiceUrl(org.shortCode, saved.InvoiceID),
          checksum,
        },
        {
          invoiceNumber: saved.InvoiceNumber ?? null,
          contactId: contact.id,
          // The PDF changed with the invoice; the same file name overwrites the old one in Xero.
          attached: false,
          emailed: link?.metadata?.emailed ?? false,
        }
      )
      checkTotals(ctx, inv, saved, settings, org)
    }
  }

  link = await linkFor(ctx, INVOICE_ENTITY, serviceRecordId)
  if (link) {
    if (settings.attachPdf && link.metadata?.attached !== true) {
      if (await attachPdf(ctx, link.remoteId, inv)) {
        await patchLink(ctx, INVOICE_ENTITY, serviceRecordId, link, { attached: true })
        link = await linkFor(ctx, INVOICE_ENTITY, serviceRecordId)
      }
    }
    if (link && settings.sendFromXero && link.metadata?.emailed !== true) {
      if (await emailFromXero(ctx, link.remoteId, inv, contact.email)) {
        await patchLink(ctx, INVOICE_ENTITY, serviceRecordId, link, { emailed: true })
      }
    }
  }

  let paymentsPushed = 0
  let waiting = false
  if (settings.pushPayments && link) {
    const pushed = await pushPendingPayments(ctx, inv, link.remoteId)
    paymentsPushed = pushed.count
    waiting = pushed.waitingForApproval
  }
  const summary = `invoice ${inv.invoiceNumber} ${action}`
  const extra = [
    paymentsPushed ? `${paymentsPushed} payments recorded` : null,
    waiting ? 'payments wait for approval in Xero' : null,
  ].filter(Boolean)
  return { summary: extra.length ? `${summary}, ${extra.join(', ')}` : summary }
}

/**
 * The invoice changed here after money was taken against it in Xero, which
 * Xero no longer lets anyone edit. When Xero already holds the same total
 * and customer, only the checksum moved (a setting such as an account
 * changed) and it is refreshed quietly; otherwise the workshop hears once.
 */
async function settledDifference(
  ctx: ConnectorContext,
  inv: AccountingInvoice,
  current: XeroInvoice,
  link: LinkRecord,
  checksum: string
): Promise<string> {
  const sameTotal = Math.abs((current.Total ?? 0) - inv.totalAmount) <= TOTAL_TOLERANCE
  if (sameTotal) {
    await ctx.links.set(INVOICE_ENTITY, inv.id, {
      remoteId: link.remoteId,
      remoteUrl: link.remoteUrl,
      checksum,
      metadata: link.metadata,
    })
    return 'left as paid'
  }
  if (link.metadata?.warnedChecksum !== checksum) {
    await ctx.log(
      'warn',
      `Invoice ${inv.invoiceNumber} changed here (total ${round2(inv.totalAmount)}) after a payment was recorded against it in Xero (total ${round2(current.Total ?? 0)}); Xero does not allow editing it, so it was left as is. Remove the payment in Xero to let the change through.`
    )
    await patchLink(ctx, INVOICE_ENTITY, inv.id, link, { warnedChecksum: checksum })
  }
  return 'left as paid'
}

function checkTotals(
  ctx: ConnectorContext,
  inv: AccountingInvoice,
  saved: XeroInvoice,
  settings: Settings,
  org: OrgInfo
): void {
  if (saved.Total === undefined) return
  if (Math.abs(saved.Total - inv.totalAmount) <= TOTAL_TOLERANCE) return
  const hint = !org.paysTax
    ? 'the organisation is not registered for tax in Xero'
    : !settings.billedTax
      ? 'Xero worked the tax out itself; set Tax amounts to "as billed" to send yours'
      : 'check the tax rates in the integration settings'
  void ctx.log(
    'warn',
    `Invoice ${inv.invoiceNumber}: Xero total ${round2(saved.Total)} differs from ${round2(inv.totalAmount)} here; ${hint}`,
    { xero: saved.Total, torqvoice: inv.totalAmount }
  )
}

/** The invoice the customer received, attached to Xero's copy. */
async function attachPdf(
  ctx: ConnectorContext,
  invoiceId: string,
  inv: AccountingInvoice
): Promise<boolean> {
  try {
    const pdf = await loadInvoicePdfForAccounting(ctx.connection.organizationId, inv.id)
    if (!pdf) return false
    const filename = `${String(inv.invoiceNumber).replace(/[^\w.-]+/g, '_')}.pdf`
    const tenantId = settingsOf(ctx).tenantId ?? ''
    const url = `${API_BASE}/Invoices/${invoiceId}/Attachments/${encodeURIComponent(filename)}?IncludeOnline=true`
    const res = await ctx.http.fetch(url, {
      method: 'PUT',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/pdf',
        'xero-tenant-id': tenantId,
      },
      body: pdf.buffer as BodyInit,
    })
    if (!res.ok) throw new XeroError(res.status, await res.text())
    return true
  } catch (err) {
    await ctx.log(
      'warn',
      `Invoice ${inv.invoiceNumber} is in Xero but its PDF could not be attached: ${err instanceof Error ? err.message : String(err)}`
    )
    return false
  }
}

/** Xero sends its own copy to the contact. Only an approved invoice with an email can go. */
async function emailFromXero(
  ctx: ConnectorContext,
  invoiceId: string,
  inv: AccountingInvoice,
  email: string | null
): Promise<boolean> {
  if (!email) {
    await ctx.log(
      'warn',
      `Invoice ${inv.invoiceNumber} was not emailed from Xero: the customer has no email address`
    )
    return true
  }
  try {
    const current = await readInvoice(ctx, invoiceId)
    if (current.Status !== 'AUTHORISED' && current.Status !== 'PAID') return false
    await api(ctx, `Invoices/${invoiceId}/Email`, { body: {} })
    return true
  } catch (err) {
    await ctx.log(
      'warn',
      `Invoice ${inv.invoiceNumber} could not be emailed from Xero: ${err instanceof Error ? err.message : String(err)}`
    )
    return true
  }
}

/* ---------- payments ---------- */

/** The bank or clearing account a payment from here goes into. */
async function paymentAccountFor(
  ctx: ConnectorContext,
  p: Pick<AccountingPayment, 'method' | 'provider'>
): Promise<string> {
  const settings = settingsOf(ctx)
  const key = methodAccountKey(p)
  const chosen = (key && settings.methodAccounts[key]) || settings.paymentAccount
  if (chosen) return chosen
  const catalog = await loadCatalog(ctx)
  if (catalog.bankAccountId) return catalog.bankAccountId
  throw new Error(
    'The Xero organisation has no bank account to record payments in; add one in Xero or choose an account in the integration settings'
  )
}

/**
 * Records the payments here that Xero does not have yet. Xero takes payments
 * only on an approved invoice, so on a draft they wait and go over once it is
 * approved there (the next edit, pull or retry sends them).
 */
async function pushPendingPayments(
  ctx: ConnectorContext,
  inv: AccountingInvoice,
  invoiceId: string
): Promise<{ count: number; waitingForApproval: boolean }> {
  const settings = settingsOf(ctx)
  const pending: AccountingPayment[] = []
  for (const p of inv.payments) {
    if (!(await linkFor(ctx, PAYMENT_ENTITY, p.id))) pending.push(p)
  }
  const manual =
    settings.manualPaidAsPayment &&
    inv.manuallyPaid &&
    !(await linkFor(ctx, PAYMENT_ENTITY, `manual:${inv.id}`))
  if (!pending.length && !manual) return { count: 0, waitingForApproval: false }
  const current = await readInvoice(ctx, invoiceId)
  if (current.Status !== 'AUTHORISED' && current.Status !== 'PAID') {
    return {
      count: 0,
      waitingForApproval: current.Status === 'DRAFT' || current.Status === 'SUBMITTED',
    }
  }
  // Xero refuses a payment above what it shows as owed. A few cents over is
  // its per-line tax rounding against ours, and the payment is trimmed to fit;
  // more than that means the invoices disagree, which the log says.
  let remaining = current.AmountDue ?? Number.POSITIVE_INFINITY
  let count = 0
  for (const p of pending) {
    let amount = round2(p.amount)
    if (amount > remaining + 0.005) {
      if (amount - remaining <= ROUNDING_SLACK && remaining > 0) {
        amount = round2(remaining)
      } else {
        await ctx.log(
          'warn',
          `A payment of ${amount} on invoice ${inv.invoiceNumber} is more than Xero shows as owed (${round2(Math.max(0, remaining))}); it was not recorded in Xero`
        )
        continue
      }
    }
    await pushPaymentRow(ctx, { ...p, amount }, invoiceId)
    remaining -= amount
    count++
  }
  if (manual) {
    const due = round2(Math.max(0, remaining))
    if (due > 0 && Number.isFinite(due)) {
      await pushPaymentRow(
        ctx,
        {
          id: `manual:${inv.id}`,
          serviceRecordId: inv.id,
          amount: due,
          date: inv.issuedAt ?? new Date(),
          method: 'other',
          note: 'Marked as paid by hand in Torqvoice',
          provider: null,
          externalId: null,
        },
        invoiceId,
        { manual: true }
      )
      count++
    }
  }
  return { count, waitingForApproval: false }
}

async function pushPaymentRow(
  ctx: ConnectorContext,
  p: AccountingPayment,
  invoiceId: string,
  extra: Record<string, unknown> = {}
): Promise<void> {
  const body = buildPayment(p, {
    invoiceId,
    accountId: await paymentAccountFor(ctx, p),
    timezone: ctx.timezone,
  })
  const res = await api<{ Payments?: XeroPayment[] }>(ctx, 'Payments', {
    method: 'PUT',
    query: { summarizeErrors: 'true' },
    headers: { 'Idempotency-Key': `tv-payment-${p.id}` },
    body: { Payments: [body] },
  })
  const made = res.Payments?.[0]
  if (!made) throw new Error('Xero did not return the payment')
  await setLink(
    ctx,
    PAYMENT_ENTITY,
    p.id,
    { remoteId: made.PaymentID },
    { createdByUs: true, serviceRecordId: p.serviceRecordId, ...extra }
  )
}

async function pushPayment(ctx: ConnectorContext, paymentId: string): Promise<JobOutcome> {
  const settings = settingsOf(ctx)
  if (!settings.tenantId) return { summary: NO_TENANT }
  const p = await loadPaymentForAccounting(ctx.connection.organizationId, paymentId)
  const link = await linkFor(ctx, PAYMENT_ENTITY, paymentId)
  if (!p) {
    if (!link) return { summary: 'nothing to do' }
    if (link.metadata?.createdByUs !== true) {
      // A payment Xero made and this app then deleted stays in Xero.
      await ctx.links.remove(PAYMENT_ENTITY, paymentId)
      return { summary: 'payment came from Xero; left there' }
    }
    try {
      await api(ctx, `Payments/${link.remoteId}`, {
        body: { Payments: [{ PaymentID: link.remoteId, Status: 'DELETED' }] },
      })
    } catch (err) {
      if (!isNotFound(err)) throw err
    }
    await ctx.links.remove(PAYMENT_ENTITY, paymentId)
    return { summary: 'payment removed from Xero' }
  }
  if (link) return { summary: 'unchanged' }
  if (!settings.pushPayments) return { summary: 'payments not sent' }

  // The payment needs its invoice in Xero first; pushing the invoice also
  // records every payment on it, this one included.
  const outcome = await pushInvoice(ctx, p.serviceRecordId)
  if (await linkFor(ctx, PAYMENT_ENTITY, paymentId)) return { summary: 'payment recorded' }
  const age = Date.now() - p.date.getTime()
  if (outcome.summary?.includes('wait for approval') && age < APPROVAL_WAIT_DAYS * 86_400_000) {
    return {
      summary: 'waiting for the invoice to be approved in Xero',
      rescheduleInSeconds: APPROVAL_RETRY_SECONDS,
    }
  }
  return { summary: `payment not recorded: ${outcome.summary ?? 'invoice not in Xero'}` }
}

/* ---------- customers on edit ---------- */

async function pushCustomer(ctx: ConnectorContext, customerId: string): Promise<JobOutcome> {
  const settings = settingsOf(ctx)
  if (!settings.tenantId) return { summary: NO_TENANT }
  if (!settings.updateContacts) return { summary: 'contact updates switched off' }
  const link = await linkFor(ctx, CUSTOMER_ENTITY, customerId)
  // Customers reach Xero with their first invoice; an edit before that is nothing yet.
  if (!link) return { summary: 'not in Xero yet' }
  const c = await loadCustomerForAccounting(ctx.connection.organizationId, customerId)
  if (!c) return { summary: 'customer gone' }
  await ensureContact(ctx, c)
  return { summary: 'contact updated' }
}

/* ---------- pull ---------- */

function pullSince(ctx: ConnectorContext): Date {
  const tenantId = settingsOf(ctx).tenantId
  const last = stateOf(ctx).lastPull
  const at = last && last.tenantId === tenantId ? Date.parse(last.at) : Number.NaN
  const start = Number.isFinite(at) ? at : Date.now() - 86_400_000
  // A minute of overlap so a change landing during the last pull is not missed.
  return new Date(start - 60_000)
}

/**
 * What changed in Xero since the last pull: payments recorded there against
 * invoices from here are recorded here too, and ones deleted there removed
 * again; invoices voided or deleted there lose their link, so the next edit
 * here makes a new one; and invoices approved there get any payments that
 * were waiting for the approval.
 */
async function pullChanges(ctx: ConnectorContext): Promise<JobOutcome> {
  const settings = settingsOf(ctx)
  if (!settings.tenantId) return { summary: NO_TENANT }
  const startedAt = new Date()
  const since = pullSince(ctx)
  const modified = { 'If-Modified-Since': modifiedSinceHeader(since) }
  const orgId = ctx.connection.organizationId

  let recorded = 0
  let removed = 0
  if (settings.pullPayments) {
    const payments = await listAll<XeroPayment>(ctx, 'Payments', 'Payments', {
      headers: modified,
      query: { where: 'PaymentType=="ACCRECPAYMENT"' },
    })
    const known = await ctx.links.remoteIds(PAYMENT_ENTITY)
    for (const p of payments) {
      if (p.Status === 'DELETED') {
        const link = await ctx.links.byRemoteId(PAYMENT_ENTITY, p.PaymentID)
        if (!link) continue
        if (link.metadata?.createdByUs === true) {
          await ctx.log(
            'warn',
            `A payment sent from here was removed in Xero (${p.Reference ?? p.PaymentID}); the payment here is kept`
          )
          await ctx.links.remove(PAYMENT_ENTITY, link.entityId)
          continue
        }
        if (await removePulledPayment(orgId, link.entityId, PROVIDER)) removed++
        await ctx.links.remove(PAYMENT_ENTITY, link.entityId)
        continue
      }
      if (known.has(p.PaymentID)) continue
      const invoiceId = p.Invoice?.InvoiceID
      const amount = p.Amount ?? 0
      if (!invoiceId || !(amount > 0)) continue
      const invoiceLink = await ctx.links.byRemoteId(INVOICE_ENTITY, invoiceId)
      if (!invoiceLink || invoiceLink.metadata?.tenantId !== settings.tenantId) continue
      const made = await recordPulledPayment(orgId, {
        serviceRecordId: invoiceLink.entityId,
        amount: round2(amount),
        date: paymentDay(p.Date, ctx.timezone),
        method: 'other',
        provider: PROVIDER,
        externalId: p.PaymentID,
        note: ['Recorded in Xero', p.Reference ? `Ref ${p.Reference}` : null]
          .filter(Boolean)
          .join('. '),
      })
      if (!made) continue
      await setLink(
        ctx,
        PAYMENT_ENTITY,
        made.id,
        { remoteId: p.PaymentID },
        { createdByUs: false, serviceRecordId: invoiceLink.entityId }
      )
      known.add(p.PaymentID)
      if (made.created) recorded++
    }
  }

  let unlinked = 0
  let released = 0
  const invoices = await listAll<XeroInvoice>(ctx, 'Invoices', 'Invoices', {
    headers: modified,
    query: { Statuses: 'VOIDED,DELETED,AUTHORISED', summaryOnly: 'true' },
  })
  for (const remote of invoices) {
    const link = await ctx.links.byRemoteId(INVOICE_ENTITY, remote.InvoiceID)
    if (!link || link.metadata?.tenantId !== settings.tenantId) continue
    if (isGone(remote)) {
      if (link.metadata?.goneInXero) continue
      const status = (remote.Status ?? 'voided').toLowerCase()
      if (settings.xeroNumbers) {
        await ctx.links.remove(INVOICE_ENTITY, link.entityId)
        await ctx.log(
          'warn',
          `Invoice ${remote.InvoiceNumber ?? remote.InvoiceID} was ${status} in Xero; it will be sent again as a new invoice if edited here`
        )
      } else {
        await ctx.links.set(INVOICE_ENTITY, link.entityId, {
          remoteId: link.remoteId,
          remoteUrl: link.remoteUrl,
          checksum: link.checksum,
          metadata: {
            ...(link.metadata ?? {}),
            goneInXero: status,
            invoiceNumber: remote.InvoiceNumber ?? link.metadata?.invoiceNumber ?? null,
          },
        })
        await ctx.log(
          'warn',
          `Invoice ${remote.InvoiceNumber ?? remote.InvoiceID} was ${status} in Xero, and Xero does not give its number out again, so edits here are not sent. Give the invoice a new number in Torqvoice to send it as a new invoice.`
        )
      }
      unlinked++
      continue
    }
    if (!settings.pushPayments) continue
    // Approved in Xero since the last pull: payments waiting for that go now.
    const inv = await loadInvoiceForAccounting(orgId, link.entityId)
    if (!inv) continue
    const pushed = await pushPendingPayments(ctx, inv, remote.InvoiceID)
    released += pushed.count
  }

  await ctx.saveState({ lastPull: { tenantId: settings.tenantId, at: startedAt.toISOString() } })
  const parts = [
    recorded ? `${recorded} payments recorded` : null,
    removed ? `${removed} payments removed` : null,
    unlinked ? `${unlinked} invoices voided or deleted in Xero` : null,
    released ? `${released} waiting payments sent` : null,
  ].filter(Boolean)
  return { summary: parts.length ? parts.join(', ') : 'no changes' }
}

/* ---------- connector ---------- */

function entityId(payload: Record<string, unknown>): string | null {
  return typeof payload.entityId === 'string' ? payload.entityId : null
}

/** Settings lists, read for the organisation chosen, or empty before one is. */
function forTenant<T>(fn: (ctx: ConnectorContext) => Promise<T[]>) {
  return async (ctx: ConnectorContext) => (settingsOf(ctx).tenantId ? fn(ctx) : [])
}

export const connector: ConnectorServer = {
  manifest,
  /**
   * Who connected: the organisations they allowed. The tenant ids are kept
   * off the row; a hash of them is enough to tell two consents apart.
   */
  async identify(ctx) {
    const orgs = await connectionsOf(ctx)
    if (!orgs.length)
      throw new Error('No Xero organisation was allowed; connect again and choose one')
    const ids = orgs.map((o) => o.tenantId).sort()
    const name =
      orgs.length === 1
        ? (orgs[0].tenantName ?? 'Xero')
        : `${orgs[0].tenantName ?? 'Xero'} and ${orgs.length - 1} more`
    return {
      id: `xero-${createHash('sha256').update(ids.join(',')).digest('hex').slice(0, 16)}`,
      name,
    }
  },
  /** One organisation allowed: it is the one, and the form need not ask. */
  async onConnect(ctx) {
    if (settingsOf(ctx).tenantId) return
    const orgs = await connectionsOf(ctx)
    if (orgs.length === 1) return { settings: { tenantId: orgs[0].tenantId } }
  },
  async test(ctx) {
    try {
      const orgs = await connectionsOf(ctx)
      const tenantId = settingsOf(ctx).tenantId
      if (!tenantId) return { ok: true }
      if (!orgs.some((o) => o.tenantId === tenantId)) {
        return {
          ok: false,
          message:
            'The chosen Xero organisation is no longer connected to Torqvoice. Reconnect and allow it, or choose another.',
        }
      }
      const org = await loadOrg(ctx, { refresh: true })
      if (org.edition === 'PARTNER') {
        return {
          ok: false,
          message: `${org.name} is a Xero Partner Edition organisation, which cannot hold invoices. Choose another organisation.`,
        }
      }
      return { ok: true, message: org.name }
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : String(err) }
    }
  },
  remoteOptions: {
    async organisations(ctx) {
      const orgs = await connectionsOf(ctx)
      return orgs
        .map((o) => ({ value: o.tenantId, label: o.tenantName ?? o.tenantId }))
        .sort((a, b) => a.label.localeCompare(b.label))
    },
    salesAccounts: forTenant(async (ctx) => {
      const res = await api<{ Accounts?: XeroAccount[] }>(ctx, 'Accounts')
      return (res.Accounts ?? [])
        .filter((a) => a.Class === 'REVENUE' && a.Code && (!a.Status || a.Status === 'ACTIVE'))
        .sort((a, b) => String(a.Code).localeCompare(String(b.Code), undefined, { numeric: true }))
        .map((a) => ({ value: String(a.Code), label: `${a.Code} ${a.Name ?? ''}`.trim() }))
    }),
    paymentAccounts: forTenant(async (ctx) => {
      const res = await api<{ Accounts?: XeroAccount[] }>(ctx, 'Accounts')
      return (res.Accounts ?? [])
        .filter(
          (a) =>
            (!a.Status || a.Status === 'ACTIVE') &&
            (a.Type === 'BANK' || a.EnablePaymentsToAccount === true)
        )
        .sort((a, b) => (a.Name ?? '').localeCompare(b.Name ?? ''))
        .map((a) => ({
          value: a.AccountID,
          label: a.Code ? `${a.Name ?? a.Code} (${a.Code})` : (a.Name ?? a.AccountID),
        }))
    }),
    items: forTenant(async (ctx) => {
      const res = await api<{ Items?: XeroItem[] }>(ctx, 'Items')
      return (res.Items ?? [])
        .filter((i) => i.IsSold !== false)
        .sort((a, b) => a.Code.localeCompare(b.Code))
        .map((i) => ({
          value: i.Code,
          label: `${i.Code}${i.Name ? ` ${i.Name}` : ''}${i.IsTrackedAsInventory ? ' (tracked)' : ''}`,
        }))
    }),
    taxRates: forTenant(async (ctx) => {
      const catalog = await loadCatalog(ctx, { refresh: true })
      return catalog.rates
        .filter((r) => r.percent > 0)
        .map((r) => ({ value: r.taxType, label: rateLabel(r) }))
    }),
    /** Only zero rates: a rate with a percentage on an untaxed line would add tax nobody billed. */
    zeroTaxRates: forTenant(async (ctx) => {
      const catalog = await loadCatalog(ctx, { refresh: true })
      return catalog.rates
        .filter((r) => r.percent === 0)
        .map((r) => ({ value: r.taxType, label: rateLabel(r) }))
    }),
    trackingOptions: forTenant(async (ctx) => {
      const catalog = await loadCatalog(ctx, { refresh: true })
      return catalog.tracking.map((t) => ({
        value: `${t.categoryId}:${t.id}`,
        label: `${t.categoryName}: ${t.name}`,
      }))
    }),
    brandingThemes: forTenant(async (ctx) => {
      const res = await api<{ BrandingThemes?: XeroBrandingTheme[] }>(ctx, 'BrandingThemes')
      return (res.BrandingThemes ?? [])
        .sort((a, b) => (a.SortOrder ?? 0) - (b.SortOrder ?? 0))
        .map((t) => ({ value: t.BrandingThemeID, label: t.Name }))
    }),
  },
  jobs: {
    'accounting.invoice': async (ctx, payload) => {
      const id = entityId(payload)
      if (!id) return { summary: 'no record id' }
      return pushInvoice(ctx, id)
    },
    'accounting.payment': async (ctx, payload) => {
      const id = entityId(payload)
      if (!id) return { summary: 'no payment id' }
      return pushPayment(ctx, id)
    },
    'accounting.customer': async (ctx, payload) => {
      const id = entityId(payload)
      if (!id) return { summary: 'no customer id' }
      return pushCustomer(ctx, id)
    },
    'accounting.pull': pullChanges,
  },
  /** Hand the refresh token back, which removes Torqvoice from the organisations it reached. */
  async onDisconnect(ctx) {
    const spec = oauthSpec(manifest)
    const client = spec ? resolveClient(spec, ctx.credentials) : null
    const token =
      typeof ctx.credentials.refreshToken === 'string' ? ctx.credentials.refreshToken : null
    if (!client || !token) return
    try {
      await fetch(REVOKE_URL, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${Buffer.from(`${client.clientId}:${client.clientSecret}`).toString('base64')}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({ token }).toString(),
      })
    } catch (err) {
      await ctx.log('warn', `Could not revoke the Xero token: ${String(err)}`)
    }
  },
}
