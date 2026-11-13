import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  AccountingCustomer,
  AccountingInvoice,
  AccountingPayment,
} from '@/features/integrations/Lib/accounting-sync'
import {
  ConnectorHttpError,
  type ConnectorContext,
  type JobOutcome,
  type LinkRecord,
  type LogLevel,
} from '@/features/integrations/Lib/types'
import { buildContact, checksumOf, contactName } from '@/integrations/xero/mapping'
import { salesRates } from '@/integrations/xero/tax'

/**
 * The connector against a scripted Xero: every request it makes is recorded
 * and answered from here, so the URLs, headers and bodies that would reach
 * Xero are asserted without an organisation. The loaders that read this
 * app's database are replaced with fixtures.
 */

const loadInvoice = vi.fn<(orgId: string, id: string) => Promise<AccountingInvoice | null>>()
const loadPayment = vi.fn<(orgId: string, id: string) => Promise<AccountingPayment | null>>()
const loadCustomer = vi.fn<(orgId: string, id: string) => Promise<AccountingCustomer | null>>()
const recordPulledPayment = vi.fn()
const removePulledPayment = vi.fn()

vi.mock('@/features/integrations/Lib/accounting-sync', () => ({
  INVOICE_ENTITY: 'ServiceRecord',
  CUSTOMER_ENTITY: 'Customer',
  PAYMENT_ENTITY: 'Payment',
  invoiceUrl: (appUrl: string, inv: { id: string; vehicleId: string | null }) =>
    `${appUrl}/vehicles/${inv.vehicleId}/service/${inv.id}`,
  loadInvoiceForAccounting: (orgId: string, id: string) => loadInvoice(orgId, id),
  loadPaymentForAccounting: (orgId: string, id: string) => loadPayment(orgId, id),
  loadCustomerForAccounting: (orgId: string, id: string) => loadCustomer(orgId, id),
  loadInvoicePdfForAccounting: async () => ({
    buffer: new Uint8Array([37, 80, 68, 70]),
    filename: 'x.pdf',
  }),
  recordPulledPayment: (...args: unknown[]) => recordPulledPayment(...args),
  removePulledPayment: (...args: unknown[]) => removePulledPayment(...args),
  workshopCurrency: async () => 'AUD',
  workshopDistanceUnit: async () => 'km',
}))

const { connector } = await import('@/integrations/xero/server')

interface Call {
  method: string
  path: string
  query: Record<string, string>
  body: Record<string, unknown> | null
  headers: Record<string, string>
}

type Answer = (call: Call) => unknown

const API = '/api.xro/2.0'

function notFound(): ConnectorHttpError {
  return new ConnectorHttpError(404, '', 'https://api.xero.com/x')
}

function makeCtx(input: { settings?: Record<string, unknown>; answer: Answer }) {
  const calls: Call[] = []
  const uploads: { url: string; method: string; headers: Record<string, string> }[] = []
  const links = new Map<string, LinkRecord & { entityId: string; entityType: string }>()
  const logs: { level: LogLevel; message: string }[] = []
  const now = new Date().toISOString()
  const state: Record<string, unknown> = {
    org: {
      tenantId: 'tenant-1',
      fetchedAt: now,
      name: 'Demo Garage',
      shortCode: '!abc',
      baseCurrency: 'AUD',
      countryCode: 'AU',
      paysTax: true,
      paymentTerms: null,
      edition: 'BUSINESS',
    },
    catalog: {
      tenantId: 'tenant-1',
      fetchedAt: now,
      rates: salesRates([
        { Name: 'GST on Income', TaxType: 'OUTPUT', EffectiveRate: 10, Status: 'ACTIVE' },
        { Name: 'GST Free Income', TaxType: 'EXEMPTOUTPUT', EffectiveRate: 0, Status: 'ACTIVE' },
      ]),
      defaultSalesAccount: '200',
      bankAccountId: 'bank-1',
      items: [],
      tracking: [],
    },
  }
  const key = (t: string, e: string) => `${t}:${e}`
  const ctx: ConnectorContext = {
    connection: {
      id: 'conn1',
      organizationId: 'org1',
      connectorId: 'xero',
      settings: { tenantId: 'tenant-1', ...input.settings },
      state,
      externalAccountId: 'xero-abc',
    },
    credentials: { accessToken: 'tok', refreshToken: 'ref' },
    http: {
      async fetch(url: string, init?: RequestInit) {
        uploads.push({
          url,
          method: init?.method ?? 'GET',
          headers: Object.fromEntries(new Headers(init?.headers).entries()),
        })
        return new Response('{}', { status: 200 })
      },
      async json<T>(url: string, init?: RequestInit): Promise<T> {
        const u = new URL(url)
        const call: Call = {
          method: init?.method ?? 'GET',
          path: u.pathname,
          query: Object.fromEntries(u.searchParams.entries()),
          body: init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : null,
          headers: Object.fromEntries(new Headers(init?.headers).entries()),
        }
        calls.push(call)
        return input.answer(call) as T
      },
    },
    links: {
      async get(t, e) {
        return links.get(key(t, e)) ?? null
      },
      async set(t, e, link) {
        const prev = links.get(key(t, e))
        links.set(key(t, e), {
          entityType: t,
          entityId: e,
          remoteId: link.remoteId,
          remoteUrl: link.remoteUrl ?? prev?.remoteUrl ?? null,
          metadata: link.metadata === undefined ? (prev?.metadata ?? null) : link.metadata,
          checksum: link.checksum ?? prev?.checksum ?? null,
        })
      },
      async remove(t, e) {
        links.delete(key(t, e))
      },
      async remoteIds(t) {
        return new Set([...links.values()].filter((l) => l.entityType === t).map((l) => l.remoteId))
      },
      async byRemoteId(t, remoteId) {
        return (
          [...links.values()].find((l) => l.entityType === t && l.remoteId === remoteId) ?? null
        )
      },
    },
    async log(level, message) {
      logs.push({ level, message })
    },
    async saveState(patch) {
      Object.assign(state, patch)
    },
    timezone: 'Australia/Sydney',
    appUrl: 'https://shop.example.com',
  }
  return { ctx, calls, uploads, links, logs, state }
}

const customer: AccountingCustomer = {
  id: 'cus1',
  name: 'Anna Berg',
  email: 'anna@example.com',
  phone: null,
  address: null,
  company: null,
  taxId: null,
  taxExempt: false,
  customerNumber: 'C-0042',
}

const invoice: AccountingInvoice = {
  id: 'svc1',
  vehicleId: 'veh1',
  title: 'Brake service',
  invoiceNumber: 'INV-1001',
  status: 'completed',
  issuedAt: new Date('2026-11-04T01:00:00Z'),
  invoiceDate: new Date('2026-11-04T01:00:00Z'),
  serviceDate: new Date('2026-11-03T01:00:00Z'),
  dueDate: new Date('2026-11-18T01:00:00Z'),
  mileage: null,
  notes: null,
  subtotal: 330,
  taxableSubtotal: null,
  discountType: null,
  discountValue: 0,
  discountAmount: 0,
  taxRate: 10,
  taxAmount: 33,
  taxInclusive: false,
  totalAmount: 363,
  manuallyPaid: false,
  customer,
  vehicle: { year: 2018, make: 'Toyota', model: 'Corolla', licensePlate: 'ABC123' },
  lines: [
    {
      kind: 'labor',
      description: 'Brake service',
      partNumber: null,
      quantity: 2,
      unitPrice: 100,
      total: 200,
      taxable: true,
    },
    {
      kind: 'part',
      description: 'Brake pads',
      partNumber: 'BP-100',
      quantity: 1,
      unitPrice: 130,
      total: 130,
      taxable: true,
    },
  ],
  payments: [],
}

const cardPayment: AccountingPayment = {
  id: 'pay1',
  serviceRecordId: 'svc1',
  amount: 363,
  date: new Date('2026-11-05T01:00:00Z'),
  method: 'card',
  note: null,
  provider: null,
  externalId: null,
}

/** A Xero organisation that has none of this workshop yet and accepts everything. */
function emptyOrganisation(
  overrides: Partial<Record<string, (call: Call) => unknown>> = {}
): Answer {
  let payments = 0
  return (call) => {
    const route = `${call.method} ${call.path.replace(API, '')}`
    for (const [pattern, handler] of Object.entries(overrides)) {
      if (new RegExp(`^${pattern}$`).test(route)) return handler?.(call)
    }
    if (route.startsWith('GET /Contacts/')) throw notFound()
    if (route === 'GET /Contacts') return { Contacts: [] }
    if (route === 'PUT /Contacts') {
      const body = (call.body?.Contacts as Record<string, unknown>[])[0]
      return { Contacts: [{ ContactID: 'contact-new', Name: body.Name }] }
    }
    if (route === 'GET /Invoices') return { Invoices: [] }
    if (route === 'PUT /Invoices') {
      const body = (call.body?.Invoices as Record<string, unknown>[])[0]
      return {
        Invoices: [
          {
            InvoiceID: 'inv-new',
            InvoiceNumber: body.InvoiceNumber,
            Status: body.Status,
            Total: 363,
          },
        ],
      }
    }
    if (route.startsWith('GET /Invoices/'))
      return {
        Invoices: [
          { InvoiceID: 'inv-new', Status: 'AUTHORISED', Total: 363, AmountDue: 363, AmountPaid: 0 },
        ],
      }
    if (route.startsWith('POST /Invoices/')) {
      const body = (call.body?.Invoices as Record<string, unknown>[])[0]
      return { Invoices: [{ ...body, Total: 363 }] }
    }
    if (route === 'PUT /Payments') return { Payments: [{ PaymentID: `pmt-${++payments}` }] }
    if (route === 'GET /Payments') return { Payments: [] }
    throw new Error(`unexpected ${route}`)
  }
}

const api = (calls: Call[], method: string, path: string) =>
  calls.filter((c) => c.method === method && c.path === `${API}${path}`)

beforeEach(() => {
  loadInvoice.mockReset().mockResolvedValue(invoice)
  loadPayment.mockReset()
  loadCustomer.mockReset()
  recordPulledPayment.mockReset().mockResolvedValue({ id: 'local-pay', created: true })
  removePulledPayment.mockReset().mockResolvedValue(true)
})

afterEach(() => vi.useRealTimers())

describe('pushing an invoice', () => {
  it('makes the customer and the invoice in the chosen organisation, and files the PDF', async () => {
    const { ctx, calls, uploads, links } = makeCtx({ answer: emptyOrganisation() })
    const outcome = (await connector.jobs['accounting.invoice'](ctx, {
      entityId: 'svc1',
    })) as JobOutcome
    expect(outcome.summary).toBe('invoice INV-1001 created')

    // Every call names the organisation.
    expect(calls.every((c) => c.headers['xero-tenant-id'] === 'tenant-1')).toBe(true)
    // The contact is looked for by our code, email and name before one is made.
    expect(calls.slice(0, 4).map((c) => `${c.method} ${c.path.replace(API, '')}`)).toEqual([
      'GET /Contacts/TV-C-0042',
      'GET /Contacts',
      'GET /Contacts',
      'PUT /Contacts',
    ])
    expect(calls[1].query.where).toBe('EmailAddress=="anna@example.com"')
    expect(calls[3].query.summarizeErrors).toBe('true')

    const [put] = api(calls, 'PUT', '/Invoices')
    expect(put.query).toEqual({ unitdp: '4', summarizeErrors: 'true' })
    expect(put.headers['idempotency-key']).toMatch(/^tv-svc1-/)
    expect((put.body?.Invoices as Record<string, unknown>[])[0]).toMatchObject({
      Type: 'ACCREC',
      Contact: { ContactID: 'contact-new' },
      InvoiceNumber: 'INV-1001',
      Reference: 'ABC123 Toyota Corolla',
      Status: 'AUTHORISED',
      LineAmountTypes: 'Exclusive',
      SentToContact: true,
    })

    expect(uploads).toEqual([
      {
        url: 'https://api.xero.com/api.xro/2.0/Invoices/inv-new/Attachments/INV-1001.pdf?IncludeOnline=true',
        method: 'PUT',
        headers: expect.objectContaining({
          'content-type': 'application/pdf',
          'xero-tenant-id': 'tenant-1',
        }),
      },
    ])
    expect(links.get('ServiceRecord:svc1')).toMatchObject({
      remoteId: 'inv-new',
      remoteUrl:
        'https://go.xero.com/organisationlogin/default.aspx?shortcode=!abc&redirecturl=/AccountsReceivable/View.aspx?InvoiceID=inv-new',
      metadata: expect.objectContaining({ tenantId: 'tenant-1', attached: true }),
    })
  })

  it('reuses the contact the bookkeeper already has under that email', async () => {
    const { ctx, calls } = makeCtx({
      answer: emptyOrganisation({
        'GET /Contacts': (c) =>
          c.query.where?.startsWith('EmailAddress')
            ? { Contacts: [{ ContactID: 'contact-old', Name: 'Anna Berg' }] }
            : { Contacts: [] },
      }),
    })
    await connector.jobs['accounting.invoice'](ctx, { entityId: 'svc1' })
    expect(api(calls, 'PUT', '/Contacts')).toHaveLength(0)
    expect(
      (api(calls, 'PUT', '/Invoices')[0].body?.Invoices as Record<string, unknown>[])[0].Contact
    ).toEqual({
      ContactID: 'contact-old',
    })
  })

  it('updates an unpaid invoice in place, never moving its approval back', async () => {
    const { ctx, calls, links } = makeCtx({
      settings: { invoiceStatus: 'DRAFT' },
      answer: emptyOrganisation(),
    })
    await connector.jobs['accounting.invoice'](ctx, { entityId: 'svc1' })
    const link = links.get('ServiceRecord:svc1')
    if (!link) throw new Error('no link')
    links.set('ServiceRecord:svc1', { ...link, checksum: 'old' })
    calls.length = 0

    await connector.jobs['accounting.invoice'](ctx, { entityId: 'svc1' })
    const [post] = api(calls, 'POST', '/Invoices/inv-new')
    // Someone approved it in Xero; the workshop's Draft setting does not undo that.
    expect((post.body?.Invoices as Record<string, unknown>[])[0]).toMatchObject({
      InvoiceID: 'inv-new',
      Status: 'AUTHORISED',
    })
    expect(api(calls, 'PUT', '/Invoices')).toHaveLength(0)
  })

  it('leaves an invoice alone once Xero holds a payment on it, and says so once', async () => {
    const { ctx, calls, links, logs } = makeCtx({
      answer: emptyOrganisation({
        'GET /Invoices/inv-new': () => ({
          Invoices: [
            {
              InvoiceID: 'inv-new',
              Status: 'AUTHORISED',
              Total: 300,
              AmountPaid: 100,
              AmountDue: 200,
            },
          ],
        }),
      }),
    })
    await connector.jobs['accounting.invoice'](ctx, { entityId: 'svc1' })
    const link = links.get('ServiceRecord:svc1')
    if (!link) throw new Error('no link')
    links.set('ServiceRecord:svc1', { ...link, checksum: 'old' })
    calls.length = 0

    await connector.jobs['accounting.invoice'](ctx, { entityId: 'svc1' })
    await connector.jobs['accounting.invoice'](ctx, { entityId: 'svc1' })
    expect(api(calls, 'POST', '/Invoices/inv-new')).toHaveLength(0)
    expect(logs.filter((l) => l.message.includes('after a payment was recorded'))).toHaveLength(1)
  })

  it('starts afresh when the workshop switches to another organisation', async () => {
    const { ctx, calls, links } = makeCtx({ answer: emptyOrganisation() })
    links.set('ServiceRecord:svc1', {
      entityType: 'ServiceRecord',
      entityId: 'svc1',
      remoteId: 'inv-elsewhere',
      remoteUrl: null,
      checksum: 'x',
      metadata: { tenantId: 'tenant-old' },
    })
    await connector.jobs['accounting.invoice'](ctx, { entityId: 'svc1' })
    expect(api(calls, 'PUT', '/Invoices')).toHaveLength(1)
    expect(calls.some((c) => c.path.includes('inv-elsewhere'))).toBe(false)
  })

  it('asks for an organisation before it calls Xero at all', async () => {
    const { ctx, calls } = makeCtx({ settings: { tenantId: '' }, answer: emptyOrganisation() })
    const outcome = (await connector.jobs['accounting.invoice'](ctx, {
      entityId: 'svc1',
    })) as JobOutcome
    expect(outcome.summary).toMatch(/choose the Xero organisation/)
    expect(calls).toHaveLength(0)
  })
})

describe('payments', () => {
  it('records a card payment into the card account, trimmed to what Xero says is owed', async () => {
    loadInvoice.mockResolvedValue({ ...invoice, payments: [cardPayment] })
    const { ctx, calls } = makeCtx({
      settings: { cardAccount: 'card-acc', paymentAccount: 'bank-acc' },
      answer: emptyOrganisation({
        'GET /Invoices/inv-new': () => ({
          Invoices: [
            { InvoiceID: 'inv-new', Status: 'AUTHORISED', Total: 362.99, AmountDue: 362.99 },
          ],
        }),
      }),
    })
    const outcome = (await connector.jobs['accounting.invoice'](ctx, {
      entityId: 'svc1',
    })) as JobOutcome
    expect(outcome.summary).toContain('1 payments recorded')
    const [put] = api(calls, 'PUT', '/Payments')
    expect(put.headers['idempotency-key']).toBe('tv-payment-pay1')
    expect((put.body?.Payments as Record<string, unknown>[])[0]).toEqual({
      Invoice: { InvoiceID: 'inv-new' },
      Account: { AccountID: 'card-acc' },
      Date: '2026-11-05',
      Amount: 362.99,
      Reference: 'Torqvoice card',
    })
  })

  it('waits for the invoice to be approved in Xero before recording a payment', async () => {
    loadInvoice.mockResolvedValue({ ...invoice, payments: [cardPayment] })
    loadPayment.mockResolvedValue({ ...cardPayment, date: new Date() })
    const { ctx, calls } = makeCtx({
      settings: { invoiceStatus: 'DRAFT' },
      answer: emptyOrganisation({
        'GET /Invoices/inv-new': () => ({
          Invoices: [{ InvoiceID: 'inv-new', Status: 'DRAFT', AmountDue: 363 }],
        }),
      }),
    })
    const outcome = (await connector.jobs['accounting.payment'](ctx, {
      entityId: 'pay1',
    })) as JobOutcome
    expect(outcome).toEqual({
      summary: 'waiting for the invoice to be approved in Xero',
      rescheduleInSeconds: 3600,
    })
    expect(api(calls, 'PUT', '/Payments')).toHaveLength(0)
  })
})

describe('a job deleted here', () => {
  async function pushedThenDeleted(
    remote: Record<string, unknown>,
    settings: Record<string, unknown> = {}
  ) {
    const harness = makeCtx({
      settings,
      answer: emptyOrganisation({
        'GET /Invoices/inv-new': () => ({ Invoices: [{ InvoiceID: 'inv-new', ...remote }] }),
      }),
    })
    await connector.jobs['accounting.invoice'](harness.ctx, { entityId: 'svc1' })
    harness.calls.length = 0
    loadInvoice.mockResolvedValue(null)
    const outcome = (await connector.jobs['accounting.invoice'](harness.ctx, {
      entityId: 'svc1',
    })) as JobOutcome
    return { ...harness, outcome }
  }

  it('voids an approved invoice and deletes a draft', async () => {
    const approved = await pushedThenDeleted({ Status: 'AUTHORISED', InvoiceNumber: 'INV-1001' })
    expect(api(approved.calls, 'POST', '/Invoices/inv-new')[0].body).toEqual({
      Invoices: [{ InvoiceID: 'inv-new', Status: 'VOIDED' }],
    })
    loadInvoice.mockResolvedValue(invoice)
    const draft = await pushedThenDeleted(
      { Status: 'DRAFT', InvoiceNumber: 'INV-1001' },
      { invoiceStatus: 'DRAFT' }
    )
    expect(api(draft.calls, 'POST', '/Invoices/inv-new')[0].body).toEqual({
      Invoices: [{ InvoiceID: 'inv-new', Status: 'DELETED' }],
    })
  })

  it('leaves an invoice with payments in Xero, and one the workshop wants kept', async () => {
    const paid = await pushedThenDeleted({ Status: 'AUTHORISED', AmountPaid: 50, Total: 363 })
    expect(api(paid.calls, 'POST', '/Invoices/inv-new')).toHaveLength(0)
    expect(paid.outcome.summary).toBe('left in Xero, has payments')
    loadInvoice.mockResolvedValue(invoice)
    const kept = await pushedThenDeleted({ Status: 'AUTHORISED' }, { voidOnDelete: false })
    expect(kept.calls).toHaveLength(0)
  })
})

describe('pulling from Xero', () => {
  it('records a payment taken in Xero, removes one deleted there, and keeps a voided invoice out', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-11-09T12:00:00.500Z'))
    const { ctx, calls, links, logs } = makeCtx({
      answer: emptyOrganisation({
        'GET /Payments': () => ({
          Payments: [
            {
              PaymentID: 'x1',
              Status: 'AUTHORISED',
              Amount: 100,
              Date: '/Date(1762646400000+0000)/',
              Reference: 'EFT',
              Invoice: { InvoiceID: 'inv-1' },
            },
            { PaymentID: 'x2', Status: 'DELETED', Amount: 50, Invoice: { InvoiceID: 'inv-1' } },
          ],
        }),
        'GET /Invoices': () => ({
          Invoices: [{ InvoiceID: 'inv-2', InvoiceNumber: 'INV-2', Status: 'VOIDED' }],
        }),
      }),
    })
    const scoped = { tenantId: 'tenant-1' }
    links.set('ServiceRecord:svc1', {
      entityType: 'ServiceRecord',
      entityId: 'svc1',
      remoteId: 'inv-1',
      remoteUrl: null,
      checksum: null,
      metadata: scoped,
    })
    links.set('ServiceRecord:svc2', {
      entityType: 'ServiceRecord',
      entityId: 'svc2',
      remoteId: 'inv-2',
      remoteUrl: null,
      checksum: null,
      metadata: scoped,
    })
    links.set('Payment:pulled', {
      entityType: 'Payment',
      entityId: 'pulled',
      remoteId: 'x2',
      remoteUrl: null,
      checksum: null,
      metadata: { ...scoped, createdByUs: false },
    })

    const outcome = (await connector.jobs['accounting.pull'](ctx, {})) as JobOutcome
    expect(outcome.summary).toBe(
      '1 payments recorded, 1 payments removed, 1 invoices voided or deleted in Xero'
    )

    const [payments] = api(calls, 'GET', '/Payments')
    // A day back on a first pull, less a minute of overlap, to the second and without a zone.
    expect(payments.headers['if-modified-since']).toBe('2026-11-08T11:59:00')
    expect(payments.query.where).toBe('PaymentType=="ACCRECPAYMENT"')
    expect(recordPulledPayment).toHaveBeenCalledWith('org1', {
      serviceRecordId: 'svc1',
      amount: 100,
      // Noon in Sydney on the day Xero names, so it shows on that day there.
      date: new Date('2025-11-09T01:00:00Z'),
      method: 'other',
      provider: 'xero',
      externalId: 'x1',
      note: 'Recorded in Xero. Ref EFT',
    })
    expect(removePulledPayment).toHaveBeenCalledWith('org1', 'pulled', 'xero')
    // Xero never gives a voided invoice's number out again, so it is not resent under it.
    expect(links.get('ServiceRecord:svc2')?.metadata).toMatchObject({ goneInXero: 'voided' })
    expect(logs.some((l) => l.message.includes('INV-2 was voided in Xero'))).toBe(true)
  })
})

describe('connecting', () => {
  it('chooses the organisation by itself when only one was allowed', async () => {
    const { ctx } = makeCtx({
      settings: { tenantId: '' },
      answer: (call) => {
        if (call.path === '/connections')
          return [
            {
              id: 'c1',
              tenantId: 'tenant-9',
              tenantType: 'ORGANISATION',
              tenantName: 'Demo Garage',
            },
          ]
        throw new Error('unexpected')
      },
    })
    expect(await connector.onConnect?.(ctx)).toEqual({ settings: { tenantId: 'tenant-9' } })
    expect(await connector.identify?.(ctx)).toMatchObject({ name: 'Demo Garage' })
  })
})

describe('after a reconnect', () => {
  it('finds the invoice already in Xero by its number and does not record its payment twice', async () => {
    const appUrl = 'https://shop.example.com/vehicles/veh1/service/svc1'
    const { ctx, calls, links } = makeCtx({
      answer: emptyOrganisation({
        'GET /Invoices': () => ({
          Invoices: [{ InvoiceID: 'inv-old', Type: 'ACCREC', Status: 'AUTHORISED' }],
        }),
        'GET /Invoices/inv-old': () => ({
          Invoices: [
            {
              InvoiceID: 'inv-old',
              Status: 'AUTHORISED',
              Url: appUrl,
              Total: 363,
              AmountPaid: 100,
              AmountDue: 263,
              Payments: [{ PaymentID: 'pmt-old', Amount: 100, Date: '/Date(1762300800000+0000)/' }],
            },
          ],
        }),
      }),
    })
    // The payment here is on the day Xero holds it (5 Nov 2025 in Xero's date above).
    loadInvoice.mockResolvedValue({
      ...invoice,
      payments: [{ ...cardPayment, amount: 100, date: new Date('2025-11-05T01:00:00Z') }],
    })
    await connector.jobs['accounting.invoice'](ctx, { entityId: 'svc1' })
    expect(api(calls, 'PUT', '/Invoices')).toHaveLength(0)
    expect(api(calls, 'PUT', '/Payments')).toHaveLength(0)
    expect(links.get('ServiceRecord:svc1')?.remoteId).toBe('inv-old')
    expect(links.get('Payment:pay1')).toMatchObject({
      remoteId: 'pmt-old',
      metadata: expect.objectContaining({ relinked: true }),
    })
  })
})

describe('an invoice voided in Xero', () => {
  // Seen live on 9 Nov 2026: Xero answers "Invoice # must be unique." to a new
  // invoice under the number of a voided one.
  const voided = {
    InvoiceID: 'inv-void',
    InvoiceNumber: 'INV-1001',
    Type: 'ACCREC',
    Status: 'VOIDED',
  }

  it('is not sent again under its number, and the log says why once', async () => {
    const { ctx, calls, links, logs } = makeCtx({
      answer: emptyOrganisation({ 'GET /Invoices': () => ({ Invoices: [voided] }) }),
    })
    const first = (await connector.jobs['accounting.invoice'](ctx, {
      entityId: 'svc1',
    })) as JobOutcome
    expect(first.summary).toBe('invoice INV-1001 voided in Xero; not sent again')
    expect(api(calls, 'PUT', '/Invoices')).toHaveLength(0)
    expect(links.get('ServiceRecord:svc1')?.metadata).toMatchObject({ goneInXero: 'voided' })
    calls.length = 0
    const again = (await connector.jobs['accounting.invoice'](ctx, {
      entityId: 'svc1',
    })) as JobOutcome
    expect(again.summary).toBe('invoice INV-1001 voided in Xero; not sent again')
    expect(calls.filter((c) => c.path.includes('/Invoices'))).toHaveLength(0)
    expect(
      logs.filter((l) => l.message.includes('does not give its number out again'))
    ).toHaveLength(1)
  })

  it('is sent as a new invoice once it has a new number here', async () => {
    const { ctx, calls, links } = makeCtx({
      answer: emptyOrganisation({
        'GET /Invoices': (c) =>
          c.query.InvoiceNumbers === 'INV-1001' ? { Invoices: [voided] } : { Invoices: [] },
      }),
    })
    await connector.jobs['accounting.invoice'](ctx, { entityId: 'svc1' })
    loadInvoice.mockResolvedValue({ ...invoice, invoiceNumber: 'INV-1001B' })
    const outcome = (await connector.jobs['accounting.invoice'](ctx, {
      entityId: 'svc1',
    })) as JobOutcome
    expect(outcome.summary).toBe('invoice INV-1001B created')
    expect(
      (api(calls, 'PUT', '/Invoices')[0].body?.Invoices as Record<string, unknown>[])[0]
        .InvoiceNumber
    ).toBe('INV-1001B')
    expect(links.get('ServiceRecord:svc1')?.metadata).not.toHaveProperty('goneInXero')
  })
})

describe('a customer whose email another Xero contact has', () => {
  /** The checksum of the customer as it is: linked and not edited since. */
  const unchanged = checksumOf(buildContact(customer, contactName(customer)))
  const push = async (ctx: ConnectorContext) =>
    (await connector.jobs['accounting.invoice'](ctx, { entityId: 'svc1' })) as JobOutcome
  const contactOf = (calls: Call[]) =>
    (
      (api(calls, 'PUT', '/Invoices')[0]?.body?.Invoices ??
        api(calls, 'POST', '/Invoices/inv-new')[0]?.body?.Invoices) as Record<string, unknown>[]
    )[0].Contact
  /** Xero's contacts list: the given contacts for an email search, none by name. */
  const withEmail = (contacts: Record<string, unknown>[]) => ({
    'GET /Contacts': (call: Call) =>
      String(call.query.where).startsWith('EmailAddress==')
        ? { Contacts: contacts }
        : { Contacts: [] },
  })

  it('gives the customer a contact of its own when the one with the email has another name', async () => {
    const { ctx, calls, links, logs } = makeCtx({
      answer: emptyOrganisation(
        withEmail([
          { ContactID: 'dummy', Name: 'Dummy Customer', EmailAddress: 'anna@example.com' },
        ])
      ),
    })
    await push(ctx)
    expect(api(calls, 'PUT', '/Contacts')).toHaveLength(1)
    expect(contactOf(calls)).toEqual({ ContactID: 'contact-new' })
    expect(links.get('Customer:cus1')?.remoteId).toBe('contact-new')
    expect(logs.find((l) => l.level === 'warn')?.message).toContain(
      'the contact "Dummy Customer" has the same email address but another name'
    )
  })

  it('uses the contact with the email when its name, or its person, is the customer', async () => {
    const { ctx, calls, links } = makeCtx({
      answer: emptyOrganisation(
        withEmail([
          { ContactID: 'dummy', Name: 'Dummy Customer' },
          { ContactID: 'anna-xero', Name: 'Berg Logistics', FirstName: 'Anna', LastName: 'Berg' },
        ])
      ),
    })
    await push(ctx)
    expect(api(calls, 'PUT', '/Contacts')).toHaveLength(0)
    expect(contactOf(calls)).toEqual({ ContactID: 'anna-xero' })
    expect(links.get('Customer:cus1')?.metadata).toMatchObject({ reused: true, verified: true })
  })

  it('trusts the email alone when the workshop chose to', async () => {
    const { ctx, calls } = makeCtx({
      settings: { sameEmail: 'reuse' },
      answer: emptyOrganisation(withEmail([{ ContactID: 'dummy', Name: 'Dummy Customer' }])),
    })
    await push(ctx)
    expect(api(calls, 'PUT', '/Contacts')).toHaveLength(0)
    expect(contactOf(calls)).toEqual({ ContactID: 'dummy' })
  })

  it('moves a customer an earlier version linked by email to another customer onto a contact of its own', async () => {
    const { ctx, calls, links, logs } = makeCtx({
      answer: emptyOrganisation({
        'GET /Contacts/dummy': () => ({
          Contacts: [{ ContactID: 'dummy', Name: 'Dummy Customer' }],
        }),
      }),
    })
    await ctx.links.set('Customer', 'cus1', {
      remoteId: 'dummy',
      checksum: unchanged,
      metadata: { tenantId: 'tenant-1', reused: true },
    })
    await push(ctx)
    expect(links.get('Customer:cus1')?.remoteId).toBe('contact-new')
    expect(contactOf(calls)).toEqual({ ContactID: 'contact-new' })
    expect(
      logs.some((l) => l.message.includes('linked to the Xero contact "Dummy Customer"'))
    ).toBe(true)
    // The other customer's contact was never written to.
    expect(api(calls, 'POST', '/Contacts/dummy')).toHaveLength(0)
  })

  it('checks a link to a contact that was already in Xero only once', async () => {
    const { ctx, calls, links } = makeCtx({
      settings: { updateContacts: false },
      answer: emptyOrganisation({
        'GET /Contacts/anna-xero': () => ({
          Contacts: [{ ContactID: 'anna-xero', Name: 'Anna Berg' }],
        }),
      }),
    })
    await ctx.links.set('Customer', 'cus1', {
      remoteId: 'anna-xero',
      checksum: 'old',
      metadata: { tenantId: 'tenant-1', reused: true },
    })
    await push(ctx)
    await push(ctx)
    expect(api(calls, 'GET', '/Contacts/anna-xero')).toHaveLength(1)
    expect(links.get('Customer:cus1')).toMatchObject({
      remoteId: 'anna-xero',
      metadata: { reused: true, verified: true },
    })
  })

  it('keeps a link whose customer was changed since, as that may be a rename, and says so', async () => {
    const { ctx, calls, links, logs } = makeCtx({
      settings: { updateContacts: false },
      answer: emptyOrganisation({
        'GET /Contacts/old-name': () => ({
          Contacts: [{ ContactID: 'old-name', Name: 'Anna Hansen' }],
        }),
      }),
    })
    await ctx.links.set('Customer', 'cus1', {
      remoteId: 'old-name',
      checksum: 'before-the-rename',
      metadata: { tenantId: 'tenant-1', reused: true },
    })
    await push(ctx)
    expect(links.get('Customer:cus1')).toMatchObject({
      remoteId: 'old-name',
      metadata: { verified: true },
    })
    expect(contactOf(calls)).toEqual({ ContactID: 'old-name' })
    expect(logs.some((l) => l.message.includes('this may be a rename and the link was kept'))).toBe(
      true
    )
  })

  it('checks an old link whose record of how it was made a contact update replaced', async () => {
    const { ctx, links } = makeCtx({
      answer: emptyOrganisation({
        'GET /Contacts/dummy': () => ({
          Contacts: [{ ContactID: 'dummy', Name: 'Dummy Customer' }],
        }),
      }),
    })
    await ctx.links.set('Customer', 'cus1', {
      remoteId: 'dummy',
      checksum: unchanged,
      metadata: { tenantId: 'tenant-1' },
    })
    await push(ctx)
    expect(links.get('Customer:cus1')?.remoteId).toBe('contact-new')
  })

  it('keeps how a link was made when the contact is updated', async () => {
    const { ctx, calls, links } = makeCtx({
      answer: emptyOrganisation({
        'POST /Contacts/anna-xero': () => ({
          Contacts: [{ ContactID: 'anna-xero', Name: 'Anna Berg' }],
        }),
      }),
    })
    await ctx.links.set('Customer', 'cus1', {
      remoteId: 'anna-xero',
      checksum: 'before-an-edit',
      metadata: { tenantId: 'tenant-1', reused: true, verified: true },
    })
    await push(ctx)
    expect(api(calls, 'POST', '/Contacts/anna-xero')).toHaveLength(1)
    expect(links.get('Customer:cus1')?.metadata).toMatchObject({ reused: true, verified: true })
  })
})
