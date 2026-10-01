import { createHash, randomUUID } from 'node:crypto'
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
} from '@/features/integrations/Lib/accounting-sync'
import type {
  ConnectorContext,
  ConnectorServer,
  JobOutcome,
  LinkRecord,
} from '@/features/integrations/Lib/types'
import { zonedDayKey } from '@/lib/timezone'
import { manifest } from './manifest'
import {
  API,
  CURRENCY,
  DEFAULT_INCOME_ACCOUNT,
  type FikenAccount,
  type FikenBankAccount,
  type FikenCompany,
  type FikenContact,
  type FikenSale,
  type FikenUser,
  PAGE_SIZE,
  REVOKE_URL,
  WALK_IN_NAME,
  type ZeroVatType,
  bookedTotals,
  buildContact,
  buildPayment,
  buildSale,
  carriesVat,
  checksumOf,
  contactName,
  faultMessage,
  fromCents,
  idFromLocation,
  isZeroVatType,
  localPaymentMethod,
  mergeContact,
  money,
  organizationNumber,
  saleDifferences,
  toCents,
  vatTypeForRate,
} from './mapping'

const PROVIDER = 'fiken'
/** A list is read to the end, but not without one: 50 pages is 5000 rows. */
const MAX_PAGES = 50
/** What is known about the company is read again after a day. */
const COMPANY_TTL_MS = 24 * 60 * 60 * 1000

class FikenError extends Error {
  status: number
  /** The X-Request-ID sent with the call; Fiken's support asks for it. */
  requestId: string
  constructor(status: number, body: string, requestId: string) {
    super(`Fiken: ${faultMessage(body) || `HTTP ${status}`} (request ${requestId})`)
    this.status = status
    this.requestId = requestId
  }
}

interface CompanyFacts {
  slug: string
  /** Not registered for VAT means every sale goes without VAT handling. */
  vatRegistered: boolean
  fetchedAt: string
}

interface State {
  company: CompanyFacts | null
  walkIn: { slug: string; contactId: number } | null
  paymentAccount: { slug: string; code: string } | null
  lastPullDay: string | null
}

function stateOf(ctx: ConnectorContext): State {
  const s = ctx.connection.state
  const obj = <T>(v: unknown): T | null => (typeof v === 'object' && v !== null ? (v as T) : null)
  return {
    company: obj<CompanyFacts>(s.company),
    walkIn: obj<NonNullable<State['walkIn']>>(s.walkIn),
    paymentAccount: obj<NonNullable<State['paymentAccount']>>(s.paymentAccount),
    lastPullDay: typeof s.lastPullDay === 'string' ? s.lastPullDay : null,
  }
}

function settingsOf(ctx: ConnectorContext) {
  const s = ctx.connection.settings
  const str = (k: string) => (typeof s[k] === 'string' && (s[k] as string).trim()) || null
  const startDate = str('startDate')
  const zeroVatType = str('zeroVatType')
  return {
    companySlug: str('companySlug'),
    pushInvoices: s.pushInvoices !== false,
    pushOnComplete: s.pushOnComplete === true,
    startDate: startDate && /^\d{4}-\d{2}-\d{2}$/.test(startDate) ? startDate : null,
    attachPdf: s.attachPdf !== false,
    laborAccount: str('laborAccount') ?? DEFAULT_INCOME_ACCOUNT,
    partsAccount: str('partsAccount') ?? DEFAULT_INCOME_ACCOUNT,
    zeroVatType: isZeroVatType(zeroVatType) ? zeroVatType : null,
    zeroAccount: str('zeroAccount'),
    pushPayments: s.pushPayments !== false,
    paymentAccount: str('paymentAccount'),
    manualPaidAsPayment: s.manualPaidAsPayment === true,
    pullPayments: s.pullPayments !== false,
  }
}

const NO_COMPANY = 'no Fiken company chosen yet'

/* ---------- transport ---------- */

/**
 * Fiken allows one request at a time and may ban an app that sends two
 * together, so every call for a connection waits for the one before it,
 * whether it comes from a job or from somebody opening the settings page.
 */
const queues = new Map<string, Promise<unknown>>()

function inTurn<T>(connectionId: string, run: () => Promise<T>): Promise<T> {
  const before = queues.get(connectionId) ?? Promise.resolve()
  const result = before.then(run, run)
  const done = result.catch(() => undefined)
  queues.set(connectionId, done)
  void done.then(() => {
    if (queues.get(connectionId) === done) queues.delete(connectionId)
  })
  return result
}

interface CallInit {
  method?: string
  query?: Record<string, string>
  body?: unknown
  form?: FormData
}

async function call(ctx: ConnectorContext, path: string, init: CallInit = {}): Promise<Response> {
  const url = new URL(`${API}${path}`)
  for (const [k, v] of Object.entries(init.query ?? {})) url.searchParams.set(k, v)
  const requestId = randomUUID()
  const res = await inTurn(ctx.connection.id, () =>
    ctx.http.fetch(url.toString(), {
      method: init.method ?? (init.body !== undefined || init.form ? 'POST' : 'GET'),
      headers: { Accept: 'application/json', 'X-Request-ID': requestId },
      ...(init.form
        ? { body: init.form }
        : init.body !== undefined && { body: JSON.stringify(init.body) }),
    })
  )
  if (!res.ok) throw new FikenError(res.status, await res.text(), requestId)
  return res
}

async function read<T>(
  ctx: ConnectorContext,
  path: string,
  query?: Record<string, string>
): Promise<T> {
  const res = await call(ctx, path, { query })
  return (await res.json()) as T
}

/** Every row of a paged collection. */
async function list<T>(
  ctx: ConnectorContext,
  path: string,
  query: Record<string, string> = {}
): Promise<T[]> {
  const rows: T[] = []
  for (let page = 0; page < MAX_PAGES; page++) {
    const res = await call(ctx, path, {
      query: { ...query, page: String(page), pageSize: String(PAGE_SIZE) },
    })
    const batch = (await res.json()) as T[]
    rows.push(...batch)
    const pages = Number(res.headers.get('Fiken-Api-Page-Count'))
    const last = Number.isFinite(pages) && pages > 0 ? page + 1 >= pages : batch.length < PAGE_SIZE
    if (last) break
  }
  return rows
}

/** A create answers with an empty body and the new record's URL in Location. */
async function create(
  ctx: ConnectorContext,
  path: string,
  init: Pick<CallInit, 'body' | 'form' | 'query'>
): Promise<number> {
  const res = await call(ctx, path, { method: 'POST', ...init })
  const id = idFromLocation(res.headers.get('Location'))
  if (!id) throw new Error(`Fiken accepted ${path} but did not say where the new record is`)
  return id
}

function isNotFound(err: unknown): boolean {
  return err instanceof FikenError && err.status === 404
}

function companyPath(slug: string, rest: string): string {
  return `/companies/${encodeURIComponent(slug)}${rest}`
}

/* ---------- links ---------- */

/**
 * Ids are only good in the company they came from. A workshop that tries the
 * connection on a test company and then moves to the real one would
 * otherwise carry the test company's contacts and sales along, so every link
 * names its company and one from another company counts as no link.
 */
async function linkFor(
  ctx: ConnectorContext,
  slug: string,
  entityType: string,
  entityId: string
): Promise<LinkRecord | null> {
  const link = await ctx.links.get(entityType, entityId)
  return link && link.metadata?.company === slug ? link : null
}

async function remoteLinkFor(
  ctx: ConnectorContext,
  slug: string,
  entityType: string,
  remoteId: string
): Promise<(LinkRecord & { entityId: string }) | null> {
  const link = await ctx.links.byRemoteId(entityType, remoteId)
  return link && link.metadata?.company === slug ? link : null
}

/** Change a link's metadata and keep the rest of it as it was. */
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

function paymentIdsOn(link: LinkRecord): string[] {
  const ids = link.metadata?.payments
  return Array.isArray(ids) ? ids.filter((id): id is string => typeof id === 'string') : []
}

/**
 * The sale's link keeps the ids of the payments known on it, both the ones
 * sent from here and the ones brought back, so a pull can tell that one of
 * them is gone from Fiken.
 */
async function rememberPayment(
  ctx: ConnectorContext,
  slug: string,
  serviceRecordId: string,
  paymentId: string
): Promise<void> {
  const link = await linkFor(ctx, slug, INVOICE_ENTITY, serviceRecordId)
  if (!link || paymentIdsOn(link).includes(paymentId)) return
  await patchLink(ctx, INVOICE_ENTITY, serviceRecordId, link, {
    payments: [...paymentIdsOn(link), paymentId],
  })
}

async function forgetPayment(
  ctx: ConnectorContext,
  slug: string,
  serviceRecordId: string,
  paymentId: string
): Promise<void> {
  const link = await linkFor(ctx, slug, INVOICE_ENTITY, serviceRecordId)
  if (!link || !paymentIdsOn(link).includes(paymentId)) return
  await patchLink(ctx, INVOICE_ENTITY, serviceRecordId, link, {
    payments: paymentIdsOn(link).filter((id) => id !== paymentId),
  })
}

/* ---------- company ---------- */

async function companyFacts(ctx: ConnectorContext, slug: string): Promise<CompanyFacts> {
  const known = stateOf(ctx).company
  if (known?.slug === slug && Date.now() - new Date(known.fetchedAt).getTime() < COMPANY_TTL_MS) {
    return known
  }
  const company = await read<FikenCompany>(ctx, companyPath(slug, ''))
  // Fiken lets a test company use the API without the module.
  if (company.hasApiAccess === false && company.testCompany !== true) {
    await ctx.log(
      'warn',
      'The API module is not activated for this company in Fiken, so Fiken refuses what is sent. Activate it in Fiken under Foretak, Tilleggstjenester.'
    )
  }
  const facts: CompanyFacts = {
    slug,
    vatRegistered: company.vatType !== 'no',
    fetchedAt: new Date().toISOString(),
  }
  await ctx.saveState({ company: facts })
  return facts
}

/* ---------- contacts ---------- */

async function walkInContact(ctx: ConnectorContext, slug: string): Promise<number> {
  const known = stateOf(ctx).walkIn
  if (known?.slug === slug) return known.contactId
  const found = await list<FikenContact>(ctx, companyPath(slug, '/contacts'), {
    name: WALK_IN_NAME,
    customer: 'true',
  })
  const contactId =
    found[0]?.contactId ??
    (await create(ctx, companyPath(slug, '/contacts'), {
      body: { name: WALK_IN_NAME, customer: true },
    }))
  await ctx.saveState({ walkIn: { slug, contactId } })
  return contactId
}

/**
 * A contact Fiken already has for this customer, so the books do not get a
 * second one. A business is known by its organisation number. A person is
 * matched on the name, and only when the email agrees or there is nothing
 * to tell two people of the same name apart.
 */
async function findContact(
  ctx: ConnectorContext,
  slug: string,
  c: AccountingCustomer
): Promise<FikenContact | null> {
  const path = companyPath(slug, '/contacts')
  const orgNumber = organizationNumber(c.taxId)
  if (orgNumber) {
    const byNumber = await list<FikenContact>(ctx, path, { organizationNumber: orgNumber })
    if (byNumber[0]) return byNumber[0]
  }
  const byName = await list<FikenContact>(ctx, path, { name: contactName(c), customer: 'true' })
  const email = c.email?.trim().toLowerCase()
  if (email) {
    const same = byName.find((x) => x.email?.trim().toLowerCase() === email)
    if (same) return same
    const open = byName.filter((x) => !x.email)
    return open.length === 1 ? open[0] : null
  }
  return byName.length === 1 ? byName[0] : null
}

/**
 * Fiken's id for a customer, creating or updating as needed. A contact
 * found there is left as the bookkeeper has it until the workshop edits the
 * customer here.
 */
async function ensureContact(
  ctx: ConnectorContext,
  slug: string,
  c: AccountingCustomer | null
): Promise<number> {
  if (!c) return walkInContact(ctx, slug)
  const ours = buildContact(c)
  const checksum = checksumOf(ours)
  const link = await linkFor(ctx, slug, CUSTOMER_ENTITY, c.id)
  if (link) {
    if (link.checksum === checksum) return Number(link.remoteId)
    try {
      const path = companyPath(slug, `/contacts/${link.remoteId}`)
      const current = await read<FikenContact>(ctx, path)
      await call(ctx, path, { method: 'PUT', body: mergeContact(current, ours) })
      await patchLink(ctx, CUSTOMER_ENTITY, c.id, { ...link, checksum }, {})
      return Number(link.remoteId)
    } catch (err) {
      if (!isNotFound(err)) throw err
      await ctx.links.remove(CUSTOMER_ENTITY, c.id)
    }
  }
  const existing = await findContact(ctx, slug, c)
  if (existing && existing.customer !== true) {
    // Known there as a supplier only; a sale needs a customer.
    await call(ctx, companyPath(slug, `/contacts/${existing.contactId}`), {
      method: 'PUT',
      body: mergeContact(existing, { name: existing.name, customer: true }),
    })
  }
  const contactId =
    existing?.contactId ?? (await create(ctx, companyPath(slug, '/contacts'), { body: ours }))
  await ctx.links.set(CUSTOMER_ENTITY, c.id, {
    remoteId: String(contactId),
    checksum,
    metadata: { company: slug, reused: Boolean(existing) },
  })
  return contactId
}

/* ---------- invoices ---------- */

/** Why the invoice stays out of the books, or null when it goes. */
function whyNotEligible(
  inv: AccountingInvoice,
  s: ReturnType<typeof settingsOf>,
  tz: string
): string | null {
  if (!s.pushInvoices) return 'invoice push switched off'
  if (!inv.invoiceNumber) return 'no invoice number'
  const issued = Boolean(inv.issuedAt) || (s.pushOnComplete && inv.status === 'completed')
  if (!issued) return 'not issued yet'
  if (s.startDate && zonedDayKey(inv.invoiceDate, tz) < s.startDate) {
    return 'dated before the start date'
  }
  if (toCents(inv.totalAmount) <= 0) return 'no amount to book'
  return null
}

function hasPayments(sale: FikenSale): boolean {
  return (sale.salePayments?.length ?? 0) > 0 || (sale.totalPaid ?? 0) > 0 || sale.settled === true
}

/** Fiken has no edit for a sale: it is deleted, which books a reversal, and entered again. */
async function reverseSale(
  ctx: ConnectorContext,
  slug: string,
  saleId: string,
  description: string
): Promise<void> {
  await call(ctx, companyPath(slug, `/sales/${saleId}/delete`), {
    method: 'PATCH',
    query: { description },
  })
}

/** The record is gone: reverse the sale unless money was taken against it. */
async function retireInvoice(
  ctx: ConnectorContext,
  slug: string,
  serviceRecordId: string
): Promise<JobOutcome> {
  const link = await linkFor(ctx, slug, INVOICE_ENTITY, serviceRecordId)
  if (!link) return { summary: 'nothing to do' }
  const number = String(link.metadata?.saleNumber ?? link.remoteId)
  try {
    const sale = await read<FikenSale>(ctx, companyPath(slug, `/sales/${link.remoteId}`))
    if (sale.deleted) {
      await ctx.links.remove(INVOICE_ENTITY, serviceRecordId)
      return { summary: 'already deleted in Fiken' }
    }
    if (hasPayments(sale)) {
      await ctx.log(
        'warn',
        `Invoice ${number} was deleted here but has payments in Fiken; the sale there is left as it is`
      )
      await ctx.links.remove(INVOICE_ENTITY, serviceRecordId)
      return { summary: 'left in Fiken, has payments' }
    }
    await reverseSale(ctx, slug, link.remoteId, 'Deleted in Torqvoice')
    await ctx.links.remove(INVOICE_ENTITY, serviceRecordId)
    return { summary: `sale ${number} reversed` }
  } catch (err) {
    if (!isNotFound(err)) throw err
    await ctx.links.remove(INVOICE_ENTITY, serviceRecordId)
    return { summary: 'already gone from Fiken' }
  }
}

/**
 * A new sale. When Fiken already holds one with this number, date and
 * amounts, it is this invoice from an earlier push whose link was lost, and
 * is taken over rather than entered twice.
 */
async function createSale(
  ctx: ConnectorContext,
  slug: string,
  body: Record<string, unknown>,
  inv: AccountingInvoice
): Promise<{ saleId: number; adopted: boolean }> {
  const lines = body.lines as { netPrice: number; vat: number }[]
  const net = lines.reduce((a, l) => a + l.netPrice, 0)
  const vat = lines.reduce((a, l) => a + l.vat, 0)
  const sameNumber = (
    await list<FikenSale>(ctx, companyPath(slug, '/sales'), {
      saleNumber: String(inv.invoiceNumber),
    })
  ).filter((s) => !s.deleted)
  const ours = sameNumber.find(
    (s) => s.date === body.date && s.netAmount === net && (s.vatAmount ?? 0) === vat
  )
  if (ours) {
    await ctx.log('info', `Invoice ${inv.invoiceNumber} was already in Fiken; linked to it`)
    return { saleId: ours.saleId, adopted: true }
  }
  if (sameNumber.length > 0) {
    await ctx.log(
      'warn',
      `Fiken already has a sale numbered ${inv.invoiceNumber} with other amounts; invoice ${inv.invoiceNumber} was added beside it`
    )
  }
  let saleId: number
  try {
    saleId = await create(ctx, companyPath(slug, '/sales'), { body })
  } catch (err) {
    // Fiken's reason alone rarely says which figure it objects to; the lines
    // that were sent, amounts and accounts only, go in the log beside it.
    if (err instanceof FikenError) {
      await ctx.log('warn', `Fiken refused the sale for invoice ${inv.invoiceNumber}`, {
        date: body.date,
        lines: body.lines,
      })
    }
    throw err
  }
  return { saleId, adopted: false }
}

/**
 * Read a new sale back and hold what Fiken booked against what was billed.
 * Fiken answers a create with no body, so this is the only way to know that
 * the net and the VAT in the books are the ones on the invoice. The outcome
 * goes on the job's line in the log; a difference is a warning of its own.
 */
async function confirmSale(
  ctx: ConnectorContext,
  slug: string,
  saleId: number,
  body: Record<string, unknown>,
  inv: AccountingInvoice
): Promise<string | null> {
  const sent = bookedTotals({ saleId, lines: body.lines as FikenSale['lines'] })
  let booked: ReturnType<typeof bookedTotals> = null
  try {
    booked = bookedTotals(await read<FikenSale>(ctx, companyPath(slug, `/sales/${saleId}`)))
  } catch (err) {
    await ctx.log(
      'warn',
      `Invoice ${inv.invoiceNumber} is in Fiken but could not be read back to check its amounts: ${err instanceof Error ? err.message : String(err)}`
    )
  }
  if (!sent || !booked) return null
  if (booked.net === sent.net && booked.vat === sent.vat) {
    return `${money(sent.net)} net and ${money(sent.vat)} VAT confirmed in Fiken`
  }
  await ctx.log(
    'warn',
    `Invoice ${inv.invoiceNumber}: Fiken booked ${money(booked.net)} net and ${money(booked.vat)} VAT, the invoice here has ${money(sent.net)} net and ${money(sent.vat)} VAT`,
    { fiken: booked, torqvoice: sent }
  )
  return 'amounts differ in Fiken'
}

/** The invoice the customer received, filed behind the sale as its voucher. */
async function attachInvoice(
  ctx: ConnectorContext,
  slug: string,
  saleId: string,
  inv: AccountingInvoice
): Promise<boolean> {
  try {
    const pdf = await loadInvoicePdfForAccounting(ctx.connection.organizationId, inv.id)
    if (!pdf) return false
    // Fiken takes the name only when it ends in a type it knows.
    const filename = `${String(inv.invoiceNumber).replace(/[^\w.-]+/g, '_')}.pdf`
    const form = new FormData()
    form.set('filename', filename)
    form.set('file', new Blob([pdf.buffer as BlobPart], { type: 'application/pdf' }), filename)
    // Not create(): an attachment is known by a uuid, not by a number.
    await call(ctx, companyPath(slug, `/sales/${saleId}/attachments`), {
      method: 'POST',
      query: { attachToSale: 'true' },
      form,
    })
    return true
  } catch (err) {
    await ctx.log(
      'warn',
      `Invoice ${inv.invoiceNumber} is in Fiken but its PDF could not be attached: ${err instanceof Error ? err.message : String(err)}`
    )
    return false
  }
}

async function pushInvoice(ctx: ConnectorContext, serviceRecordId: string): Promise<JobOutcome> {
  const settings = settingsOf(ctx)
  const slug = settings.companySlug
  if (!slug) return { summary: NO_COMPANY }
  const inv = await loadInvoiceForAccounting(ctx.connection.organizationId, serviceRecordId)
  if (!inv) return retireInvoice(ctx, slug, serviceRecordId)
  const skip = whyNotEligible(inv, settings, ctx.timezone)
  if (skip) return { summary: skip }

  const currency = await workshopCurrency(ctx.connection.organizationId)
  if (currency && currency !== CURRENCY) {
    return { summary: `not sent: the workshop bills in ${currency} and Fiken keeps ${CURRENCY}` }
  }

  const company = await companyFacts(ctx, slug)
  const taxable = carriesVat(inv)
  const vatType = taxable ? vatTypeForRate(inv.taxRate) : null
  if (taxable && !vatType) {
    await ctx.log(
      'warn',
      `Invoice ${inv.invoiceNumber} was not sent: it carries ${inv.taxRate}% VAT and Fiken has no VAT type with that rate (25, 15, 12 or 11.11)`
    )
    return { summary: `invoice ${inv.invoiceNumber} not sent, no VAT type for ${inv.taxRate}%` }
  }
  // A company outside the VAT register has one way to book a sale. One
  // inside it has several ways to book a sale without VAT, and which is
  // right is the bookkeeper's call, not a guess made here.
  const zeroVatType: ZeroVatType | null =
    settings.zeroVatType ?? (company.vatRegistered ? null : 'NONE')
  if (!taxable && !zeroVatType) {
    await ctx.log(
      'warn',
      `Invoice ${inv.invoiceNumber} was not sent: it carries no VAT. Choose the VAT type for invoices without VAT in the integration settings.`
    )
    return {
      summary: `invoice ${inv.invoiceNumber} not sent, VAT type for tax-free sales not chosen`,
    }
  }

  const customerId = await ensureContact(ctx, slug, inv.customer)
  const body = buildSale(inv, {
    customerId,
    laborAccount: settings.laborAccount,
    partsAccount: settings.partsAccount,
    zeroAccount: settings.zeroAccount,
    vatType,
    zeroVatType: zeroVatType ?? 'NONE',
    timezone: ctx.timezone,
  })
  const checksum = checksumOf(body)
  let link = await linkFor(ctx, slug, INVOICE_ENTITY, serviceRecordId)

  let action = 'unchanged'
  let confirmed: string | null = null
  if (link && link.checksum !== checksum) {
    try {
      const sale = await read<FikenSale>(ctx, companyPath(slug, `/sales/${link.remoteId}`))
      // The body can differ from the one that was sent without the invoice
      // having changed: the workshop chose another account, or the mapping
      // moved. What counts is whether Fiken still holds what the invoice says.
      const differences = sale.deleted ? null : saleDifferences(sale, body)
      if (sale.deleted) {
        await ctx.links.remove(INVOICE_ENTITY, serviceRecordId)
        link = null
      } else if (differences && differences.length === 0) {
        await ctx.links.set(INVOICE_ENTITY, serviceRecordId, { ...link, checksum })
        link = { ...link, checksum }
      } else if (hasPayments(sale)) {
        // Reversing a sale that has been paid would leave the money without
        // a sale. The bookkeeper hears about it once per change.
        if (link.metadata?.stale !== checksum) {
          const what = differences?.length ? ` (${differences.join(', ')})` : ''
          await ctx.log(
            'warn',
            `Invoice ${inv.invoiceNumber} no longer matches its sale in Fiken${what}. The sale has payments there, so it is left as it is; correct it in Fiken.`
          )
          await patchLink(ctx, INVOICE_ENTITY, serviceRecordId, link, { stale: checksum })
        }
        action = 'left as it is in Fiken, has payments'
      } else {
        await reverseSale(ctx, slug, link.remoteId, 'Changed in Torqvoice')
        await ctx.links.remove(INVOICE_ENTITY, serviceRecordId)
        link = null
        action = 'reversed and entered again'
      }
    } catch (err) {
      if (!isNotFound(err)) throw err
      await ctx.links.remove(INVOICE_ENTITY, serviceRecordId)
      link = null
    }
  }
  if (!link) {
    const made = await createSale(ctx, slug, body, inv)
    if (action === 'unchanged') action = made.adopted ? 'linked' : 'created'
    await ctx.links.set(INVOICE_ENTITY, serviceRecordId, {
      remoteId: String(made.saleId),
      checksum,
      metadata: {
        company: slug,
        saleNumber: inv.invoiceNumber,
        contactId: customerId,
        // A sale taken over may already have its document; it is not sent twice.
        attached: made.adopted,
        payments: [],
      },
    })
    link = await linkFor(ctx, slug, INVOICE_ENTITY, serviceRecordId)
    if (!made.adopted) confirmed = await confirmSale(ctx, slug, made.saleId, body, inv)
  }
  if (!link) throw new Error('The sale was saved in Fiken but its link could not be read back')

  if (settings.attachPdf && link.metadata?.attached !== true) {
    if (await attachInvoice(ctx, slug, link.remoteId, inv)) {
      await patchLink(ctx, INVOICE_ENTITY, serviceRecordId, link, { attached: true })
    }
  }

  let paymentsPushed = 0
  if (settings.pushPayments) {
    for (const p of inv.payments) {
      if (await linkFor(ctx, slug, PAYMENT_ENTITY, p.id)) continue
      if (await pushPaymentRow(ctx, slug, p, link.remoteId)) paymentsPushed++
    }
    if (settings.manualPaidAsPayment && inv.manuallyPaid) {
      if (await settleByHand(ctx, slug, inv, link.remoteId)) paymentsPushed++
    }
  }
  const summary = [
    `invoice ${inv.invoiceNumber} ${action}`,
    confirmed,
    paymentsPushed ? `${paymentsPushed} payments recorded` : null,
  ]
    .filter(Boolean)
    .join(', ')
  return { summary }
}

/* ---------- payments ---------- */

/**
 * The account a payment lands on. The workshop's choice, or the company's
 * first ordinary bank account, found once and remembered.
 */
async function paymentAccount(ctx: ConnectorContext, slug: string): Promise<string> {
  const chosen = settingsOf(ctx).paymentAccount
  if (chosen) return chosen
  const known = stateOf(ctx).paymentAccount
  if (known?.slug === slug) return known.code
  const accounts = await list<FikenBankAccount>(ctx, companyPath(slug, '/bankAccounts'), {
    inactive: 'false',
  })
  const account = accounts.find((a) => a.type === 'normal') ?? accounts[0]
  if (!account) {
    throw new Error(
      'Fiken has no bank account to record payments on; add one in Fiken or choose an account in the integration settings'
    )
  }
  await ctx.saveState({ paymentAccount: { slug, code: account.accountCode } })
  return account.accountCode
}

async function recordPayment(
  ctx: ConnectorContext,
  slug: string,
  input: { entityId: string; serviceRecordId: string; amount: number; date: Date; manual?: true },
  saleId: string
): Promise<void> {
  const body = buildPayment(input, {
    account: await paymentAccount(ctx, slug),
    timezone: ctx.timezone,
  })
  const paymentId = await create(ctx, companyPath(slug, `/sales/${saleId}/payments`), { body })
  await ctx.links.set(PAYMENT_ENTITY, input.entityId, {
    remoteId: String(paymentId),
    metadata: {
      company: slug,
      createdByUs: true,
      serviceRecordId: input.serviceRecordId,
      saleId,
      ...(input.manual && { manual: true }),
    },
  })
  await rememberPayment(ctx, slug, input.serviceRecordId, String(paymentId))
}

async function pushPaymentRow(
  ctx: ConnectorContext,
  slug: string,
  p: AccountingPayment,
  saleId: string
): Promise<boolean> {
  // Money handed back is not a payment on the sale; Fiken books that its own way.
  if (toCents(p.amount) <= 0) return false
  await recordPayment(
    ctx,
    slug,
    { entityId: p.id, serviceRecordId: p.serviceRecordId, amount: p.amount, date: p.date },
    saleId
  )
  return true
}

/**
 * An invoice marked paid by hand has no payment row here, so Fiken would
 * show it open forever. When the workshop asks for it, one payment for
 * whatever Fiken still shows as owed closes it, once.
 */
async function settleByHand(
  ctx: ConnectorContext,
  slug: string,
  inv: AccountingInvoice,
  saleId: string
): Promise<boolean> {
  const entityId = `manual:${inv.id}`
  if (await linkFor(ctx, slug, PAYMENT_ENTITY, entityId)) return false
  const sale = await read<FikenSale>(ctx, companyPath(slug, `/sales/${saleId}`))
  const owed = sale.outstandingBalance ?? 0
  if (!(owed > 0) || sale.settled) return false
  await recordPayment(
    ctx,
    slug,
    {
      entityId,
      serviceRecordId: inv.id,
      amount: fromCents(owed),
      date: inv.issuedAt ?? new Date(),
      manual: true,
    },
    saleId
  )
  return true
}

async function pushPayment(ctx: ConnectorContext, paymentId: string): Promise<JobOutcome> {
  const settings = settingsOf(ctx)
  const slug = settings.companySlug
  if (!slug) return { summary: NO_COMPANY }
  const p = await loadPaymentForAccounting(ctx.connection.organizationId, paymentId)
  const link = await linkFor(ctx, slug, PAYMENT_ENTITY, paymentId)
  if (!p) {
    if (!link) return { summary: 'nothing to do' }
    const serviceRecordId = String(link.metadata?.serviceRecordId ?? '')
    if (link.metadata?.createdByUs !== true) {
      // A payment Fiken made and this app then deleted stays in Fiken.
      await ctx.links.remove(PAYMENT_ENTITY, paymentId)
      await forgetPayment(ctx, slug, serviceRecordId, link.remoteId)
      return { summary: 'payment came from Fiken; left there' }
    }
    try {
      await call(
        ctx,
        companyPath(slug, `/sales/${String(link.metadata?.saleId)}/payments/${link.remoteId}`),
        { method: 'DELETE', query: { description: 'Deleted in Torqvoice' } }
      )
    } catch (err) {
      if (!isNotFound(err)) throw err
    }
    await ctx.links.remove(PAYMENT_ENTITY, paymentId)
    await forgetPayment(ctx, slug, serviceRecordId, link.remoteId)
    return { summary: 'payment deleted' }
  }
  if (link) return { summary: 'unchanged' }
  if (!settings.pushPayments) return { summary: 'payments not sent' }

  // The payment needs its sale in Fiken first; pushing the invoice also
  // records every payment on it, this one included.
  const outcome = await pushInvoice(ctx, p.serviceRecordId)
  if (await linkFor(ctx, slug, PAYMENT_ENTITY, paymentId)) return { summary: 'payment recorded' }
  return { summary: `payment not recorded: ${outcome.summary ?? 'invoice not in Fiken'}` }
}

/* ---------- customers on edit ---------- */

async function pushCustomer(ctx: ConnectorContext, customerId: string): Promise<JobOutcome> {
  const slug = settingsOf(ctx).companySlug
  if (!slug) return { summary: NO_COMPANY }
  const link = await linkFor(ctx, slug, CUSTOMER_ENTITY, customerId)
  // Customers reach Fiken with their first invoice; an edit before that is nothing yet.
  if (!link) return { summary: 'not in Fiken yet' }
  const c = await loadCustomerForAccounting(ctx.connection.organizationId, customerId)
  if (!c) return { summary: 'customer gone' }
  await ensureContact(ctx, slug, c)
  return { summary: 'customer updated' }
}

/* ---------- pull ---------- */

function dayBefore(day: string): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10)
}

/**
 * Payments recorded in Fiken against sales this app sent are recorded here,
 * and ones removed there are removed again. Fiken dates a change by the day,
 * so every pull reads the sales changed since the day before the last one;
 * what was already brought back is recognised and skipped.
 */
async function pullChanges(ctx: ConnectorContext): Promise<JobOutcome> {
  const settings = settingsOf(ctx)
  if (!settings.pullPayments) return { summary: 'pull switched off' }
  const slug = settings.companySlug
  if (!slug) return { summary: NO_COMPANY }
  const today = new Date().toISOString().slice(0, 10)
  const since = dayBefore(stateOf(ctx).lastPullDay ?? today)
  const sales = await list<FikenSale>(ctx, companyPath(slug, '/sales'), { lastModifiedGe: since })
  const known = await ctx.links.remoteIds(PAYMENT_ENTITY)
  const orgId = ctx.connection.organizationId

  let recorded = 0
  let removed = 0
  let unlinked = 0
  for (const sale of sales) {
    const saleId = String(sale.saleId)
    const invoiceLink = await remoteLinkFor(ctx, slug, INVOICE_ENTITY, saleId)
    if (!invoiceLink) continue
    const number = String(invoiceLink.metadata?.saleNumber ?? saleId)
    if (sale.deleted) {
      await ctx.links.remove(INVOICE_ENTITY, invoiceLink.entityId)
      await ctx.log(
        'warn',
        `Sale ${number} was deleted in Fiken; it will be entered again if the invoice is edited here`
      )
      unlinked++
      continue
    }

    const there = new Set(
      (sale.salePayments ?? []).filter((p) => p.paymentId).map((p) => String(p.paymentId))
    )
    let onSale = paymentIdsOn(invoiceLink)
    for (const id of onSale.filter((x) => !there.has(x))) {
      const link = await remoteLinkFor(ctx, slug, PAYMENT_ENTITY, id)
      if (link?.metadata?.createdByUs === true) {
        await ctx.log('warn', `A payment on sale ${number} was deleted in Fiken; it is kept here`)
        await ctx.links.remove(PAYMENT_ENTITY, link.entityId)
      } else if (link) {
        if (await removePulledPayment(orgId, link.entityId, PROVIDER)) removed++
        await ctx.links.remove(PAYMENT_ENTITY, link.entityId)
      }
      known.delete(id)
    }
    onSale = onSale.filter((x) => there.has(x))

    for (const p of sale.salePayments ?? []) {
      if (!p.paymentId || !(p.amount > 0)) continue
      const id = String(p.paymentId)
      if (known.has(id)) continue
      const made = await recordPulledPayment(orgId, {
        serviceRecordId: invoiceLink.entityId,
        amount: fromCents(p.amount),
        date: new Date(`${p.date}T12:00:00Z`),
        method: localPaymentMethod(p.account),
        provider: PROVIDER,
        externalId: id,
        note: 'Recorded in Fiken',
      })
      if (!made) continue
      await ctx.links.set(PAYMENT_ENTITY, made.id, {
        remoteId: id,
        metadata: {
          company: slug,
          createdByUs: false,
          serviceRecordId: invoiceLink.entityId,
          saleId,
        },
      })
      known.add(id)
      onSale.push(id)
      if (made.created) recorded++
    }
    await patchLink(ctx, INVOICE_ENTITY, invoiceLink.entityId, invoiceLink, { payments: onSale })
  }

  await ctx.saveState({ lastPullDay: today })
  const parts = [
    recorded ? `${recorded} payments recorded` : null,
    removed ? `${removed} payments removed` : null,
    unlinked ? `${unlinked} sales unlinked` : null,
  ].filter(Boolean)
  return { summary: parts.length ? parts.join(', ') : 'no changes' }
}

/* ---------- connector ---------- */

function entityId(payload: Record<string, unknown>): string | null {
  return typeof payload.entityId === 'string' ? payload.entityId : null
}

export const connector: ConnectorServer = {
  manifest,
  /**
   * The person who gave access. Which of their companies to write to is a
   * setting, because Fiken names none on the way back from the consent page.
   */
  async identify(ctx) {
    const user = await read<FikenUser>(ctx, '/user')
    const who = user.email ?? user.name ?? ctx.connection.id
    return {
      id: `fiken-${createHash('sha256').update(who).digest('hex').slice(0, 16)}`,
      name: user.name ?? user.email ?? 'Fiken',
    }
  },
  async test(ctx) {
    try {
      await read<FikenUser>(ctx, '/user')
      const slug = settingsOf(ctx).companySlug
      if (!slug) return { ok: true }
      const company = await read<FikenCompany>(ctx, companyPath(slug, ''))
      if (company.hasApiAccess === false && company.testCompany !== true) {
        return {
          ok: false,
          message: `The API module is not activated for ${company.name ?? slug} in Fiken. Activate it under Foretak, Tilleggstjenester.`,
        }
      }
      return { ok: true }
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : String(err) }
    }
  },
  remoteOptions: {
    async companies(ctx) {
      const companies = await list<FikenCompany>(ctx, '/companies')
      return companies
        .sort((a, b) => (a.name ?? a.slug).localeCompare(b.name ?? b.slug))
        .map((c) => ({
          value: c.slug,
          label: [c.name ?? c.slug, c.organizationNumber].filter(Boolean).join(', '),
        }))
    },
    /** Class 3 of the chart of accounts: sales income. */
    async incomeAccounts(ctx) {
      const slug = settingsOf(ctx).companySlug
      if (!slug) return []
      const accounts = await read<FikenAccount[]>(ctx, companyPath(slug, '/accounts'), {
        fromAccount: '3000',
        toAccount: '3999',
      })
      return accounts
        .sort((a, b) => a.code.localeCompare(b.code))
        .map((a) => ({ value: a.code, label: a.name ? `${a.code} ${a.name}` : a.code }))
    },
    async paymentAccounts(ctx) {
      const slug = settingsOf(ctx).companySlug
      if (!slug) return []
      const accounts = await list<FikenBankAccount>(ctx, companyPath(slug, '/bankAccounts'), {
        inactive: 'false',
      })
      return accounts.map((a) => ({
        value: a.accountCode,
        label: a.name ? `${a.name} (${a.accountCode})` : a.accountCode,
      }))
    },
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
  /** Hand the grant back so the person's Fiken account stops listing the app. */
  async onDisconnect(ctx) {
    try {
      await ctx.http.fetch(REVOKE_URL, { method: 'POST' })
    } catch (err) {
      await ctx.log('warn', `Could not revoke the Fiken token: ${String(err)}`)
    }
  },
}
