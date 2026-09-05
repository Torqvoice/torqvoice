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
  loadPaymentForAccounting,
  recordPulledPayment,
  removePulledPayment,
  workshopCurrency,
} from '@/features/integrations/Lib/accounting-sync'
import { oauthSpec, resolveClient } from '@/features/integrations/Lib/oauth'
import {
  ConnectorHttpError,
  type ConnectorContext,
  type ConnectorServer,
  type JobOutcome,
} from '@/features/integrations/Lib/types'
import { zonedDayKey } from '@/lib/timezone'
import { manifest } from './manifest'
import {
  DEFAULT_ITEM_NAMES,
  DUPLICATE_DOCNUMBER_CODE,
  DUPLICATE_NAME_CODE,
  type Environment,
  MINOR_VERSION,
  NOTE_MARK,
  NOT_FOUND_CODE,
  type QboAccount,
  type QboCustomer,
  type QboInvoice,
  type QboItem,
  type QboPayment,
  type QboTaxCode,
  REVOKE_URL,
  WALK_IN_NAME,
  apiHost,
  buildCustomer,
  buildInvoice,
  buildPayment,
  checksumOf,
  customerDisplayName,
  customerUrl,
  faultCode,
  faultMessage,
  invoiceUrl,
  localPaymentMethod,
  paymentUrl,
  round2,
  sqlString,
} from './mapping'

const PROVIDER = 'quickbooks'
/** Change data capture reaches back at most a month. */
const CDC_MAX_DAYS = 30
/**
 * The two pseudo tax codes of a US company under automated sales tax. They
 * are what a line carries there; the rate itself comes from the customer's
 * address. They are not TaxCode rows, so they are offered and defaulted here.
 */
const US_TAXABLE = 'TAX'
const US_NON_TAXABLE = 'NON'
const US_TAX_CODES = [
  { value: US_TAXABLE, label: 'TAX (taxable)' },
  { value: US_NON_TAXABLE, label: 'NON (not taxable)' },
]

/** Ledger and workshop totals may differ by rounding; beyond this the tax code is wrong. */
const TOTAL_TOLERANCE = 0.05

class QboError extends Error {
  status: number
  code: string | null
  constructor(status: number, body: string) {
    super(`QuickBooks: ${faultMessage(body)}`)
    this.status = status
    this.code = faultCode(body)
  }
}

interface State {
  realmId: string
  environment: Environment
  country: string | null
  homeCurrency: string | null
  multiCurrency: boolean
  /** Whether the company lets a transaction carry its own number; without it DocNumber is ignored. */
  customTxnNumbers: boolean
  defaultItems: Partial<Record<'labor' | 'part', string>>
  walkInCustomerId: string | null
  lastPullAt: string | null
}

function stateOf(ctx: ConnectorContext): State {
  const s = ctx.connection.state
  return {
    realmId: typeof s.realmId === 'string' ? s.realmId : '',
    environment: s.environment === 'sandbox' ? 'sandbox' : 'production',
    country: typeof s.country === 'string' ? s.country : null,
    homeCurrency: typeof s.homeCurrency === 'string' ? s.homeCurrency : null,
    multiCurrency: s.multiCurrency === true,
    customTxnNumbers: s.customTxnNumbers !== false,
    defaultItems: (s.defaultItems as State['defaultItems']) ?? {},
    walkInCustomerId: typeof s.walkInCustomerId === 'string' ? s.walkInCustomerId : null,
    lastPullAt: typeof s.lastPullAt === 'string' ? s.lastPullAt : null,
  }
}

function settingsOf(ctx: ConnectorContext) {
  const s = ctx.connection.settings
  const str = (k: string) => (typeof s[k] === 'string' && (s[k] as string).trim()) || null
  const startDate = str('startDate')
  return {
    pushInvoices: s.pushInvoices !== false,
    pushOnComplete: s.pushOnComplete === true,
    startDate: startDate && /^\d{4}-\d{2}-\d{2}$/.test(startDate) ? startDate : null,
    includeVehicle: s.includeVehicle !== false,
    laborItemId: str('laborItemId'),
    partsItemId: str('partsItemId'),
    taxCodeId: str('taxCodeId'),
    zeroTaxCodeId: str('zeroTaxCodeId'),
    pushPayments: s.pushPayments !== false,
    depositAccountId: str('depositAccountId'),
    manualPaidAsPayment: s.manualPaidAsPayment === true,
    pullPayments: s.pullPayments !== false,
  }
}

function realmOf(ctx: ConnectorContext): string {
  const realm = stateOf(ctx).realmId
  if (!realm) throw new Error('No QuickBooks company on this connection; reconnect')
  return realm
}

/**
 * One call to the company API. QuickBooks answers XML unless asked for
 * JSON, and reports every failure as a Fault body, including "not found",
 * which arrives as a 400 with code 610.
 */
async function api<T>(
  ctx: ConnectorContext,
  path: string,
  init: { method?: string; body?: unknown; query?: Record<string, string>; env?: Environment } = {}
): Promise<T> {
  const state = stateOf(ctx)
  const url = new URL(
    `${apiHost(init.env ?? state.environment)}/v3/company/${realmOf(ctx)}/${path}`
  )
  url.searchParams.set('minorversion', MINOR_VERSION)
  for (const [k, v] of Object.entries(init.query ?? {})) url.searchParams.set(k, v)
  try {
    return await ctx.http.json<T>(url.toString(), {
      method: init.method ?? (init.body ? 'POST' : 'GET'),
      headers: { Accept: 'application/json' },
      ...(init.body !== undefined && { body: JSON.stringify(init.body) }),
    })
  } catch (err) {
    if (err instanceof ConnectorHttpError) throw new QboError(err.status, err.body)
    throw err
  }
}

async function query<T>(ctx: ConnectorContext, entity: string, sql: string): Promise<T[]> {
  const res = await api<{ QueryResponse?: Record<string, T[] | undefined> }>(ctx, 'query', {
    query: { query: sql },
  })
  return res.QueryResponse?.[entity] ?? []
}

function isNotFound(err: unknown): boolean {
  return err instanceof QboError && (err.code === NOT_FOUND_CODE || err.status === 404)
}

/* ---------- company ---------- */

interface CompanyInfo {
  CompanyInfo: { CompanyName?: string; Country?: string }
}

interface Preferences {
  Preferences: {
    CurrencyPrefs?: { HomeCurrency?: { value?: string }; MultiCurrencyEnabled?: boolean }
    SalesFormsPrefs?: { CustomTxnNumbers?: boolean }
  }
}

async function readCompany(ctx: ConnectorContext, env: Environment) {
  const realm = realmOf(ctx)
  const info = await api<CompanyInfo>(ctx, `companyinfo/${realm}`, { env })
  const prefs = await api<Preferences>(ctx, 'preferences', { env })
  return {
    name: info.CompanyInfo.CompanyName ?? realm,
    country: info.CompanyInfo.Country ?? null,
    homeCurrency: prefs.Preferences.CurrencyPrefs?.HomeCurrency?.value ?? null,
    multiCurrency: prefs.Preferences.CurrencyPrefs?.MultiCurrencyEnabled === true,
    customTxnNumbers: prefs.Preferences.SalesFormsPrefs?.CustomTxnNumbers === true,
  }
}

/* ---------- customers ---------- */

async function walkInCustomer(ctx: ConnectorContext): Promise<string> {
  const state = stateOf(ctx)
  if (state.walkInCustomerId) return state.walkInCustomerId
  const found = await query<QboCustomer>(
    ctx,
    'Customer',
    `select Id, DisplayName from Customer where DisplayName = ${sqlString(WALK_IN_NAME)}`
  )
  let id = found[0]?.Id
  if (!id) {
    const created = await api<{ Customer: QboCustomer }>(ctx, 'customer', {
      body: { DisplayName: WALK_IN_NAME },
    })
    id = created.Customer.Id
  }
  await ctx.saveState({ walkInCustomerId: id })
  return id
}

async function createCustomer(ctx: ConnectorContext, c: AccountingCustomer): Promise<QboCustomer> {
  const name = customerDisplayName(c)
  // A customer's currency is set once, at creation, and every invoice for
  // them must match it, so a multi-currency company gets the workshop's.
  const currency = await currencyFor(ctx)
  try {
    const res = await api<{ Customer: QboCustomer }>(ctx, 'customer', {
      body: buildCustomer(c, name, { currency }),
    })
    return res.Customer
  } catch (err) {
    if (!(err instanceof QboError && err.code === DUPLICATE_NAME_CODE)) throw err
    // A vendor or employee already holds that name; the customer number tells them apart.
    const suffix = c.customerNumber ?? c.id.slice(-4)
    const res = await api<{ Customer: QboCustomer }>(ctx, 'customer', {
      body: buildCustomer(c, `${name} (${suffix})`.slice(0, 500), { currency }),
    })
    return res.Customer
  }
}

/**
 * The ledger's id for a customer, creating or updating as needed. A
 * customer already in the ledger under the same display name is reused
 * rather than duplicated, and left as the bookkeeper has it until the
 * workshop edits the record here.
 */
async function ensureCustomer(
  ctx: ConnectorContext,
  c: AccountingCustomer | null
): Promise<{ id: string; email: string | null; taxExempt: boolean }> {
  if (!c) return { id: await walkInCustomer(ctx), email: null, taxExempt: false }
  const env = stateOf(ctx).environment
  const name = customerDisplayName(c)
  const checksum = checksumOf(buildCustomer(c, name))
  const link = await ctx.links.get(CUSTOMER_ENTITY, c.id)
  if (link) {
    if (link.checksum === checksum)
      return { id: link.remoteId, email: c.email, taxExempt: c.taxExempt }
    try {
      const current = await api<{ Customer: QboCustomer }>(ctx, `customer/${link.remoteId}`)
      const res = await api<{ Customer: QboCustomer }>(ctx, 'customer', {
        body: {
          ...buildCustomer(c, current.Customer.DisplayName),
          Id: current.Customer.Id,
          SyncToken: current.Customer.SyncToken,
          sparse: true,
        },
      })
      await ctx.links.set(CUSTOMER_ENTITY, c.id, {
        remoteId: res.Customer.Id,
        remoteUrl: customerUrl(env, res.Customer.Id),
        checksum,
      })
      return { id: res.Customer.Id, email: c.email, taxExempt: c.taxExempt }
    } catch (err) {
      if (!isNotFound(err)) throw err
      await ctx.links.remove(CUSTOMER_ENTITY, c.id)
    }
  }
  const existing = await query<QboCustomer>(
    ctx,
    'Customer',
    `select Id, DisplayName from Customer where DisplayName = ${sqlString(name)}`
  )
  const remote = existing[0] ?? (await createCustomer(ctx, c))
  await ctx.links.set(CUSTOMER_ENTITY, c.id, {
    remoteId: remote.Id,
    remoteUrl: customerUrl(env, remote.Id),
    checksum,
    metadata: { reused: Boolean(existing[0]) },
  })
  return { id: remote.Id, email: c.email, taxExempt: c.taxExempt }
}

/* ---------- items ---------- */

/**
 * The service item a line is booked to. The workshop can point at its own
 * items; otherwise one named Labour or Parts is found or created under the
 * company's income account, once, and remembered.
 */
async function ensureItem(ctx: ConnectorContext, kind: 'labor' | 'part'): Promise<string> {
  const settings = settingsOf(ctx)
  const chosen = kind === 'labor' ? settings.laborItemId : settings.partsItemId
  if (chosen) return chosen
  const state = stateOf(ctx)
  const remembered = state.defaultItems[kind]
  if (remembered) return remembered
  const name = DEFAULT_ITEM_NAMES[kind]
  const found = await query<QboItem>(
    ctx,
    'Item',
    `select Id, Name from Item where Name = ${sqlString(name)}`
  )
  let id = found[0]?.Id
  if (!id) {
    const accounts = await query<QboAccount>(
      ctx,
      'Account',
      "select Id, Name, AccountSubType from Account where AccountType = 'Income' and Active = true maxresults 50"
    )
    const preferred = kind === 'labor' ? 'ServiceFeeIncome' : 'SalesOfProductIncome'
    const account = accounts.find((a) => a.AccountSubType === preferred) ?? accounts[0]
    if (!account) throw new Error('QuickBooks has no income account to book sales to')
    const created = await api<{ Item: QboItem }>(ctx, 'item', {
      body: { Name: name, Type: 'Service', IncomeAccountRef: { value: account.Id } },
    })
    id = created.Item.Id
    await ctx.log('info', `Created item "${name}" under ${account.Name}`)
  }
  await ctx.saveState({ defaultItems: { ...state.defaultItems, [kind]: id } })
  return id
}

/* ---------- invoices ---------- */

/**
 * The currency to put on a transaction: required by QuickBooks whenever the
 * company runs multi-currency, and otherwise not accepted. A workshop that
 * bills in another currency than a single-currency company keeps its
 * numbers, booked in the company's currency, with a warning in the log.
 */
async function currencyFor(ctx: ConnectorContext): Promise<string | null> {
  const state = stateOf(ctx)
  const ours = await workshopCurrency(ctx.connection.organizationId)
  if (state.multiCurrency) return ours ?? state.homeCurrency
  if (ours && state.homeCurrency && ours !== state.homeCurrency) {
    await ctx.log(
      'warn',
      `Workshop bills in ${ours} but the QuickBooks company keeps ${state.homeCurrency} and multi-currency is off; amounts are booked as ${state.homeCurrency}`
    )
  }
  return null
}

/** Why the invoice stays out of the ledger, or null when it goes. */
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
  return null
}

/** The record is gone: void the ledger's copy unless money was taken against it. */
async function retireInvoice(ctx: ConnectorContext, serviceRecordId: string): Promise<JobOutcome> {
  const link = await ctx.links.get(INVOICE_ENTITY, serviceRecordId)
  if (!link) return { summary: 'nothing to do' }
  try {
    const current = await api<{ Invoice: QboInvoice }>(ctx, `invoice/${link.remoteId}`)
    const inv = current.Invoice
    if ((inv.Balance ?? 0) < (inv.TotalAmt ?? 0)) {
      await ctx.log(
        'warn',
        `Invoice ${inv.DocNumber ?? inv.Id} was deleted here but has payments in QuickBooks; left as is`
      )
      await ctx.links.remove(INVOICE_ENTITY, serviceRecordId)
      return { summary: 'left in QuickBooks, has payments' }
    }
    await api(ctx, 'invoice', {
      query: { operation: 'void' },
      body: { Id: inv.Id, SyncToken: inv.SyncToken },
    })
    await ctx.links.remove(INVOICE_ENTITY, serviceRecordId)
    return { summary: `invoice ${inv.DocNumber ?? inv.Id} voided` }
  } catch (err) {
    if (!isNotFound(err)) throw err
    await ctx.links.remove(INVOICE_ENTITY, serviceRecordId)
    return { summary: 'already gone from QuickBooks' }
  }
}

async function pushInvoice(ctx: ConnectorContext, serviceRecordId: string): Promise<JobOutcome> {
  const settings = settingsOf(ctx)
  const state = stateOf(ctx)
  const inv = await loadInvoiceForAccounting(ctx.connection.organizationId, serviceRecordId)
  if (!inv) return retireInvoice(ctx, serviceRecordId)
  const skip = whyNotEligible(inv, settings, ctx.timezone)
  if (skip) return { summary: skip }

  const customer = await ensureCustomer(ctx, inv.customer)
  const hasLabor = inv.lines.some((l) => l.kind === 'labor')
  const hasParts = inv.lines.some((l) => l.kind === 'part')
  const body = buildInvoice(inv, {
    customerRef: customer.id,
    customerEmail: customer.email,
    laborItemId: hasLabor ? await ensureItem(ctx, 'labor') : null,
    partsItemId: hasParts ? await ensureItem(ctx, 'part') : null,
    taxCodeId: settings.taxCodeId ?? (state.country === 'US' ? US_TAXABLE : null),
    zeroTaxCodeId: settings.zeroTaxCodeId ?? (state.country === 'US' ? US_NON_TAXABLE : null),
    globalTax: state.country !== 'US',
    currency: await currencyFor(ctx),
    timezone: ctx.timezone,
    url: appInvoiceUrl(ctx.appUrl, inv),
    taxExempt: customer.taxExempt,
    includeVehicle: settings.includeVehicle,
    customTxnNumbers: state.customTxnNumbers,
  })
  const checksum = checksumOf(body)
  const link = await ctx.links.get(INVOICE_ENTITY, serviceRecordId)

  let saved: QboInvoice | null = null
  let action = 'unchanged'
  if (!link || link.checksum !== checksum) {
    if (link) {
      try {
        const current = await api<{ Invoice: QboInvoice }>(ctx, `invoice/${link.remoteId}`)
        const res = await api<{ Invoice: QboInvoice }>(ctx, 'invoice', {
          body: {
            ...body,
            Id: current.Invoice.Id,
            SyncToken: current.Invoice.SyncToken,
            sparse: true,
          },
        })
        saved = res.Invoice
        action = 'updated'
      } catch (err) {
        if (!isNotFound(err)) throw err
        await ctx.links.remove(INVOICE_ENTITY, serviceRecordId)
      }
    }
    if (!saved) {
      saved = await createInvoice(ctx, body, inv)
      action = 'created'
    }
    await ctx.links.set(INVOICE_ENTITY, serviceRecordId, {
      remoteId: saved.Id,
      remoteUrl: invoiceUrl(state.environment, saved.Id),
      checksum,
      metadata: { docNumber: saved.DocNumber ?? null, customerId: customer.id },
    })
    const theirs = saved.TotalAmt ?? 0
    if (Math.abs(theirs - inv.totalAmount) > TOTAL_TOLERANCE) {
      await ctx.log(
        'warn',
        `Invoice ${inv.invoiceNumber}: QuickBooks total ${round2(theirs)} differs from ${round2(inv.totalAmount)} here; check the tax codes in the integration settings`,
        { quickbooks: theirs, torqvoice: inv.totalAmount }
      )
    }
  }

  let paymentsPushed = 0
  if (settings.pushPayments) {
    for (const p of inv.payments) {
      if (await ctx.links.get(PAYMENT_ENTITY, p.id)) continue
      await pushPaymentRow(ctx, p, customer.id)
      paymentsPushed++
    }
    if (settings.manualPaidAsPayment && inv.manuallyPaid) {
      if (await settleByHand(ctx, inv, customer.id, saved)) paymentsPushed++
    }
  }
  const summary = `invoice ${inv.invoiceNumber} ${action}`
  return { summary: paymentsPushed ? `${summary}, ${paymentsPushed} payments recorded` : summary }
}

/**
 * A new invoice in the ledger. A duplicate document number means either the
 * ledger already holds this invoice from an earlier push whose link was
 * lost, which is then adopted, or the workshop reused a number, which is
 * allowed through and logged so the bookkeeper hears about it.
 */
async function createInvoice(
  ctx: ConnectorContext,
  body: Record<string, unknown>,
  inv: AccountingInvoice
): Promise<QboInvoice> {
  try {
    const res = await api<{ Invoice: QboInvoice }>(ctx, 'invoice', { body })
    return res.Invoice
  } catch (err) {
    if (!(err instanceof QboError && err.code === DUPLICATE_DOCNUMBER_CODE)) throw err
    const docNumber = typeof body.DocNumber === 'string' ? body.DocNumber : ''
    const found = await query<QboInvoice>(
      ctx,
      'Invoice',
      `select Id, SyncToken, DocNumber, PrivateNote from Invoice where DocNumber = ${sqlString(docNumber)}`
    )
    const ours = found.find((i) => i.PrivateNote?.startsWith(NOTE_MARK))
    if (ours) {
      await ctx.log('info', `Invoice ${docNumber} was already in QuickBooks; linked to it`)
      const res = await api<{ Invoice: QboInvoice }>(ctx, 'invoice', {
        body: { ...body, Id: ours.Id, SyncToken: ours.SyncToken, sparse: true },
      })
      return res.Invoice
    }
    await ctx.log(
      'warn',
      `QuickBooks already has an invoice numbered ${docNumber} that did not come from Torqvoice; invoice ${inv.invoiceNumber} was added beside it`
    )
    const res = await api<{ Invoice: QboInvoice }>(ctx, 'invoice', {
      body,
      query: { include: 'allowduplicatedocnum' },
    })
    return res.Invoice
  }
}

/**
 * An invoice marked paid by hand has no payment row here, so the ledger
 * would show it open forever. When the workshop asks for it, one payment
 * for whatever the ledger still shows as owed closes it, once.
 */
async function settleByHand(
  ctx: ConnectorContext,
  inv: AccountingInvoice,
  customerRef: string,
  saved: QboInvoice | null
): Promise<boolean> {
  const entityId = `manual:${inv.id}`
  if (await ctx.links.get(PAYMENT_ENTITY, entityId)) return false
  const invoiceLink = await ctx.links.get(INVOICE_ENTITY, inv.id)
  if (!invoiceLink) return false
  let balance = saved?.Balance
  if (balance === undefined) {
    const current = await api<{ Invoice: QboInvoice }>(ctx, `invoice/${invoiceLink.remoteId}`)
    balance = current.Invoice.Balance ?? 0
  }
  if (!(balance > 0)) return false
  const settings = settingsOf(ctx)
  const state = stateOf(ctx)
  const body = buildPayment(
    {
      id: entityId,
      serviceRecordId: inv.id,
      amount: balance,
      date: inv.issuedAt ?? new Date(),
      method: 'other',
      note: 'Marked as paid by hand in Torqvoice',
      provider: null,
      externalId: null,
    },
    {
      customerRef,
      invoiceRemoteId: invoiceLink.remoteId,
      depositAccountId: settings.depositAccountId,
      currency: await currencyFor(ctx),
      timezone: ctx.timezone,
    }
  )
  const res = await api<{ Payment: QboPayment }>(ctx, 'payment', { body })
  await ctx.links.set(PAYMENT_ENTITY, entityId, {
    remoteId: res.Payment.Id,
    remoteUrl: paymentUrl(state.environment, res.Payment.Id),
    metadata: { createdByUs: true, serviceRecordId: inv.id, manual: true },
  })
  return true
}

/* ---------- payments ---------- */

async function pushPaymentRow(
  ctx: ConnectorContext,
  p: AccountingPayment,
  customerRef: string
): Promise<void> {
  const settings = settingsOf(ctx)
  const state = stateOf(ctx)
  const invoiceLink = await ctx.links.get(INVOICE_ENTITY, p.serviceRecordId)
  if (!invoiceLink) return
  const body = buildPayment(p, {
    customerRef,
    invoiceRemoteId: invoiceLink.remoteId,
    depositAccountId: settings.depositAccountId,
    currency: await currencyFor(ctx),
    timezone: ctx.timezone,
  })
  const res = await api<{ Payment: QboPayment }>(ctx, 'payment', { body })
  await ctx.links.set(PAYMENT_ENTITY, p.id, {
    remoteId: res.Payment.Id,
    remoteUrl: paymentUrl(state.environment, res.Payment.Id),
    metadata: { createdByUs: true, serviceRecordId: p.serviceRecordId },
  })
}

async function pushPayment(ctx: ConnectorContext, paymentId: string): Promise<JobOutcome> {
  const settings = settingsOf(ctx)
  const p = await loadPaymentForAccounting(ctx.connection.organizationId, paymentId)
  const link = await ctx.links.get(PAYMENT_ENTITY, paymentId)
  if (!p) {
    if (!link) return { summary: 'nothing to do' }
    if (link.metadata?.createdByUs !== true) {
      // A payment the ledger made and this app then deleted stays in the ledger.
      await ctx.links.remove(PAYMENT_ENTITY, paymentId)
      return { summary: 'payment came from QuickBooks; left there' }
    }
    try {
      const current = await api<{ Payment: QboPayment }>(ctx, `payment/${link.remoteId}`)
      await api(ctx, 'payment', {
        query: { operation: 'delete' },
        body: { Id: current.Payment.Id, SyncToken: current.Payment.SyncToken },
      })
    } catch (err) {
      if (!isNotFound(err)) throw err
    }
    await ctx.links.remove(PAYMENT_ENTITY, paymentId)
    return { summary: 'payment deleted' }
  }
  if (link) return { summary: 'unchanged' }
  if (!settings.pushPayments) return { summary: 'payments not sent' }

  // The payment needs its invoice in the ledger first; pushing the invoice
  // also records every payment on it, this one included.
  const outcome = await pushInvoice(ctx, p.serviceRecordId)
  if (await ctx.links.get(PAYMENT_ENTITY, paymentId)) return { summary: 'payment recorded' }
  return { summary: `payment not recorded: ${outcome.summary ?? 'invoice not in QuickBooks'}` }
}

/* ---------- customers on edit ---------- */

async function pushCustomer(ctx: ConnectorContext, customerId: string): Promise<JobOutcome> {
  const link = await ctx.links.get(CUSTOMER_ENTITY, customerId)
  // Customers reach the ledger with their first invoice; an edit before that is nothing yet.
  if (!link) return { summary: 'not in QuickBooks yet' }
  const c = await loadCustomerForAccounting(ctx.connection.organizationId, customerId)
  if (!c) return { summary: 'customer gone' }
  await ensureCustomer(ctx, c)
  return { summary: 'customer updated' }
}

/* ---------- pull ---------- */

interface CdcResponse {
  CDCResponse?: { QueryResponse?: { Payment?: QboPayment[]; Invoice?: QboInvoice[] }[] }[]
}

function cdcSince(state: State): Date {
  const floor = Date.now() - CDC_MAX_DAYS * 86_400_000
  const last = state.lastPullAt ? Date.parse(state.lastPullAt) : Number.NaN
  const start = Number.isFinite(last) ? last : Date.now() - 86_400_000
  // A minute of overlap so a change landing during the last pull is not missed.
  return new Date(Math.max(floor, start - 60_000))
}

/**
 * Payments taken in QuickBooks against invoices this app issued are recorded
 * here, and ones deleted there are removed again. Invoices deleted in the
 * ledger lose their link, so the next edit here recreates them.
 */
async function pullChanges(ctx: ConnectorContext): Promise<JobOutcome> {
  const settings = settingsOf(ctx)
  if (!settings.pullPayments) return { summary: 'pull switched off' }
  const state = stateOf(ctx)
  const startedAt = new Date()
  const since = cdcSince(state)
  const res = await api<CdcResponse>(ctx, 'cdc', {
    query: {
      entities: 'Payment,Invoice',
      changedSince: since.toISOString().replace(/\.\d{3}Z$/, 'Z'),
    },
  })
  const responses = res.CDCResponse?.flatMap((r) => r.QueryResponse ?? []) ?? []
  const payments = responses.flatMap((r) => r.Payment ?? [])
  const invoices = responses.flatMap((r) => r.Invoice ?? [])
  const known = await ctx.links.remoteIds(PAYMENT_ENTITY)
  const orgId = ctx.connection.organizationId

  let recorded = 0
  let removed = 0
  for (const p of payments) {
    if (p.status === 'Deleted') {
      const link = await ctx.links.byRemoteId(PAYMENT_ENTITY, p.Id)
      if (!link) continue
      if (link.metadata?.createdByUs === true) {
        await ctx.log('warn', `Payment ${p.Id} was deleted in QuickBooks; the payment here is kept`)
        await ctx.links.remove(PAYMENT_ENTITY, link.entityId)
        continue
      }
      if (await removePulledPayment(orgId, link.entityId, PROVIDER)) removed++
      await ctx.links.remove(PAYMENT_ENTITY, link.entityId)
      continue
    }
    if (known.has(p.Id)) continue
    for (const line of p.Line ?? []) {
      const txn = line.LinkedTxn?.find((t) => t.TxnType === 'Invoice')
      const amount = line.Amount ?? 0
      if (!txn || !(amount > 0)) continue
      const invoiceLink = await ctx.links.byRemoteId(INVOICE_ENTITY, txn.TxnId)
      if (!invoiceLink) continue
      const made = await recordPulledPayment(orgId, {
        serviceRecordId: invoiceLink.entityId,
        amount: round2(amount),
        date: p.TxnDate ? new Date(`${p.TxnDate}T12:00:00Z`) : new Date(),
        method: localPaymentMethod(p.PaymentMethodRef?.name),
        provider: PROVIDER,
        externalId: p.Id,
        note: [p.PaymentRefNum ? `Ref ${p.PaymentRefNum}` : null, 'Recorded in QuickBooks']
          .filter(Boolean)
          .join('. '),
      })
      if (!made) continue
      await ctx.links.set(PAYMENT_ENTITY, made.id, {
        remoteId: p.Id,
        remoteUrl: paymentUrl(state.environment, p.Id),
        metadata: { createdByUs: false, serviceRecordId: invoiceLink.entityId },
      })
      known.add(p.Id)
      if (made.created) recorded++
    }
  }

  let unlinked = 0
  for (const inv of invoices) {
    if (inv.status !== 'Deleted') continue
    const link = await ctx.links.byRemoteId(INVOICE_ENTITY, inv.Id)
    if (!link) continue
    await ctx.links.remove(INVOICE_ENTITY, link.entityId)
    await ctx.log(
      'warn',
      `Invoice ${inv.Id} was deleted in QuickBooks; it will be recreated if edited here`
    )
    unlinked++
  }

  await ctx.saveState({ lastPullAt: startedAt.toISOString() })
  const parts = [
    recorded ? `${recorded} payments recorded` : null,
    removed ? `${removed} payments removed` : null,
    unlinked ? `${unlinked} invoices unlinked` : null,
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
   * Development keys reach sandbox companies and production keys reach live
   * ones, on different hosts. Which kind of key this is shows in whether the
   * live host answers, so the environment is found here and kept.
   */
  async identify(ctx) {
    const realm = realmOf(ctx)
    let env: Environment = 'production'
    let company: Awaited<ReturnType<typeof readCompany>>
    try {
      company = await readCompany(ctx, env)
    } catch (err) {
      if (!(err instanceof QboError && err.status < 500)) throw err
      env = 'sandbox'
      company = await readCompany(ctx, env)
    }
    await ctx.saveState({
      environment: env,
      country: company.country,
      homeCurrency: company.homeCurrency,
      multiCurrency: company.multiCurrency,
      customTxnNumbers: company.customTxnNumbers,
    })
    if (!company.customTxnNumbers) {
      await ctx.log(
        'warn',
        'Custom transaction numbers are off in this QuickBooks company, so invoices there get QuickBooks numbers instead of the Torqvoice invoice numbers. Turn them on under Account and settings, Sales, Sales form content.'
      )
    }
    return { id: realm, name: env === 'sandbox' ? `${company.name} (sandbox)` : company.name }
  },
  async test(ctx) {
    try {
      await api<CompanyInfo>(ctx, `companyinfo/${realmOf(ctx)}`)
      return { ok: true }
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : String(err) }
    }
  },
  remoteOptions: {
    async items(ctx) {
      const items = await query<QboItem>(
        ctx,
        'Item',
        "select Id, Name, Type from Item where Active = true and Type in ('Service', 'NonInventory', 'Inventory') maxresults 1000"
      )
      return items
        .sort((a, b) => a.Name.localeCompare(b.Name))
        .map((i) => ({ value: i.Id, label: i.Type ? `${i.Name} (${i.Type})` : i.Name }))
    },
    async taxCodes(ctx) {
      const codes = await query<QboTaxCode>(
        ctx,
        'TaxCode',
        'select Id, Name, Taxable from TaxCode where Active = true maxresults 1000'
      )
      const listed = codes
        .sort((a, b) => a.Name.localeCompare(b.Name))
        .map((c) => ({ value: c.Id, label: c.Name }))
      // A US company runs automated sales tax: TAX and NON are the codes a
      // line carries, and the TaxCode query does not return them, only the
      // company's own rate codes.
      return stateOf(ctx).country === 'US' ? [...US_TAX_CODES, ...listed] : listed
    },
    async depositAccounts(ctx) {
      const accounts = await query<QboAccount>(
        ctx,
        'Account',
        "select Id, Name, AccountType from Account where AccountType in ('Bank', 'Other Current Asset') and Active = true maxresults 200"
      )
      return accounts
        .sort((a, b) => a.Name.localeCompare(b.Name))
        .map((a) => ({
          value: a.Id,
          label: a.AccountType ? `${a.Name} (${a.AccountType})` : a.Name,
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
  /** Hand the refresh token back so the company stops listing the app as connected. */
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
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({ token }),
      })
    } catch (err) {
      await ctx.log('warn', `Could not revoke the QuickBooks token: ${String(err)}`)
    }
  },
}
