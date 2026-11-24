import { createHash } from 'node:crypto'
import {
  type AccountingCustomer,
  type AccountingInvoice,
  type AccountingPayment,
  CUSTOMER_ENTITY,
  INVOICE_ENTITY,
  PAYMENT_ENTITY,
  loadCustomerForAccounting,
  loadInvoiceForAccounting,
  loadInvoicePdfForAccounting,
  loadPaymentForAccounting,
  recordPulledPayment,
  removePulledPayment,
  workshopCurrency,
  workshopDistanceUnit,
  workshopVehicleLabel,
} from '@/features/integrations/Lib/accounting-sync'
import { oauthSpec, resolveClient, tokenUrlFor } from '@/features/integrations/Lib/oauth'
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
  type ReferenceChoice,
  UPDATE_REASON,
  WALK_IN_NAME,
  type ZohoAccount,
  type ZohoContact,
  type ZohoInvoice,
  type ZohoInvoicePayment,
  type ZohoItem,
  type ZohoOrganization,
  type ZohoTax,
  apiBase,
  buildContact,
  buildInvoice,
  buildPayment,
  checksumOf,
  contactName,
  contactUrl,
  errorParts,
  invoiceUrl,
  methodAccountKey,
  modifiedSince,
  paymentDay,
  referenceFor,
  round2,
  sameName,
} from './mapping'

const PROVIDER = 'zoho-books'
/** The lines add up to the printed invoice; more than this apart after the adjustment means Zoho changed something. */
const TOTAL_TOLERANCE = 0.005
/** The most the rounding adjustment may carry. A larger gap is a real difference, which the log reports instead. */
const MAX_ADJUSTMENT = 1
/** How long the organisation's lists (taxes, accounts, items) are trusted. */
const CATALOG_TTL_MS = 6 * 60 * 60 * 1000
/** A payment waiting for its invoice to leave draft in Zoho is retried this often, for this long. */
const DRAFT_RETRY_SECONDS = 60 * 60
const DRAFT_WAIT_DAYS = 30
/** How far a payment may exceed Zoho's balance and still be the same payment, rounded differently. */
const ROUNDING_SLACK = 0.05
const NO_ORG = 'choose the Zoho Books organisation in the settings'

/** Zoho's codes worth reacting to, from its answers to this connector. */
const CODE_NOT_FOUND = [1002, 1004, 1006]
const CODE_NUMBER_TAKEN = 1001
const CODE_DAILY_LIMIT = 45

class ZohoError extends Error {
  status: number
  code: number | null
  constructor(status: number, body: string) {
    const { code, message } = errorParts(body)
    super(
      code === CODE_DAILY_LIMIT
        ? `Zoho Books: the organisation has used its API calls for today (${message}). The rest goes over tomorrow; a higher Zoho plan allows more calls a day.`
        : `Zoho Books: ${message}${code ? ` (code ${code})` : ''}`
    )
    this.status = status
    this.code = code
  }
}

function isNotFound(err: unknown): boolean {
  return (
    err instanceof ZohoError &&
    (err.status === 404 || (err.code !== null && CODE_NOT_FOUND.includes(err.code)))
  )
}

/* ---------- settings and state ---------- */

function settingsOf(ctx: ConnectorContext) {
  const s = ctx.connection.settings
  const str = (k: string) => (typeof s[k] === 'string' && (s[k] as string).trim()) || null
  const startDate = str('startDate')
  const reference = str('reference')
  const notesPosition = str('notesPosition')
  return {
    organizationId: str('organizationId'),
    pushInvoices: s.pushInvoices !== false,
    pushOnComplete: s.pushOnComplete === true,
    startDate: startDate && /^\d{4}-\d{2}-\d{2}$/.test(startDate) ? startDate : null,
    markSent: s.invoiceStatus !== 'draft',
    zohoNumbers: s.invoiceNumbers === 'zoho',
    reference: (reference === 'title' ||
    reference === 'invoiceNumber' ||
    reference === 'customerReference' ||
    reference === 'none'
      ? reference
      : 'vehicle') as ReferenceChoice,
    includeVehicle: s.includeVehicle !== false,
    includeNotes: s.includeNotes !== false,
    notesPosition: (notesPosition === 'above' || notesPosition === 'below'
      ? notesPosition
      : 'customerNotes') as 'customerNotes' | 'above' | 'below',
    includePartNumbers: s.includePartNumbers !== false,
    templateId: str('templateId'),
    locationId: str('locationId'),
    laborAccount: str('laborAccount'),
    partsAccount: str('partsAccount'),
    shopFeeAccount: str('shopFeeAccount'),
    laborItem: str('laborItem'),
    partsItem: str('partsItem'),
    matchItemsByPartNumber: s.matchItemsByPartNumber === true,
    taxId: str('taxId'),
    zeroTaxId: str('zeroTaxId'),
    roundingAdjustment: s.roundingAdjustment !== false,
    sendFromZoho: s.sendFromZoho === true && s.invoiceStatus !== 'draft',
    attachPdf: s.attachPdf !== false,
    updateContacts: s.updateContacts !== false,
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
  organizationId: string
  fetchedAt: string
  name: string
  currencyCode: string | null
  locationsEnabled: boolean
}

interface Catalog {
  organizationId: string
  fetchedAt: string
  taxes: { id: string; name: string; percent: number }[]
  /** Item ids by SKU, for matching parts by part number. */
  skus: Record<string, string>
  currencies: Record<string, string>
}

interface State {
  org: OrgInfo | null
  catalog: Catalog | null
  walkIn: { organizationId: string; contactId: string } | null
  lastPull: { organizationId: string; at: string } | null
  /** The account a payment lands in when none is chosen: Zoho's Undeposited Funds, else any cash or bank account. */
  deposit: { organizationId: string; fetchedAt: string; accountId: string | null } | null
}

function stateOf(ctx: ConnectorContext): State {
  const s = ctx.connection.state
  const obj = (v: unknown) => (typeof v === 'object' && v !== null ? v : null)
  return {
    org: obj(s.org) as OrgInfo | null,
    catalog: obj(s.catalog) as Catalog | null,
    walkIn: obj(s.walkIn) as State['walkIn'],
    lastPull: obj(s.lastPull) as State['lastPull'],
    deposit: obj(s.deposit) as State['deposit'],
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
  /** Calls made before an organisation is chosen (the list of organisations itself). */
  noOrganization?: boolean
}

/**
 * At most this many calls to Zoho at once per connection. Zoho's free plan
 * allows five concurrent calls per organisation and answers 429 beyond it;
 * the settings form alone asks for several lists together.
 */
const MAX_CONCURRENT = 3
const gates = new Map<string, { running: number; waiting: (() => void)[] }>()

async function gated<T>(connectionId: string, fn: () => Promise<T>): Promise<T> {
  let gate = gates.get(connectionId)
  if (!gate) {
    gate = { running: 0, waiting: [] }
    gates.set(connectionId, gate)
  }
  const g = gate
  if (g.running >= MAX_CONCURRENT) await new Promise<void>((resolve) => g.waiting.push(resolve))
  g.running++
  try {
    return await fn()
  } finally {
    g.running--
    g.waiting.shift()?.()
  }
}

/**
 * One call to Zoho Books for the chosen organisation, on the API host of
 * the account's region. Every call names the organisation; Zoho answers
 * `code: 0` on success and a code and a sentence otherwise.
 */
async function api<T>(ctx: ConnectorContext, path: string, init: CallInit = {}): Promise<T> {
  const organizationId = settingsOf(ctx).organizationId
  if (!organizationId && !init.noOrganization) {
    throw new Error(`No Zoho Books organisation chosen; ${NO_ORG}`)
  }
  const url = new URL(`${apiBase(ctx.credentials.apiDomain)}/${path}`)
  if (!init.noOrganization && organizationId)
    url.searchParams.set('organization_id', organizationId)
  for (const [k, v] of Object.entries(init.query ?? {})) url.searchParams.set(k, v)
  try {
    return await gated(ctx.connection.id, () =>
      ctx.http.json<T>(url.toString(), {
        method: init.method ?? (init.body !== undefined ? 'POST' : 'GET'),
        headers: { Accept: 'application/json' },
        ...(init.body !== undefined && { body: JSON.stringify(init.body) }),
      })
    )
  } catch (err) {
    if (err instanceof ConnectorHttpError) throw new ZohoError(err.status, err.body)
    throw err
  }
}

/** Every page of a list, 200 at a time, as far as Zoho says there is more. */
async function listAll<T>(
  ctx: ConnectorContext,
  path: string,
  key: string,
  query: Record<string, string> = {}
): Promise<T[]> {
  const out: T[] = []
  for (let page = 1; page <= 50; page++) {
    const res = await api<Record<string, unknown>>(ctx, path, {
      query: { ...query, page: String(page), per_page: '200' },
    })
    const rows = (res[key] as T[] | undefined) ?? []
    out.push(...rows)
    const more = (res.page_context as { has_more_page?: boolean } | undefined)?.has_more_page
    // A short page is the last one, whatever the flag says.
    if (!more || rows.length < 200) break
  }
  return out
}

async function organizationsOf(ctx: ConnectorContext): Promise<ZohoOrganization[]> {
  const res = await api<{ organizations?: ZohoOrganization[] }>(ctx, 'organizations', {
    noOrganization: true,
  })
  return (res.organizations ?? []).filter((o) => o.is_org_active !== false)
}

/* ---------- organisation and lists ---------- */

async function loadOrg(ctx: ConnectorContext, opts: { refresh?: boolean } = {}): Promise<OrgInfo> {
  const organizationId = settingsOf(ctx).organizationId
  if (!organizationId) throw new Error(`No Zoho Books organisation chosen; ${NO_ORG}`)
  const cached = stateOf(ctx).org
  if (!opts.refresh && cached?.organizationId === organizationId && fresh(cached.fetchedAt)) {
    return cached
  }
  const orgs = await organizationsOf(ctx)
  const o = orgs.find((x) => x.organization_id === organizationId)
  if (!o) {
    throw new Error(
      'The chosen Zoho Books organisation is no longer reachable with this connection. Reconnect, or choose another organisation.'
    )
  }
  const org: OrgInfo = {
    organizationId,
    fetchedAt: new Date().toISOString(),
    name: o.name ?? 'Zoho Books',
    currencyCode: o.currency_code ?? null,
    locationsEnabled: o.is_location_enabled === true,
  }
  await ctx.saveState({ org })
  return org
}

async function loadCatalog(
  ctx: ConnectorContext,
  opts: { refresh?: boolean } = {}
): Promise<Catalog> {
  const organizationId = settingsOf(ctx).organizationId
  if (!organizationId) throw new Error(`No Zoho Books organisation chosen; ${NO_ORG}`)
  const cached = stateOf(ctx).catalog
  if (!opts.refresh && cached?.organizationId === organizationId && fresh(cached.fetchedAt)) {
    return cached
  }
  const settings = settingsOf(ctx)
  // One at a time: Zoho limits concurrent calls per organisation (five on
  // the free plan) and answers 429 beyond that.
  const taxes = await api<{ taxes?: ZohoTax[] }>(ctx, 'settings/taxes')
  const items = settings.matchItemsByPartNumber
    ? await listAll<ZohoItem>(ctx, 'items', 'items', { filter_by: 'Status.Active' })
    : []
  const currencies = await api<{ currencies?: { currency_id: string; currency_code: string }[] }>(
    ctx,
    'settings/currencies'
  )
  const catalog: Catalog = {
    organizationId,
    fetchedAt: new Date().toISOString(),
    taxes: (taxes.taxes ?? []).map((t) => ({
      id: t.tax_id,
      name: t.tax_name ?? t.tax_id,
      percent: Number(t.tax_percentage ?? 0),
    })),
    skus: Object.fromEntries(
      items.filter((i) => i.sku?.trim()).map((i) => [String(i.sku).trim(), i.item_id])
    ),
    currencies: Object.fromEntries(
      (currencies.currencies ?? []).map((c) => [c.currency_code, c.currency_id])
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
  return link.metadata?.organizationId === settingsOf(ctx).organizationId ? link : null
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
    metadata: { ...metadata, organizationId: settingsOf(ctx).organizationId },
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

async function readContact(ctx: ConnectorContext, contactId: string): Promise<ZohoContact | null> {
  try {
    const res = await api<{ contact?: ZohoContact }>(ctx, `contacts/${contactId}`)
    return res.contact ?? null
  } catch (err) {
    if (isNotFound(err)) return null
    throw err
  }
}

async function findContacts(
  ctx: ConnectorContext,
  query: Record<string, string>
): Promise<ZohoContact[]> {
  const res = await api<{ contacts?: ZohoContact[] }>(ctx, 'contacts', {
    query: { ...query, contact_type: 'customer', filter_by: 'Status.Active' },
  })
  return res.contacts ?? []
}

async function walkInContact(ctx: ConnectorContext): Promise<string> {
  const organizationId = settingsOf(ctx).organizationId
  const cached = stateOf(ctx).walkIn
  if (cached && cached.organizationId === organizationId) return cached.contactId
  const found = (await findContacts(ctx, { contact_name: WALK_IN_NAME }))[0]
  const contactId =
    found?.contact_id ??
    (
      await api<{ contact?: ZohoContact }>(ctx, 'contacts', {
        body: { contact_name: WALK_IN_NAME, contact_type: 'customer' },
      })
    ).contact?.contact_id
  if (!contactId) throw new Error('Zoho Books did not return the walk-in contact')
  await ctx.saveState({ walkIn: { organizationId, contactId } })
  return contactId
}

function primaryPersonId(contact: ZohoContact | null | undefined): string | null {
  const persons = contact?.contact_persons ?? []
  return (persons.find((p) => p.is_primary_contact) ?? persons[0])?.contact_person_id ?? null
}

/**
 * The Zoho contact for a customer, made or updated as needed. A contact
 * already in Zoho is found by email, used only when its name agrees too
 * (unless the workshop chose to trust email alone), else by name when the
 * customer has no email and exactly one contact carries that name; Zoho
 * lets names repeat, so a name alone is not trusted further than that.
 */
async function ensureContact(
  ctx: ConnectorContext,
  c: AccountingCustomer | null
): Promise<{ id: string; email: string | null; taxExempt: boolean }> {
  if (!c) return { id: await walkInContact(ctx), email: null, taxExempt: false }
  const settings = settingsOf(ctx)
  const organizationId = settings.organizationId ?? ''
  const name = contactName(c)
  const checksum = checksumOf(buildContact(c, name))
  const result = (id: string) => ({ id, email: c.email, taxExempt: c.taxExempt })
  const link = await linkFor(ctx, CUSTOMER_ENTITY, c.id)
  if (link) {
    if (link.checksum === checksum || !settings.updateContacts) return result(link.remoteId)
    const current = await readContact(ctx, link.remoteId)
    if (current) {
      await api(ctx, `contacts/${link.remoteId}`, {
        method: 'PUT',
        body: buildContact(c, name, primaryPersonId(current)),
      })
      await setLink(
        ctx,
        CUSTOMER_ENTITY,
        c.id,
        {
          remoteId: link.remoteId,
          remoteUrl: contactUrl(ctx.credentials.apiDomain, organizationId, link.remoteId),
          checksum,
        },
        link.metadata ?? {}
      )
      return result(link.remoteId)
    }
    await ctx.links.remove(CUSTOMER_ENTITY, c.id)
  }

  const email = c.email?.trim()
  let existing: ZohoContact | null = null
  let sharesEmail: ZohoContact | null = null
  if (email) {
    // Checked again here: Zoho's email filter has answered with contacts
    // that do not carry the address at all.
    const wanted = email.toLowerCase()
    const withEmail = (await findContacts(ctx, { email })).filter(
      (x) => x.email?.trim().toLowerCase() === wanted
    )
    existing =
      withEmail.find((x) => sameName(c, x)) ??
      (settings.reuseByEmail ? (withEmail[0] ?? null) : null)
    if (!existing) sharesEmail = withEmail[0] ?? null
  } else {
    const named = await findContacts(ctx, { contact_name: name })
    if (named.length === 1) existing = named[0]
  }
  let contactId: string
  if (existing) {
    contactId = existing.contact_id
  } else {
    const made = await api<{ contact?: ZohoContact }>(ctx, 'contacts', {
      body: buildContact(c, name),
    })
    if (!made.contact?.contact_id) throw new Error('Zoho Books did not return the new contact')
    contactId = made.contact.contact_id
    if (sharesEmail) {
      await ctx.log(
        'warn',
        `Customer ${c.name} got a new Zoho Books contact, "${name}": the contact "${sharesEmail.contact_name ?? sharesEmail.contact_id}" has the same email address but another name. If they are the same customer, merge the two contacts in Zoho Books, or choose to use the existing contact under "Customers with the same email" in the integration settings.`
      )
    }
  }
  await setLink(
    ctx,
    CUSTOMER_ENTITY,
    c.id,
    {
      remoteId: contactId,
      remoteUrl: contactUrl(ctx.credentials.apiDomain, organizationId, contactId),
      // A contact found rather than made is not ours to overwrite until the customer changes here.
      checksum,
    },
    { reused: Boolean(existing) }
  )
  return result(contactId)
}

/* ---------- tax ---------- */

interface ResolvedTax {
  taxId: string | null
  zeroTaxId: string
  note: string | null
}

async function resolveTax(
  ctx: ConnectorContext,
  inv: AccountingInvoice,
  taxExempt: boolean
): Promise<ResolvedTax> {
  const settings = settingsOf(ctx)
  let catalog = await loadCatalog(ctx)
  const zero = settings.zeroTaxId && catalog.taxes.some((t) => t.id === settings.zeroTaxId)
  const zeroTaxId = zero ? (settings.zeroTaxId ?? '') : ''
  if (!(inv.taxRate > 0) || taxExempt) return { taxId: null, zeroTaxId, note: null }
  const pick = () => {
    const chosen = settings.taxId ? catalog.taxes.find((t) => t.id === settings.taxId) : undefined
    const sameRate = catalog.taxes.find((t) => Math.abs(t.percent - inv.taxRate) < 0.0001)
    return { chosen, sameRate }
  }
  let { chosen, sameRate } = pick()
  if (!sameRate && !chosen) {
    // The rate may be new in Zoho since the list was read.
    catalog = await loadCatalog(ctx, { refresh: true })
    ;({ chosen, sameRate } = pick())
  }
  // A rate with the invoice's percentage wins; the chosen one is for when several match or none does.
  const entry =
    chosen && Math.abs(chosen.percent - inv.taxRate) < 0.0001 ? chosen : (sameRate ?? chosen)
  if (!entry) {
    return {
      taxId: null,
      zeroTaxId,
      note: `No Zoho Books tax carries ${inv.taxRate}%, so invoice ${inv.invoiceNumber} went over without tax. Add a ${inv.taxRate}% tax under Settings, Taxes in Zoho Books, or choose one in the integration settings.`,
    }
  }
  return {
    taxId: entry.id,
    zeroTaxId,
    note:
      Math.abs(entry.percent - inv.taxRate) < 0.0001
        ? null
        : `Invoice ${inv.invoiceNumber} charges ${inv.taxRate}% but was booked under "${entry.name}" (${entry.percent}%), the tax chosen in the integration settings.`,
  }
}

/* ---------- invoices ---------- */

/** Why the invoice stays out of Zoho, or null when it goes. */
function whyNotEligible(inv: AccountingInvoice, s: Settings, tz: string): string | null {
  if (!s.pushInvoices) return 'invoice push switched off'
  if (!inv.invoiceNumber) return 'no invoice number'
  const issued = Boolean(inv.issuedAt) || (s.pushOnComplete && inv.status === 'completed')
  if (!issued) return 'not issued yet'
  // Completed, but its customer's invoices need a reference / PO this job
  // does not have yet. It waits here as it waits in the app; once it has
  // gone out some other way (sent, paid) it is the ledger's like any other.
  if (!inv.issuedAt && inv.awaitingReference) return 'waiting for the customer reference / PO'
  if (s.startDate && zonedDayKey(inv.invoiceDate, tz) < s.startDate) {
    return 'dated before the start date'
  }
  return null
}

async function readInvoice(
  ctx: ConnectorContext,
  invoiceId: string
): Promise<ZohoInvoice & { line_items?: { line_item_id: string }[] }> {
  const res = await api<{ invoice?: ZohoInvoice & { line_items?: { line_item_id: string }[] } }>(
    ctx,
    `invoices/${invoiceId}`
  )
  if (!res.invoice) throw new ZohoError(404, '{"code":1002,"message":"Invoice does not exist."}')
  return res.invoice
}

function isGone(inv: ZohoInvoice): boolean {
  return inv.status === 'void'
}

function hasMoney(inv: ZohoInvoice): boolean {
  return (
    inv.status === 'paid' ||
    inv.status === 'partially_paid' ||
    (typeof inv.total === 'number' &&
      typeof inv.balance === 'number' &&
      inv.balance < inv.total - 0.005)
  )
}

/**
 * An invoice voided in Zoho keeps its number for good. With Torqvoice
 * numbers it is left out, and the link remembers that so later edits are
 * skipped without failing; given a new number here, it is sent as a new
 * invoice. With Zoho numbering it simply goes over again as new.
 */
async function markGone(
  ctx: ConnectorContext,
  inv: AccountingInvoice,
  remote: ZohoInvoice
): Promise<JobOutcome> {
  await setLink(
    ctx,
    INVOICE_ENTITY,
    inv.id,
    { remoteId: remote.invoice_id, remoteUrl: null, checksum: null },
    { goneInZoho: 'voided', invoiceNumber: inv.invoiceNumber }
  )
  await ctx.log(
    'warn',
    `Invoice ${inv.invoiceNumber} was voided in Zoho Books, and Zoho keeps its number, so edits here are not sent. Give the invoice a new number in Torqvoice to send it as a new invoice, or mark it as draft again in Zoho Books.`
  )
  return { summary: `invoice ${inv.invoiceNumber} voided in Zoho Books; not sent again` }
}

/** The record is gone here: void or delete Zoho's copy unless money was taken against it. */
async function retireInvoice(
  ctx: ConnectorContext,
  serviceRecordId: string,
  why: 'deleted' | 'cancelled' = 'deleted'
): Promise<JobOutcome> {
  const settings = settingsOf(ctx)
  const link = await linkFor(ctx, INVOICE_ENTITY, serviceRecordId)
  if (!link) return { summary: 'nothing to do' }
  if (!settings.voidOnDelete) {
    await ctx.links.remove(INVOICE_ENTITY, serviceRecordId)
    return { summary: 'left in Zoho Books, voiding switched off' }
  }
  try {
    const current = await readInvoice(ctx, link.remoteId)
    const label = current.invoice_number ?? current.invoice_id
    if (isGone(current)) {
      await ctx.links.remove(INVOICE_ENTITY, serviceRecordId)
      return { summary: `invoice ${label} already voided in Zoho Books` }
    }
    if (hasMoney(current)) {
      await ctx.log(
        'warn',
        `Invoice ${label} was ${why} here but has payments in Zoho Books; left as is${why === 'cancelled' ? '. Book the credit note or refund there by hand' : ''}`
      )
      await ctx.links.remove(INVOICE_ENTITY, serviceRecordId)
      return { summary: 'left in Zoho Books, has payments' }
    }
    // A draft is deleted, which frees its number; a sent one is voided, as a bookkeeper would.
    if (current.status === 'draft') {
      await api(ctx, `invoices/${current.invoice_id}`, { method: 'DELETE' })
    } else {
      await api(ctx, `invoices/${current.invoice_id}/status/void`, { method: 'POST' })
    }
    await ctx.links.remove(INVOICE_ENTITY, serviceRecordId)
    return {
      summary: `invoice ${label} ${current.status === 'draft' ? 'deleted' : 'voided'} in Zoho Books`,
    }
  } catch (err) {
    if (!isNotFound(err)) throw err
    await ctx.links.remove(INVOICE_ENTITY, serviceRecordId)
    return { summary: 'already gone from Zoho Books' }
  }
}

/**
 * The currency to put on the invoice: none when the workshop bills in the
 * organisation's own currency. Another one goes by its Zoho id; Zoho fills
 * in the exchange rate when the organisation has the currency with
 * automatic rates, and refuses otherwise, which the log then says.
 */
async function currencyFor(ctx: ConnectorContext, org: OrgInfo): Promise<string | null> {
  const ours = await workshopCurrency(ctx.connection.organizationId)
  if (!ours || !org.currencyCode || ours === org.currencyCode) return null
  const catalog = await loadCatalog(ctx)
  const id = catalog.currencies[ours]
  if (!id) {
    throw new Error(
      `Torqvoice bills in ${ours} but the Zoho Books organisation works in ${org.currencyCode} and has no ${ours} currency. Add ${ours} under Settings, Currencies in Zoho Books.`
    )
  }
  return id
}

async function buildBody(
  ctx: ConnectorContext,
  inv: AccountingInvoice,
  contact: { id: string; taxExempt: boolean },
  org: OrgInfo,
  opts: { lineIds: string[]; adjustment: number }
): Promise<{ body: Record<string, unknown>; note: string | null }> {
  const settings = settingsOf(ctx)
  const tax = await resolveTax(ctx, inv, contact.taxExempt)
  const catalog = settings.matchItemsByPartNumber ? await loadCatalog(ctx) : null
  const body = buildInvoice(inv, {
    customerId: contact.id,
    invoiceNumber: settings.zohoNumbers ? null : inv.invoiceNumber,
    reference: referenceFor(inv, settings.reference),
    dueDate: zonedDayKey(inv.dueDate ?? inv.invoiceDate, ctx.timezone),
    timezone: ctx.timezone,
    includeVehicle: settings.includeVehicle,
    vehicleLabel: settings.includeVehicle
      ? await workshopVehicleLabel(ctx.connection.organizationId)
      : 'Vehicle',
    includeNotes: settings.includeNotes,
    notesPosition: settings.notesPosition,
    includePartNumbers: settings.includePartNumbers,
    distanceUnit: await workshopDistanceUnit(ctx.connection.organizationId),
    templateId: settings.templateId,
    locationId: org.locationsEnabled ? settings.locationId : null,
    currencyId: await currencyFor(ctx, org),
    accounts: {
      labor: settings.laborAccount,
      parts: settings.partsAccount,
      shopFee: settings.shopFeeAccount,
    },
    items: { labor: settings.laborItem, parts: settings.partsItem },
    partItems: new Map(Object.entries(catalog?.skus ?? {})),
    taxId: tax.taxId,
    zeroTaxId: tax.zeroTaxId,
    taxExempt: contact.taxExempt,
    lineIds: opts.lineIds,
    adjustment: opts.adjustment,
  })
  return { body, note: tax.note }
}

/** The body without what changes on every answer, for telling whether anything here changed. */
function checksumFor(body: Record<string, unknown>, settings: Settings): string {
  const { adjustment: _a, adjustment_description: _d, ...rest } = body
  const lines = (rest.line_items as Record<string, unknown>[]).map(
    ({ line_item_id: _id, ...l }) => l
  )
  return checksumOf({
    ...rest,
    line_items: lines,
    markSent: settings.markSent,
    rounding: settings.roundingAdjustment,
  })
}

function numberQuery(settings: Settings): Record<string, string> {
  return settings.zohoNumbers ? {} : { ignore_auto_number_generation: 'true' }
}

/**
 * Writes the invoice and makes it add up to the printed total. Zoho works
 * out the tax itself; when that lands a cent or two from the printed
 * invoice, the difference goes in as Zoho's rounding adjustment, which is
 * what the field is for. A bigger gap is left for the log.
 */
async function writeInvoice(
  ctx: ConnectorContext,
  inv: AccountingInvoice,
  body: Record<string, unknown>,
  existing: (ZohoInvoice & { status?: string }) | null
): Promise<ZohoInvoice & { line_items?: { line_item_id: string }[] }> {
  const settings = settingsOf(ctx)
  type Answer = { invoice?: ZohoInvoice & { line_items?: { line_item_id: string }[] } }
  const save = async (b: Record<string, unknown>, id: string | null) => {
    const res = id
      ? await api<Answer>(ctx, `invoices/${id}`, {
          method: 'PUT',
          query: numberQuery(settings),
          // Zoho asks why a sent invoice changed.
          body:
            existing?.status && existing.status !== 'draft' ? { ...b, reason: UPDATE_REASON } : b,
        })
      : await api<Answer>(ctx, 'invoices', { body: b, query: numberQuery(settings) })
    if (!res.invoice) throw new Error('Zoho Books did not return the invoice')
    return res.invoice
  }
  let saved = await save(body, existing?.invoice_id ?? null)
  const target = round2(inv.totalAmount)
  const total = typeof saved.total === 'number' ? saved.total : null
  if (settings.roundingAdjustment && total !== null) {
    const current = Number(body.adjustment ?? 0)
    const gap = round2(target - total)
    if (Math.abs(gap) > TOTAL_TOLERANCE && Math.abs(current + gap) <= MAX_ADJUSTMENT) {
      const ids = (saved.line_items ?? []).map((l) => l.line_item_id)
      const lines = (body.line_items as Record<string, unknown>[]).map((l, i) =>
        ids[i] ? { ...l, line_item_id: ids[i] } : l
      )
      const next = round2(current + gap)
      saved = await save(
        {
          ...body,
          line_items: lines,
          adjustment: next,
          adjustment_description: next ? 'Rounding' : '',
        },
        saved.invoice_id
      )
    }
  }
  return saved
}

function checkTotals(
  ctx: ConnectorContext,
  inv: AccountingInvoice,
  saved: ZohoInvoice,
  settings: Settings
): void {
  if (typeof saved.total !== 'number') return
  if (Math.abs(saved.total - inv.totalAmount) <= TOTAL_TOLERANCE) return
  const hint = settings.roundingAdjustment
    ? 'check the tax in the integration settings and in Zoho Books'
    : 'switch on "Match the total to the cent" in the integration settings to let a rounding adjustment close the gap'
  void ctx.log(
    'warn',
    `Invoice ${inv.invoiceNumber}: Zoho Books total ${round2(saved.total)} differs from ${round2(inv.totalAmount)} here; ${hint}`,
    { zoho: saved.total, torqvoice: inv.totalAmount }
  )
}

/**
 * A new invoice in Zoho. When the Torqvoice number is used and Zoho already
 * has an invoice of that number for the same customer, an earlier push lost
 * its link and that invoice is adopted instead of doubled.
 */
async function findByNumber(ctx: ConnectorContext, number: string): Promise<ZohoInvoice | null> {
  const res = await api<{ invoices?: ZohoInvoice[] }>(ctx, 'invoices', {
    query: { invoice_number: number },
  })
  return (res.invoices ?? []).find((i) => i.invoice_number === number) ?? null
}

async function pushInvoice(ctx: ConnectorContext, serviceRecordId: string): Promise<JobOutcome> {
  const settings = settingsOf(ctx)
  if (!settings.organizationId) return { summary: NO_ORG }
  const inv = await loadInvoiceForAccounting(ctx.connection.organizationId, serviceRecordId)
  if (!inv) return retireInvoice(ctx, serviceRecordId)
  // Cancelled here: its number is kept, and the Zoho copy is voided.
  if (inv.status === 'cancelled') return retireInvoice(ctx, serviceRecordId, 'cancelled')
  const skip = whyNotEligible(inv, settings, ctx.timezone)
  if (skip) return { summary: skip }

  const org = await loadOrg(ctx)
  const contact = await ensureContact(ctx, inv.customer)
  let link = await linkFor(ctx, INVOICE_ENTITY, serviceRecordId)
  if (link?.metadata?.goneInZoho) {
    if (!settings.zohoNumbers && link.metadata.invoiceNumber === inv.invoiceNumber) {
      return { summary: `invoice ${inv.invoiceNumber} voided in Zoho Books; not sent again` }
    }
    await ctx.links.remove(INVOICE_ENTITY, serviceRecordId)
    link = null
  }

  // The checksum is of the body without line ids and adjustment, which change with Zoho's answers.
  const draft = await buildBody(ctx, inv, contact, org, { lineIds: [], adjustment: 0 })
  const checksum = checksumFor(draft.body, settings)

  let saved: (ZohoInvoice & { line_items?: { line_item_id: string }[] }) | null = null
  let action = 'unchanged'
  if (!link || link.checksum !== checksum) {
    if (draft.note) await ctx.log('warn', draft.note)
    let current: (ZohoInvoice & { line_items?: { line_item_id: string }[] }) | null = null
    if (link) {
      try {
        current = await readInvoice(ctx, link.remoteId)
      } catch (err) {
        if (!isNotFound(err)) throw err
        await ctx.links.remove(INVOICE_ENTITY, serviceRecordId)
        link = null
      }
      if (current && isGone(current)) {
        if (!settings.zohoNumbers) return markGone(ctx, inv, current)
        await ctx.links.remove(INVOICE_ENTITY, serviceRecordId)
        link = null
        current = null
      }
    }
    if (!current && !settings.zohoNumbers && inv.invoiceNumber) {
      const found = await findByNumber(ctx, inv.invoiceNumber)
      if (found) {
        if (isGone(found)) return markGone(ctx, inv, found)
        if (found.customer_id !== contact.id) {
          throw new Error(
            `Zoho Books already has an invoice numbered ${inv.invoiceNumber} for another customer, so this one cannot be added under that number. Renumber one of them, or choose "Let Zoho Books number them" in the integration settings.`
          )
        }
        await ctx.log(
          'info',
          `Invoice ${inv.invoiceNumber} was already in Zoho Books; linked to it`
        )
        current = await readInvoice(ctx, found.invoice_id)
        await relinkPayments(ctx, inv, current)
        action = 'found in Zoho Books and linked again'
      }
    }
    const { body } = await buildBody(ctx, inv, contact, org, {
      lineIds: (current?.line_items ?? []).map((l) => l.line_item_id),
      adjustment: Number(current?.adjustment ?? 0),
    })
    try {
      saved = await writeInvoice(ctx, inv, body, current)
    } catch (err) {
      if (err instanceof ZohoError && err.code === CODE_NUMBER_TAKEN && inv.invoiceNumber) {
        const found = await findByNumber(ctx, inv.invoiceNumber)
        if (found && isGone(found)) return markGone(ctx, inv, found)
      }
      throw err
    }
    if (action === 'unchanged') action = current ? 'updated' : 'created'
    await setLink(
      ctx,
      INVOICE_ENTITY,
      serviceRecordId,
      {
        remoteId: saved.invoice_id,
        remoteUrl: invoiceUrl(ctx.credentials.apiDomain, org.organizationId, saved.invoice_id),
        checksum,
      },
      {
        invoiceNumber: saved.invoice_number ?? null,
        contactId: contact.id,
        // The PDF changed with the invoice; the old copy is replaced.
        attached: false,
        documentId: link?.metadata?.documentId ?? null,
        emailed: link?.metadata?.emailed ?? false,
      }
    )
    checkTotals(ctx, inv, saved, settings)
  }

  link = await linkFor(ctx, INVOICE_ENTITY, serviceRecordId)
  if (link) {
    if (settings.attachPdf && link.metadata?.attached !== true) {
      const documentId = await attachPdf(
        ctx,
        link.remoteId,
        inv,
        (link.metadata?.documentId as string | null) ?? null
      )
      if (documentId) {
        await patchLink(ctx, INVOICE_ENTITY, serviceRecordId, link, {
          attached: true,
          documentId,
        })
        link = await linkFor(ctx, INVOICE_ENTITY, serviceRecordId)
      }
    }
    if (link) {
      const status = saved?.status ?? (await readInvoice(ctx, link.remoteId)).status
      if (settings.sendFromZoho && link.metadata?.emailed !== true) {
        if (await emailFromZoho(ctx, link.remoteId, inv, contact.email)) {
          await patchLink(ctx, INVOICE_ENTITY, serviceRecordId, link, { emailed: true })
        }
      } else if (settings.markSent && status === 'draft') {
        await api(ctx, `invoices/${link.remoteId}/status/sent`, { method: 'POST' })
      }
    }
  }

  let paymentsPushed = 0
  let waiting = false
  if (settings.pushPayments && link) {
    const pushed = await pushPendingPayments(ctx, inv, link.remoteId, contact.id)
    paymentsPushed = pushed.count
    waiting = pushed.waitingForDraft
  }
  const summary = `invoice ${inv.invoiceNumber} ${action}`
  const extra = [
    paymentsPushed ? `${paymentsPushed} payments recorded` : null,
    waiting ? 'payments wait until the invoice leaves draft in Zoho Books' : null,
  ].filter(Boolean)
  return { summary: extra.length ? `${summary}, ${extra.join(', ')}` : summary }
}

/**
 * After a lost link, the payments Zoho already holds for an invoice found
 * again are linked to the ones here by amount and day, so they are not
 * recorded a second time.
 */
async function relinkPayments(
  ctx: ConnectorContext,
  inv: AccountingInvoice,
  remote: ZohoInvoice
): Promise<void> {
  const theirs = await invoicePayments(ctx, remote.invoice_id)
  const taken = new Set<string>()
  for (const p of inv.payments) {
    if (await linkFor(ctx, PAYMENT_ENTITY, p.id)) continue
    const fromZoho = p.provider === PROVIDER && p.externalId
    const day = zonedDayKey(p.date, ctx.timezone)
    const match = fromZoho
      ? theirs.find((x) => x.payment_id === p.externalId)
      : theirs.find(
          (x) =>
            !taken.has(x.payment_id) &&
            Math.abs((x.amount ?? 0) - round2(p.amount)) <= ROUNDING_SLACK &&
            x.date === day
        )
    if (!match) continue
    taken.add(match.payment_id)
    await setLink(
      ctx,
      PAYMENT_ENTITY,
      p.id,
      { remoteId: match.payment_id },
      { createdByUs: !fromZoho, serviceRecordId: inv.id, relinked: true }
    )
  }
}

/**
 * The invoice the customer received, attached to Zoho's copy. Zoho adds a
 * file rather than replacing one of the same name, so the copy attached
 * before an edit is removed first.
 */
async function attachPdf(
  ctx: ConnectorContext,
  invoiceId: string,
  inv: AccountingInvoice,
  previousDocumentId: string | null
): Promise<string | null> {
  try {
    const pdf = await loadInvoicePdfForAccounting(ctx.connection.organizationId, inv.id)
    if (!pdf) return null
    if (previousDocumentId) {
      try {
        await api(ctx, `invoices/${invoiceId}/documents/${previousDocumentId}`, {
          method: 'DELETE',
        })
      } catch (err) {
        if (!isNotFound(err)) throw err
      }
    }
    const filename = `${String(inv.invoiceNumber).replace(/[^\w.-]+/g, '_')}.pdf`
    const form = new FormData()
    form.append(
      'attachment',
      new Blob([pdf.buffer as BlobPart], { type: 'application/pdf' }),
      filename
    )
    const url = new URL(`${apiBase(ctx.credentials.apiDomain)}/invoices/${invoiceId}/attachment`)
    url.searchParams.set('organization_id', settingsOf(ctx).organizationId ?? '')
    url.searchParams.set('can_send_in_mail', 'true')
    const res = await ctx.http.fetch(url.toString(), { method: 'POST', body: form })
    const text = await res.text()
    if (!res.ok) throw new ZohoError(res.status, text)
    const parsed = JSON.parse(text) as {
      documents?: { document_id?: string; file_name?: string }[]
    }
    const doc =
      (parsed.documents ?? []).find((d) => d.file_name === filename) ?? parsed.documents?.[0]
    return doc?.document_id ?? 'attached'
  } catch (err) {
    await ctx.log(
      'warn',
      `Invoice ${inv.invoiceNumber} is in Zoho Books but its PDF could not be attached: ${err instanceof Error ? err.message : String(err)}`
    )
    return null
  }
}

/** Zoho emails its own copy to the customer, with Zoho's subject and message, and marks it sent. */
async function emailFromZoho(
  ctx: ConnectorContext,
  invoiceId: string,
  inv: AccountingInvoice,
  email: string | null
): Promise<boolean> {
  if (!email) {
    await ctx.log(
      'warn',
      `Invoice ${inv.invoiceNumber} was not emailed from Zoho Books: the customer has no email address`
    )
    return true
  }
  try {
    const defaults = await api<{ data?: { subject?: string; body?: string } }>(
      ctx,
      `invoices/${invoiceId}/email`
    )
    await api(ctx, `invoices/${invoiceId}/email`, {
      body: {
        to_mail_ids: [email],
        subject: defaults.data?.subject ?? `Invoice ${inv.invoiceNumber}`,
        body: defaults.data?.body ?? '',
      },
    })
    return true
  } catch (err) {
    await ctx.log(
      'warn',
      `Invoice ${inv.invoiceNumber} could not be emailed from Zoho Books: ${err instanceof Error ? err.message : String(err)}`
    )
    return true
  }
}

/* ---------- payments ---------- */

async function invoicePayments(
  ctx: ConnectorContext,
  invoiceId: string
): Promise<ZohoInvoicePayment[]> {
  const res = await api<{ payments?: ZohoInvoicePayment[] }>(ctx, `invoices/${invoiceId}/payments`)
  return res.payments ?? []
}

/** The cash or bank account a payment from here goes into. */
async function paymentAccountFor(
  ctx: ConnectorContext,
  p: Pick<AccountingPayment, 'method' | 'provider'>
): Promise<string> {
  const settings = settingsOf(ctx)
  const key = methodAccountKey(p)
  const chosen = (key && settings.methodAccounts[key]) || settings.paymentAccount
  if (chosen) return chosen
  const organizationId = settings.organizationId ?? ''
  const cached = stateOf(ctx).deposit
  let accountId: string | null
  if (cached?.organizationId === organizationId && fresh(cached.fetchedAt)) {
    accountId = cached.accountId
  } else {
    // Read only when no account is chosen, and kept: the chart of accounts
    // is the list Zoho guards most tightly against repeated reads.
    const accounts = await listAll<ZohoAccount>(ctx, 'chartofaccounts', 'chartofaccounts', {
      filter_by: 'AccountType.Active',
    })
    const deposit =
      accounts.find(
        (a) => a.account_type === 'cash' && /undeposited/i.test(a.account_name ?? '')
      ) ??
      accounts.find((a) => a.account_type === 'bank') ??
      accounts.find((a) => a.account_type === 'cash') ??
      null
    accountId = deposit?.account_id ?? null
    await ctx.saveState({
      deposit: { organizationId, fetchedAt: new Date().toISOString(), accountId },
    })
  }
  if (accountId) return accountId
  throw new Error(
    'The Zoho Books organisation has no cash or bank account to record payments in; add one in Zoho Books or choose an account in the integration settings'
  )
}

/**
 * Records the payments here that Zoho does not have yet. Zoho takes
 * payments on an invoice that has been sent, so on a draft they wait and go
 * over once it is sent there (the next edit, pull or retry sends them).
 */
async function pushPendingPayments(
  ctx: ConnectorContext,
  inv: AccountingInvoice,
  invoiceId: string,
  customerId: string
): Promise<{ count: number; waitingForDraft: boolean }> {
  const settings = settingsOf(ctx)
  const pending: AccountingPayment[] = []
  for (const p of inv.payments) {
    if (!(await linkFor(ctx, PAYMENT_ENTITY, p.id))) pending.push(p)
  }
  const manual =
    settings.manualPaidAsPayment &&
    inv.manuallyPaid &&
    !(await linkFor(ctx, PAYMENT_ENTITY, `manual:${inv.id}`))
  if (!pending.length && !manual) return { count: 0, waitingForDraft: false }
  const current = await readInvoice(ctx, invoiceId)
  if (current.status === 'draft') return { count: 0, waitingForDraft: true }
  if (isGone(current)) return { count: 0, waitingForDraft: false }
  // Zoho refuses a payment above the balance. A few cents over is rounding,
  // and the payment is trimmed to fit; more means the invoices disagree.
  let remaining = typeof current.balance === 'number' ? current.balance : Number.POSITIVE_INFINITY
  let count = 0
  for (const p of pending) {
    let amount = round2(p.amount)
    if (amount > remaining + 0.005) {
      if (amount - remaining <= ROUNDING_SLACK && remaining > 0) {
        amount = round2(remaining)
      } else {
        await ctx.log(
          'warn',
          `A payment of ${amount} on invoice ${inv.invoiceNumber} is more than Zoho Books shows as owed (${round2(Math.max(0, remaining))}); it was not recorded in Zoho Books`
        )
        continue
      }
    }
    await pushPaymentRow(ctx, p, amount, invoiceId, customerId)
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
        due,
        invoiceId,
        customerId,
        { manual: true }
      )
      count++
    }
  }
  return { count, waitingForDraft: false }
}

async function pushPaymentRow(
  ctx: ConnectorContext,
  p: AccountingPayment,
  amount: number,
  invoiceId: string,
  customerId: string,
  extra: Record<string, unknown> = {}
): Promise<void> {
  const body = buildPayment(p, {
    customerId,
    invoiceId,
    accountId: await paymentAccountFor(ctx, p),
    timezone: ctx.timezone,
    amount,
  })
  const res = await api<{ payment?: { payment_id?: string } }>(ctx, 'customerpayments', { body })
  const id = res.payment?.payment_id
  if (!id) throw new Error('Zoho Books did not return the payment')
  await setLink(
    ctx,
    PAYMENT_ENTITY,
    p.id,
    { remoteId: id },
    { createdByUs: true, serviceRecordId: p.serviceRecordId, invoiceId, ...extra }
  )
}

async function pushPayment(ctx: ConnectorContext, paymentId: string): Promise<JobOutcome> {
  const settings = settingsOf(ctx)
  if (!settings.organizationId) return { summary: NO_ORG }
  const p = await loadPaymentForAccounting(ctx.connection.organizationId, paymentId)
  const link = await linkFor(ctx, PAYMENT_ENTITY, paymentId)
  if (!p) {
    if (!link) return { summary: 'nothing to do' }
    if (link.metadata?.createdByUs !== true) {
      // A payment Zoho made and this app then deleted stays in Zoho.
      await ctx.links.remove(PAYMENT_ENTITY, paymentId)
      return { summary: 'payment came from Zoho Books; left there' }
    }
    try {
      await api(ctx, `customerpayments/${link.remoteId}`, { method: 'DELETE' })
    } catch (err) {
      if (!isNotFound(err)) throw err
    }
    await ctx.links.remove(PAYMENT_ENTITY, paymentId)
    return { summary: 'payment removed from Zoho Books' }
  }
  if (link) return { summary: 'unchanged' }
  if (!settings.pushPayments) return { summary: 'payments not sent' }

  // The payment needs its invoice in Zoho first; pushing the invoice also
  // records every payment on it, this one included.
  const outcome = await pushInvoice(ctx, p.serviceRecordId)
  if (await linkFor(ctx, PAYMENT_ENTITY, paymentId)) return { summary: 'payment recorded' }
  const age = Date.now() - p.date.getTime()
  if (outcome.summary?.includes('leaves draft') && age < DRAFT_WAIT_DAYS * 86_400_000) {
    return {
      summary: 'waiting for the invoice to leave draft in Zoho Books',
      rescheduleInSeconds: DRAFT_RETRY_SECONDS,
    }
  }
  return { summary: `payment not recorded: ${outcome.summary ?? 'invoice not in Zoho Books'}` }
}

/* ---------- customers on edit ---------- */

async function pushCustomer(ctx: ConnectorContext, customerId: string): Promise<JobOutcome> {
  const settings = settingsOf(ctx)
  if (!settings.organizationId) return { summary: NO_ORG }
  if (!settings.updateContacts) return { summary: 'contact updates switched off' }
  const link = await linkFor(ctx, CUSTOMER_ENTITY, customerId)
  // Customers reach Zoho with their first invoice; an edit before that is nothing yet.
  if (!link) return { summary: 'not in Zoho Books yet' }
  const c = await loadCustomerForAccounting(ctx.connection.organizationId, customerId)
  if (!c) return { summary: 'customer gone' }
  await ensureContact(ctx, c)
  return { summary: 'contact updated' }
}

/* ---------- pull ---------- */

function pullSince(ctx: ConnectorContext): Date {
  const organizationId = settingsOf(ctx).organizationId
  const last = stateOf(ctx).lastPull
  const at = last && last.organizationId === organizationId ? Date.parse(last.at) : Number.NaN
  const start = Number.isFinite(at) ? at : Date.now() - 86_400_000
  // A minute of overlap so a change landing during the last pull is not missed.
  return new Date(start - 60_000)
}

/**
 * What changed in Zoho since the last pull. Zoho lists invoices by when they
 * were modified, and a payment changes its invoice, so the pull reads the
 * invoices from here that changed and then their payments: new ones are
 * recorded here, ones removed there are removed here, invoices voided there
 * lose their link, and invoices sent there get any payments that waited.
 */
async function pullChanges(ctx: ConnectorContext): Promise<JobOutcome> {
  const settings = settingsOf(ctx)
  if (!settings.organizationId) return { summary: NO_ORG }
  const startedAt = new Date()
  const orgId = ctx.connection.organizationId
  const changed = await listAll<ZohoInvoice>(ctx, 'invoices', 'invoices', {
    last_modified_time: modifiedSince(pullSince(ctx)),
  })

  let recorded = 0
  let removed = 0
  let unlinked = 0
  let released = 0
  for (const remote of changed) {
    const link = await ctx.links.byRemoteId(INVOICE_ENTITY, remote.invoice_id)
    if (!link || link.metadata?.organizationId !== settings.organizationId) continue
    if (isGone(remote)) {
      if (link.metadata?.goneInZoho) continue
      if (settings.zohoNumbers) {
        await ctx.links.remove(INVOICE_ENTITY, link.entityId)
        await ctx.log(
          'warn',
          `Invoice ${remote.invoice_number ?? remote.invoice_id} was voided in Zoho Books; it will be sent again as a new invoice if edited here`
        )
      } else {
        await patchLink(ctx, INVOICE_ENTITY, link.entityId, link, {
          goneInZoho: 'voided',
          invoiceNumber: remote.invoice_number ?? link.metadata?.invoiceNumber ?? null,
        })
        await ctx.log(
          'warn',
          `Invoice ${remote.invoice_number ?? remote.invoice_id} was voided in Zoho Books, and Zoho keeps its number, so edits here are not sent. Give the invoice a new number in Torqvoice to send it as a new invoice, or mark it as draft again in Zoho Books.`
        )
      }
      unlinked++
      continue
    }

    if (settings.pullPayments) {
      const theirs = await invoicePayments(ctx, remote.invoice_id)
      const theirIds = new Set(theirs.map((p) => p.payment_id))
      // Payments recorded in Zoho that this app has not seen.
      for (const p of theirs) {
        if (await ctx.links.byRemoteId(PAYMENT_ENTITY, p.payment_id)) continue
        const amount = p.amount ?? 0
        if (!(amount > 0)) continue
        const made = await recordPulledPayment(orgId, {
          serviceRecordId: link.entityId,
          amount: round2(amount),
          date: paymentDay(p.date, ctx.timezone),
          method: 'other',
          provider: PROVIDER,
          externalId: p.payment_id,
          note: ['Recorded in Zoho Books', p.reference_number ? `Ref ${p.reference_number}` : null]
            .filter(Boolean)
            .join('. '),
        })
        if (!made) continue
        await setLink(
          ctx,
          PAYMENT_ENTITY,
          made.id,
          { remoteId: p.payment_id },
          { createdByUs: false, serviceRecordId: link.entityId, invoiceId: remote.invoice_id }
        )
        if (made.created) recorded++
      }
      // Payments this app knows on the invoice that Zoho no longer has.
      const inv = await loadInvoiceForAccounting(orgId, link.entityId)
      for (const p of inv?.payments ?? []) {
        const pl = await linkFor(ctx, PAYMENT_ENTITY, p.id)
        if (!pl || pl.metadata?.removedInZoho || theirIds.has(pl.remoteId)) continue
        if (pl.metadata?.createdByUs === true) {
          await ctx.log(
            'warn',
            `A payment of ${round2(p.amount)} sent from here was removed in Zoho Books (invoice ${remote.invoice_number ?? remote.invoice_id}); the payment here is kept`
          )
          // The link stays, marked, so the payment is not sent to Zoho again:
          // the bookkeeper removed it there on purpose.
          await patchLink(ctx, PAYMENT_ENTITY, p.id, pl, { removedInZoho: true })
          continue
        }
        if (await removePulledPayment(orgId, p.id, PROVIDER)) removed++
        await ctx.links.remove(PAYMENT_ENTITY, p.id)
      }
    }

    if (settings.pushPayments && remote.status !== 'draft') {
      // Sent in Zoho since the last pull: payments waiting for that go now.
      const inv = await loadInvoiceForAccounting(orgId, link.entityId)
      const contactId = (link.metadata?.contactId as string | undefined) ?? remote.customer_id
      if (inv && contactId) {
        const pushed = await pushPendingPayments(ctx, inv, remote.invoice_id, contactId)
        released += pushed.count
      }
    }
  }

  await ctx.saveState({
    lastPull: { organizationId: settings.organizationId, at: startedAt.toISOString() },
  })
  const parts = [
    recorded ? `${recorded} payments recorded` : null,
    removed ? `${removed} payments removed` : null,
    unlinked ? `${unlinked} invoices voided in Zoho Books` : null,
    released ? `${released} waiting payments sent` : null,
  ].filter(Boolean)
  return { summary: parts.length ? parts.join(', ') : 'no changes' }
}

/* ---------- connector ---------- */

function entityId(payload: Record<string, unknown>): string | null {
  return typeof payload.entityId === 'string' ? payload.entityId : null
}

/**
 * Lists for the settings form, shared for a minute per connection and list.
 * The form asks for every dropdown at once, several of them the same list
 * (five payment-account fields), and Zoho answers a burst like that with
 * 429; one call per list serves them all.
 */
const listCache = new Map<string, { at: number; value: Promise<unknown> }>()
const LIST_TTL_MS = 60_000

function shared<T>(ctx: ConnectorContext, key: string, fn: () => Promise<T>): Promise<T> {
  const id = `${ctx.connection.id}:${settingsOf(ctx).organizationId}:${key}`
  const hit = listCache.get(id)
  if (hit && Date.now() - hit.at < LIST_TTL_MS) return hit.value as Promise<T>
  const value = fn()
  listCache.set(id, { at: Date.now(), value })
  value.catch(() => listCache.delete(id))
  return value
}

/** Settings lists, read for the organisation chosen, or empty before one is. */
function forOrg<T>(fn: (ctx: ConnectorContext) => Promise<T[]>) {
  return async (ctx: ConnectorContext) => (settingsOf(ctx).organizationId ? fn(ctx) : [])
}

function activeAccounts(ctx: ConnectorContext): Promise<ZohoAccount[]> {
  return shared(ctx, 'accounts', () =>
    listAll<ZohoAccount>(ctx, 'chartofaccounts', 'chartofaccounts', {
      filter_by: 'AccountType.Active',
    })
  )
}

function catalogForForm(ctx: ConnectorContext): Promise<Catalog> {
  return shared(ctx, 'catalog', () => loadCatalog(ctx, { refresh: true }))
}

function accountLabel(a: ZohoAccount): string {
  return a.account_code
    ? `${a.account_code} ${a.account_name ?? ''}`.trim()
    : (a.account_name ?? a.account_id)
}

export const connector: ConnectorServer = {
  manifest,
  /**
   * Zoho's 429s say which limit it was. Blocked for a while (43), out of
   * calls for the minute (44) or the day (45): a retry within seconds only
   * keeps the block going, so those fail at once. Too many calls at once
   * (1070) and server errors clear by themselves and are retried.
   */
  shouldRetry(status, body) {
    if (status !== 429) return true
    const { code } = errorParts(body)
    return code === null || ![43, 44, CODE_DAILY_LIMIT].includes(code)
  },
  /** Who connected: the organisations they can reach. The ids are kept off the row; a hash tells two consents apart. */
  async identify(ctx) {
    const orgs = await organizationsOf(ctx)
    if (!orgs.length) {
      throw new Error(
        'This Zoho account has no Zoho Books organisation; create one in Zoho Books and connect again'
      )
    }
    const ids = orgs.map((o) => o.organization_id).sort()
    const name =
      orgs.length === 1
        ? (orgs[0].name ?? 'Zoho Books')
        : `${orgs[0].name ?? 'Zoho Books'} and ${orgs.length - 1} more`
    return {
      id: `zoho-${createHash('sha256').update(ids.join(',')).digest('hex').slice(0, 16)}`,
      name,
    }
  },
  /** One organisation reachable: it is the one, and the form need not ask. */
  async onConnect(ctx) {
    if (settingsOf(ctx).organizationId) return
    const orgs = await organizationsOf(ctx)
    if (orgs.length === 1) return { settings: { organizationId: orgs[0].organization_id } }
  },
  async test(ctx) {
    try {
      const orgs = await organizationsOf(ctx)
      const organizationId = settingsOf(ctx).organizationId
      if (!organizationId) return { ok: true }
      if (!orgs.some((o) => o.organization_id === organizationId)) {
        return {
          ok: false,
          message:
            'The chosen Zoho Books organisation is no longer reachable with this connection. Reconnect, or choose another organisation.',
        }
      }
      const org = await loadOrg(ctx, { refresh: true })
      await loadCatalog(ctx, { refresh: true })
      return { ok: true, message: org.name }
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : String(err) }
    }
  },
  remoteOptions: {
    async organizations(ctx) {
      const orgs = await shared(ctx, 'organizations', () => organizationsOf(ctx))
      return orgs
        .map((o) => ({
          value: o.organization_id,
          label: o.currency_code
            ? `${o.name ?? o.organization_id} (${o.currency_code})`
            : (o.name ?? o.organization_id),
        }))
        .sort((a, b) => a.label.localeCompare(b.label))
    },
    templates: forOrg(async (ctx) => {
      const res = await shared(ctx, 'templates', () =>
        api<{ templates?: { template_id: string; template_name?: string }[] }>(
          ctx,
          'invoices/templates'
        )
      )
      return (res.templates ?? []).map((t) => ({
        value: t.template_id,
        label: t.template_name ?? t.template_id,
      }))
    }),
    locations: forOrg(async (ctx) => {
      const res = await shared(ctx, 'locations', () =>
        api<{
          locations?: {
            location_id: string
            location_name?: string
            is_location_active?: boolean
          }[]
        }>(ctx, 'locations')
      )
      return (res.locations ?? [])
        .filter((l) => l.is_location_active !== false)
        .map((l) => ({ value: l.location_id, label: l.location_name ?? l.location_id }))
    }),
    incomeAccounts: forOrg(async (ctx) => {
      const accounts = await activeAccounts(ctx)
      return accounts
        .filter((a) => a.account_type === 'income' || a.account_type === 'other_income')
        .sort((a, b) =>
          accountLabel(a).localeCompare(accountLabel(b), undefined, { numeric: true })
        )
        .map((a) => ({ value: a.account_id, label: accountLabel(a) }))
    }),
    paymentAccounts: forOrg(async (ctx) => {
      const accounts = await activeAccounts(ctx)
      return accounts
        .filter(
          (a) =>
            a.account_type === 'bank' ||
            a.account_type === 'cash' ||
            a.account_type === 'credit_card' ||
            a.account_type === 'other_current_asset'
        )
        .sort((a, b) => accountLabel(a).localeCompare(accountLabel(b)))
        .map((a) => ({ value: a.account_id, label: accountLabel(a) }))
    }),
    items: forOrg(async (ctx) => {
      const items = await shared(ctx, 'items', () =>
        listAll<ZohoItem>(ctx, 'items', 'items', { filter_by: 'Status.Active' })
      )
      return items
        .filter((i) => i.item_type !== 'purchases')
        .sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''))
        .map((i) => ({
          value: i.item_id,
          label: i.sku ? `${i.name ?? i.item_id} (${i.sku})` : (i.name ?? i.item_id),
        }))
    }),
    taxes: forOrg(async (ctx) => {
      const catalog = await catalogForForm(ctx)
      return catalog.taxes
        .filter((t) => t.percent > 0)
        .map((t) => ({ value: t.id, label: `${t.name} (${t.percent}%)` }))
    }),
    /** Only zero taxes: a rate with a percentage on an untaxed line would add tax nobody billed. */
    zeroTaxes: forOrg(async (ctx) => {
      const catalog = await catalogForForm(ctx)
      return catalog.taxes
        .filter((t) => t.percent === 0)
        .map((t) => ({ value: t.id, label: `${t.name} (0%)` }))
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
  /**
   * Hand the refresh token back on the account's own sign-in server. Zoho
   * keeps at most twenty per user and drops the oldest silently, so one
   * left behind on every reconnect would in time cut off another app.
   */
  async onDisconnect(ctx) {
    const spec = oauthSpec(manifest)
    const client = spec ? resolveClient(spec, ctx.credentials) : null
    const token =
      typeof ctx.credentials.refreshToken === 'string' ? ctx.credentials.refreshToken : null
    if (!spec || !client || !token) return
    try {
      const revoke = tokenUrlFor(spec, ctx.credentials).replace(/\/token$/, '/token/revoke')
      await fetch(`${revoke}?token=${encodeURIComponent(token)}`, { method: 'POST' })
    } catch (err) {
      await ctx.log('warn', `Could not revoke the Zoho token: ${String(err)}`)
    }
  },
}
