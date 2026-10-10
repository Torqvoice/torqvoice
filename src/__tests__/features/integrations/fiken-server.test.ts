import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  AccountingCustomer,
  AccountingInvoice,
  AccountingPayment,
} from '@/features/integrations/Lib/accounting-sync'
import type { ConnectorContext, LinkRecord, LogLevel } from '@/features/integrations/Lib/types'

/**
 * The connector against a scripted Fiken: every request it makes is recorded
 * and answered from here, so the exact URLs, query parameters and bodies
 * that would reach Fiken are asserted without a company. The loaders that
 * read this app's database are replaced with fixtures.
 */

const loadInvoice = vi.fn<(orgId: string, id: string) => Promise<AccountingInvoice | null>>()
const loadPayment = vi.fn<(orgId: string, id: string) => Promise<AccountingPayment | null>>()
const loadCustomer = vi.fn<(orgId: string, id: string) => Promise<AccountingCustomer | null>>()
const loadPdf = vi.fn<() => Promise<{ buffer: Uint8Array; filename: string } | null>>()
const recordPulledPayment = vi.fn()
const removePulledPayment = vi.fn()
const workshopCurrency = vi.fn<() => Promise<string | null>>()

vi.mock('@/features/integrations/Lib/accounting-sync', () => ({
  INVOICE_ENTITY: 'ServiceRecord',
  CUSTOMER_ENTITY: 'Customer',
  PAYMENT_ENTITY: 'Payment',
  loadInvoiceForAccounting: (orgId: string, id: string) => loadInvoice(orgId, id),
  loadPaymentForAccounting: (orgId: string, id: string) => loadPayment(orgId, id),
  loadCustomerForAccounting: (orgId: string, id: string) => loadCustomer(orgId, id),
  loadInvoicePdfForAccounting: () => loadPdf(),
  recordPulledPayment: (...args: unknown[]) => recordPulledPayment(...args),
  removePulledPayment: (...args: unknown[]) => removePulledPayment(...args),
  workshopCurrency: () => workshopCurrency(),
}))

const { connector } = await import('@/integrations/fiken/server')

const SLUG = 'verksted-as'
const BASE = `/api/v2/companies/${SLUG}`

interface Call {
  method: string
  host: string
  path: string
  query: Record<string, string>
  body: Record<string, unknown> | null
  form: Record<string, string> | null
  headers: Record<string, string>
}

interface Reply {
  status?: number
  json?: unknown
  /** The id a create answers with, sent back the way Fiken does: in Location. */
  created?: number
  headers?: Record<string, string>
}

type Answer = (call: Call) => Reply

function respond(call: Call, reply: Reply): Response {
  const headers = new Headers(reply.headers)
  if (reply.created) {
    headers.set('Location', `https://api.fiken.no${call.path}/${reply.created}`)
    return new Response(null, { status: 201, headers })
  }
  const status = reply.status ?? 200
  if (status === 204) return new Response(null, { status, headers })
  return new Response(reply.json === undefined ? '' : JSON.stringify(reply.json), {
    status,
    headers,
  })
}

function makeCtx(input: {
  settings?: Record<string, unknown>
  state?: Record<string, unknown>
  answer: Answer
}) {
  const calls: Call[] = []
  const links = new Map<string, LinkRecord & { entityId: string; entityType: string }>()
  const logs: { level: LogLevel; message: string }[] = []
  const state: Record<string, unknown> = {
    // Known and VAT registered, so a push does not read the company unless a test asks.
    company: { slug: SLUG, vatRegistered: true, fetchedAt: new Date().toISOString() },
    ...input.state,
  }
  const key = (t: string, e: string) => `${t}:${e}`
  const ctx: ConnectorContext = {
    connection: {
      id: `conn-${Math.random()}`,
      organizationId: 'org1',
      connectorId: 'fiken',
      settings: { companySlug: SLUG, paymentAccount: '1920:10001', ...input.settings },
      state,
      externalAccountId: 'fiken-x',
    },
    credentials: { accessToken: 'tok', refreshToken: 'ref' },
    http: {
      async fetch(url: string, init?: RequestInit): Promise<Response> {
        const u = new URL(url)
        const body = init?.body
        const call: Call = {
          method: init?.method ?? 'GET',
          host: u.host,
          path: u.pathname,
          query: Object.fromEntries(u.searchParams.entries()),
          body: typeof body === 'string' ? (JSON.parse(body) as Record<string, unknown>) : null,
          form:
            body instanceof FormData
              ? Object.fromEntries(
                  [...body.entries()].map(([k, v]) => [
                    k,
                    typeof v === 'string' ? v : `file:${v.name}:${v.type}:${v.size}`,
                  ])
                )
              : null,
          headers: Object.fromEntries(new Headers(init?.headers).entries()),
        }
        calls.push(call)
        return respond(call, input.answer(call))
      },
      async json<T>(): Promise<T> {
        throw new Error('not used')
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
          remoteUrl: link.remoteUrl ?? null,
          metadata: link.metadata === undefined ? (prev?.metadata ?? null) : link.metadata,
          checksum: link.checksum ?? null,
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
    timezone: 'Europe/Oslo',
    appUrl: 'https://shop.example.com',
  }
  const reset = () => calls.splice(0, calls.length)
  return { ctx, calls, links, logs, state, reset }
}

const customer: AccountingCustomer = {
  id: 'cus1',
  name: 'Anna Berg',
  email: 'anna@example.com',
  phone: '912 34 567',
  address: 'Storgata 1\n0155 Oslo',
  company: null,
  taxId: null,
  taxExempt: false,
  customerNumber: 'C-0042',
}

const invoice: AccountingInvoice = {
  id: 'svc1',
  vehicleId: 'veh1',
  invoiceNumber: 'INV-1001',
  status: 'completed',
  issuedAt: new Date('2026-09-04T10:00:00Z'),
  invoiceDate: new Date('2026-09-04T10:00:00Z'),
  serviceDate: new Date('2026-09-03T10:00:00Z'),
  dueDate: new Date('2026-09-18T10:00:00Z'),
  mileage: 84200,
  notes: null,
  subtotal: 300,
  discountType: null,
  discountValue: 0,
  discountAmount: 0,
  taxRate: 25,
  taxAmount: 75,
  taxInclusive: false,
  totalAmount: 375,
  manuallyPaid: false,
  customer,
  vehicle: { year: 2018, make: 'Toyota', model: 'Corolla', licensePlate: 'AB 12345' },
  lines: [
    {
      kind: 'labor',
      description: 'Brake service',
      partNumber: null,
      quantity: 2,
      unitPrice: 100,
      total: 200,
    },
    {
      kind: 'part',
      description: 'Brake pads',
      partNumber: 'BP-100',
      quantity: 1,
      unitPrice: 100,
      total: 100,
    },
  ],
  payments: [],
}

const payment: AccountingPayment = {
  id: 'pay1',
  serviceRecordId: 'svc1',
  amount: 375,
  date: new Date('2026-09-05T10:00:00Z'),
  method: 'card',
  note: null,
  provider: 'stripe',
  externalId: 'pi_123',
}

const saleBody = {
  saleNumber: 'INV-1001',
  date: '2026-09-04',
  kind: 'external_invoice',
  lines: [
    { description: 'Brake service', netPrice: 20000, vat: 5000, account: '3000', vatType: 'HIGH' },
    {
      description: 'BP-100 Brake pads',
      netPrice: 10000,
      vat: 2500,
      account: '3000',
      vatType: 'HIGH',
    },
  ],
  customerId: 501,
  currency: 'NOK',
  dueDate: '2026-09-18',
}

const PAGE = { page: '0', pageSize: '100' }

/** A Fiken company that has nothing yet and accepts everything. */
function emptyCompany(overrides: Answer = () => ({ status: 599 })): Answer {
  let nextSale = 9001
  let nextPayment = 7001
  const sales = new Map<string, Record<string, unknown>>()
  return (call) => {
    const special = overrides(call)
    if (special.status !== 599) return special
    // A sale reads back the way it was entered, as Fiken answers it.
    const saleId = call.method === 'GET' ? call.path.match(/\/sales\/(\d+)$/)?.[1] : undefined
    if (saleId && sales.has(saleId)) return { json: sales.get(saleId) }
    if (call.method === 'GET') return { json: [] }
    if (call.method === 'POST' && call.path === `${BASE}/contacts`) return { created: 501 }
    if (call.method === 'POST' && call.path === `${BASE}/sales`) {
      const id = nextSale++
      sales.set(String(id), {
        saleId: id,
        ...call.body,
        customer: { contactId: call.body?.customerId },
        salePayments: [],
      })
      return { created: id }
    }
    if (call.method === 'POST' && call.path.endsWith('/attachments')) {
      // An attachment is known by a uuid, so its Location does not end in a number.
      return {
        status: 201,
        headers: {
          Location: `https://api.fiken.no${call.path}/745b2f15-1234-4408-8bf2-b1d2d7610cb2`,
        },
      }
    }
    if (call.method === 'POST' && call.path.endsWith('/payments')) return { created: nextPayment++ }
    if (call.method === 'PATCH' && call.path.endsWith('/delete')) return { json: { deleted: true } }
    if (call.method === 'DELETE') return { status: 204 }
    throw new Error(`unexpected ${call.method} ${call.path}`)
  }
}

const pass: Reply = { status: 599 }
const push = (t: ReturnType<typeof makeCtx>, id = 'svc1') =>
  connector.jobs['accounting.invoice'](t.ctx, { entityId: id })

beforeEach(() => {
  vi.clearAllMocks()
  loadInvoice.mockResolvedValue(invoice)
  loadPayment.mockResolvedValue(payment)
  loadCustomer.mockResolvedValue(customer)
  loadPdf.mockResolvedValue({ buffer: new Uint8Array([37, 80, 68, 70]), filename: 'INV-1001.pdf' })
  workshopCurrency.mockResolvedValue('NOK')
  recordPulledPayment.mockResolvedValue({ id: 'pulled1', created: true })
  removePulledPayment.mockResolvedValue(true)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('Fiken: pushing an invoice', () => {
  it('creates the contact, then the sale under its own number, then files the PDF on it', async () => {
    const t = makeCtx({ answer: emptyCompany() })
    const out = await push(t)
    expect(out?.summary).toBe(
      'invoice INV-1001 created, 300.00 net and 75.00 VAT confirmed in Fiken'
    )

    const [findContact, createContact, findSale, createSale, readBack, attach] = t.calls
    expect(t.calls).toHaveLength(6)
    expect(findContact.host).toBe('api.fiken.no')
    expect(findContact.path).toBe(`${BASE}/contacts`)
    expect(findContact.query).toEqual({ name: 'Anna Berg', customer: 'true', ...PAGE })
    expect(findContact.headers.accept).toBe('application/json')
    expect(findContact.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/)

    expect(createContact.method).toBe('POST')
    expect(createContact.path).toBe(`${BASE}/contacts`)
    expect(createContact.body).toEqual({
      name: 'Anna Berg',
      email: 'anna@example.com',
      phoneNumber: '912 34 567',
      memberNumberString: 'C-0042',
      customer: true,
    })

    expect(findSale.path).toBe(`${BASE}/sales`)
    expect(findSale.query).toEqual({ saleNumber: 'INV-1001', ...PAGE })

    expect(createSale.method).toBe('POST')
    expect(createSale.path).toBe(`${BASE}/sales`)
    expect(createSale.query).toEqual({})
    expect(createSale.body).toEqual(saleBody)

    // Fiken answers a create with no body, so the sale is read back to check its amounts.
    expect(readBack.method).toBe('GET')
    expect(readBack.path).toBe(`${BASE}/sales/9001`)

    expect(attach.method).toBe('POST')
    expect(attach.path).toBe(`${BASE}/sales/9001/attachments`)
    expect(attach.query).toEqual({ attachToSale: 'true' })
    expect(attach.form).toEqual({
      filename: 'INV-1001.pdf',
      file: 'file:INV-1001.pdf:application/pdf:4',
    })
    // A form writes its own content type; a JSON one here would break the upload.
    expect(attach.headers['content-type']).toBeUndefined()

    expect(t.links.get('ServiceRecord:svc1')).toMatchObject({
      remoteId: '9001',
      metadata: {
        company: SLUG,
        saleNumber: 'INV-1001',
        contactId: 501,
        attached: true,
        payments: [],
      },
    })
    expect(t.links.get('Customer:cus1')).toMatchObject({
      remoteId: '501',
      metadata: { company: SLUG, reused: false },
    })
  })

  it('sends nothing the second time when nothing changed', async () => {
    const t = makeCtx({ answer: emptyCompany() })
    await push(t)
    t.reset()
    const out = await push(t)
    expect(out?.summary).toBe('invoice INV-1001 unchanged')
    expect(t.calls).toHaveLength(0)
  })

  it('reverses a changed sale and enters it again, because Fiken cannot edit one', async () => {
    const t = makeCtx({
      answer: emptyCompany((call) =>
        call.method === 'GET' && call.path === `${BASE}/sales/9001`
          ? { json: { saleId: 9001, salePayments: [], totalPaid: 0, settled: false } }
          : pass
      ),
    })
    await push(t)
    t.reset()
    loadInvoice.mockResolvedValue({ ...invoice, dueDate: new Date('2026-09-30T10:00:00Z') })
    const out = await push(t)
    expect(out?.summary).toBe(
      'invoice INV-1001 reversed and entered again, 300.00 net and 75.00 VAT confirmed in Fiken'
    )

    const [readSale, reverse, findSale, createSale, readBack, attach] = t.calls
    expect(t.calls).toHaveLength(6)
    expect(readBack.path).toBe(`${BASE}/sales/9002`)
    expect(readSale.path).toBe(`${BASE}/sales/9001`)
    expect(reverse.method).toBe('PATCH')
    expect(reverse.path).toBe(`${BASE}/sales/9001/delete`)
    expect(reverse.query).toEqual({ description: 'Changed in Torqvoice' })
    expect(reverse.body).toBeNull()
    expect(findSale.query.saleNumber).toBe('INV-1001')
    expect(createSale.body).toEqual({ ...saleBody, dueDate: '2026-09-30' })
    expect(attach.path).toBe(`${BASE}/sales/9002/attachments`)
    expect(t.links.get('ServiceRecord:svc1')?.remoteId).toBe('9002')
  })

  it('leaves a paid sale alone when the invoice changes, and says so once', async () => {
    const t = makeCtx({
      answer: emptyCompany((call) =>
        call.method === 'GET' && call.path === `${BASE}/sales/9001`
          ? { json: { saleId: 9001, salePayments: [{ paymentId: 7100 }], totalPaid: 37500 } }
          : pass
      ),
    })
    await push(t)
    t.reset()
    loadInvoice.mockResolvedValue({ ...invoice, dueDate: new Date('2026-09-30T10:00:00Z') })
    const out = await push(t)
    expect(out?.summary).toBe('invoice INV-1001 left as it is in Fiken, has payments')
    expect(t.calls.map((c) => c.method)).toEqual(['GET'])
    await push(t)
    const warnings = t.logs.filter((l) => l.level === 'warn')
    expect(warnings).toHaveLength(1)
    expect(warnings[0].message).toContain('no longer matches its sale in Fiken')
    expect(t.links.get('ServiceRecord:svc1')?.remoteId).toBe('9001')
  })

  it('leaves sales already booked alone when the workshop changes an account in the settings', async () => {
    const t = makeCtx({ answer: emptyCompany() })
    await push(t)
    t.reset()
    // Labour moves to 3020. The invoice itself has not changed.
    t.ctx.connection.settings.laborAccount = '3020'
    const out = await push(t)
    expect(out?.summary).toBe('invoice INV-1001 unchanged')
    expect(t.calls.map((c) => `${c.method} ${c.path}`)).toEqual([`GET ${BASE}/sales/9001`])
    expect(t.logs).toHaveLength(0)
    expect(t.links.get('ServiceRecord:svc1')?.remoteId).toBe('9001')

    // Having looked once, it does not ask Fiken again.
    t.reset()
    await push(t)
    expect(t.calls).toHaveLength(0)
  })

  it('does not warn about a paid sale when only the settings changed, and still records a new payment', async () => {
    const t = makeCtx({
      answer: emptyCompany((call) =>
        call.method === 'GET' && call.path === `${BASE}/sales/9001`
          ? {
              json: {
                saleId: 9001,
                date: '2026-09-04',
                dueDate: '2026-09-18',
                customer: { contactId: 501 },
                lines: [
                  { netPrice: 20000, vat: 5000, account: '3000' },
                  { netPrice: 10000, vat: 2500, account: '3000' },
                ],
                salePayments: [{ paymentId: 7100, date: '2026-09-05', amount: 10000 }],
                totalPaid: 10000,
              },
            }
          : pass
      ),
    })
    await push(t)
    t.reset()
    t.ctx.connection.settings.laborAccount = '3020'
    loadInvoice.mockResolvedValue({ ...invoice, payments: [payment] })
    const out = await connector.jobs['accounting.payment'](t.ctx, { entityId: 'pay1' })
    expect(out?.summary).toBe('payment recorded')
    expect(t.logs).toHaveLength(0)
    expect(t.calls.map((c) => `${c.method} ${c.path}`)).toEqual([
      `GET ${BASE}/sales/9001`,
      `POST ${BASE}/sales/9001/payments`,
    ])
  })

  it('says what differs when a paid sale really no longer matches the invoice', async () => {
    const t = makeCtx({
      answer: emptyCompany((call) =>
        call.method === 'GET' && call.path === `${BASE}/sales/9001`
          ? {
              json: {
                saleId: 9001,
                date: '2026-09-04',
                customer: { contactId: 501 },
                lines: [
                  { netPrice: 20000, vat: 5000 },
                  { netPrice: 10000, vat: 2500 },
                ],
                totalPaid: 37500,
              },
            }
          : pass
      ),
    })
    await push(t)
    t.reset()
    loadInvoice.mockResolvedValue({
      ...invoice,
      subtotal: 400,
      taxAmount: 100,
      totalAmount: 500,
      lines: [invoice.lines[0], { ...invoice.lines[1], unitPrice: 200, total: 200 }],
    })
    const out = await push(t)
    expect(out?.summary).toBe('invoice INV-1001 left as it is in Fiken, has payments')
    expect(t.logs).toEqual([
      {
        level: 'warn',
        message:
          'Invoice INV-1001 no longer matches its sale in Fiken (net 300.00 there, 400.00 here, VAT 75.00 there, 100.00 here). The sale has payments there, so it is left as it is; correct it in Fiken.',
      },
    ])
  })

  it('takes over a sale Fiken already has under the number instead of entering it twice', async () => {
    const t = makeCtx({
      answer: emptyCompany((call) =>
        call.method === 'GET' && call.path === `${BASE}/sales` && call.query.saleNumber
          ? {
              json: [
                {
                  saleId: 8000,
                  date: '2026-09-04',
                  netAmount: 30000,
                  vatAmount: 7500,
                  deleted: true,
                },
                { saleId: 8001, date: '2026-09-04', netAmount: 30000, vatAmount: 7500 },
              ],
            }
          : pass
      ),
    })
    const out = await push(t)
    expect(out?.summary).toBe('invoice INV-1001 linked')
    expect(t.calls.some((c) => c.method === 'POST' && c.path === `${BASE}/sales`)).toBe(false)
    expect(t.calls.some((c) => c.path.endsWith('/attachments'))).toBe(false)
    expect(t.links.get('ServiceRecord:svc1')?.remoteId).toBe('8001')
  })

  it('adds the invoice beside a sale with the same number and other amounts, with a warning', async () => {
    const t = makeCtx({
      answer: emptyCompany((call) =>
        call.method === 'GET' && call.path === `${BASE}/sales` && call.query.saleNumber
          ? { json: [{ saleId: 8001, date: '2026-09-04', netAmount: 99900, vatAmount: 0 }] }
          : pass
      ),
    })
    const out = await push(t)
    expect(out?.summary).toBe(
      'invoice INV-1001 created, 300.00 net and 75.00 VAT confirmed in Fiken'
    )
    expect(t.logs.some((l) => l.level === 'warn' && l.message.includes('added beside it'))).toBe(
      true
    )
    expect(t.links.get('ServiceRecord:svc1')?.remoteId).toBe('9001')
  })

  it('keeps the sale when the PDF cannot be attached, and tries the PDF again next time', async () => {
    let refuse = true
    const t = makeCtx({
      answer: emptyCompany((call) =>
        call.path.endsWith('/attachments') && refuse
          ? { status: 400, json: { message: 'Ugyldig fil' } }
          : pass
      ),
    })
    const out = await push(t)
    expect(out?.summary).toBe(
      'invoice INV-1001 created, 300.00 net and 75.00 VAT confirmed in Fiken'
    )
    expect(t.links.get('ServiceRecord:svc1')?.metadata?.attached).toBe(false)
    expect(t.logs.find((l) => l.level === 'warn')?.message).toContain('Ugyldig fil')

    refuse = false
    t.reset()
    await push(t)
    expect(t.calls.map((c) => c.path)).toEqual([`${BASE}/sales/9001/attachments`])
    expect(t.links.get('ServiceRecord:svc1')?.metadata?.attached).toBe(true)
  })

  it('reads the new sale back and says so when Fiken booked other amounts than were billed', async () => {
    const t = makeCtx({
      answer: emptyCompany((call) =>
        call.method === 'GET' && call.path === `${BASE}/sales/9001`
          ? {
              json: {
                saleId: 9001,
                lines: [
                  { netPrice: 20000, vat: 5000 },
                  // One øre short on the VAT of the second line.
                  { netPrice: 10000, vat: 2499 },
                ],
              },
            }
          : pass
      ),
    })
    const out = await push(t)
    expect(out?.summary).toBe('invoice INV-1001 created, amounts differ in Fiken')
    expect(t.logs).toEqual([
      {
        level: 'warn',
        message:
          'Invoice INV-1001: Fiken booked 300.00 net and 74.99 VAT, the invoice here has 300.00 net and 75.00 VAT',
      },
    ])
  })

  it('confirms against the totals of the sale when Fiken lists no lines', async () => {
    const t = makeCtx({
      answer: emptyCompany((call) =>
        call.method === 'GET' && call.path === `${BASE}/sales/9001`
          ? { json: { saleId: 9001, netAmount: 30000, vatAmount: 7500 } }
          : pass
      ),
    })
    expect((await push(t))?.summary).toBe(
      'invoice INV-1001 created, 300.00 net and 75.00 VAT confirmed in Fiken'
    )
    expect(t.logs).toHaveLength(0)
  })

  it('keeps the sale when it cannot be read back, with a warning', async () => {
    const t = makeCtx({
      answer: emptyCompany((call) =>
        call.method === 'GET' && call.path === `${BASE}/sales/9001`
          ? { status: 500, json: { message: 'Midlertidig feil' } }
          : pass
      ),
    })
    const out = await push(t)
    expect(out?.summary).toBe('invoice INV-1001 created')
    expect(t.logs[0].message).toContain('could not be read back to check its amounts')
    expect(t.links.get('ServiceRecord:svc1')?.remoteId).toBe('9001')
  })

  it('puts the lines it sent in the log when Fiken refuses the sale', async () => {
    const t = makeCtx({
      answer: emptyCompany((call) =>
        call.method === 'POST' && call.path === `${BASE}/sales`
          ? { status: 400, json: { error_description: 'Lines with 0 amount is not allowed' } }
          : pass
      ),
    })
    await expect(push(t)).rejects.toThrow('Fiken: Lines with 0 amount is not allowed')
    expect(t.logs).toEqual([
      { level: 'warn', message: 'Fiken refused the sale for invoice INV-1001' },
    ])
    expect(t.links.has('ServiceRecord:svc1')).toBe(false)
  })

  it('does not render or send a PDF when the workshop switched that off', async () => {
    const t = makeCtx({ settings: { attachPdf: false }, answer: emptyCompany() })
    await push(t)
    expect(loadPdf).not.toHaveBeenCalled()
    expect(t.calls.some((c) => c.path.endsWith('/attachments'))).toBe(false)
  })

  it('books counter sales to one walk-in contact, found or created once', async () => {
    const t = makeCtx({ answer: emptyCompany() })
    loadInvoice.mockResolvedValue({ ...invoice, customer: null })
    await push(t)
    expect(t.calls[0].query).toEqual({ name: 'Kontantkunde', customer: 'true', ...PAGE })
    expect(t.calls[1].body).toEqual({ name: 'Kontantkunde', customer: true })
    expect(t.state.walkIn).toEqual({ slug: SLUG, contactId: 501 })

    t.reset()
    loadInvoice.mockResolvedValue({
      ...invoice,
      id: 'svc2',
      invoiceNumber: 'INV-1002',
      customer: null,
    })
    await push(t, 'svc2')
    expect(t.calls.some((c) => c.path === `${BASE}/contacts`)).toBe(false)
  })

  it('uses the accounts the workshop chose', async () => {
    const t = makeCtx({
      settings: { laborAccount: '3020', partsAccount: '3030' },
      answer: emptyCompany(),
    })
    await push(t)
    const sale = t.calls.find((c) => c.method === 'POST' && c.path === `${BASE}/sales`)
    expect((sale?.body?.lines as { account: string }[]).map((l) => l.account)).toEqual([
      '3020',
      '3030',
    ])
  })
})

describe('Fiken: what stays out', () => {
  it('waits for a company to be chosen', async () => {
    const t = makeCtx({ settings: { companySlug: '' }, answer: emptyCompany() })
    expect((await push(t))?.summary).toBe('no Fiken company chosen yet')
    expect((await connector.jobs['accounting.payment'](t.ctx, { entityId: 'pay1' }))?.summary).toBe(
      'no Fiken company chosen yet'
    )
    expect((await connector.jobs['accounting.pull'](t.ctx, {}))?.summary).toBe(
      'no Fiken company chosen yet'
    )
    expect(t.calls).toHaveLength(0)
  })

  it('holds back drafts, invoices before the start date and invoices without an amount', async () => {
    const t = makeCtx({ settings: { startDate: '2026-09-05' }, answer: emptyCompany() })
    expect((await push(t))?.summary).toBe('dated before the start date')
    loadInvoice.mockResolvedValue({ ...invoice, issuedAt: null })
    expect((await push(t))?.summary).toBe('not issued yet')
    const open = makeCtx({ answer: emptyCompany() })
    loadInvoice.mockResolvedValue({ ...invoice, totalAmount: 0, taxAmount: 0 })
    expect((await push(open))?.summary).toBe('no amount to book')
    expect(t.calls.length + open.calls.length).toBe(0)
  })

  it('sends a completed job before it is issued when asked to', async () => {
    const t = makeCtx({ settings: { pushOnComplete: true }, answer: emptyCompany() })
    loadInvoice.mockResolvedValue({ ...invoice, issuedAt: null })
    expect((await push(t))?.summary).toBe(
      'invoice INV-1001 created, 300.00 net and 75.00 VAT confirmed in Fiken'
    )
  })

  it('does not put another currency into books kept in kroner', async () => {
    const t = makeCtx({ answer: emptyCompany() })
    workshopCurrency.mockResolvedValue('EUR')
    expect((await push(t))?.summary).toBe('not sent: the workshop bills in EUR and Fiken keeps NOK')
    expect(t.calls).toHaveLength(0)
  })

  it('does not dress a foreign VAT rate up as a Norwegian one', async () => {
    const t = makeCtx({ answer: emptyCompany() })
    loadInvoice.mockResolvedValue({ ...invoice, taxRate: 20, taxAmount: 60, totalAmount: 360 })
    expect((await push(t))?.summary).toBe('invoice INV-1001 not sent, no VAT type for 20%')
    expect(t.logs[0]).toMatchObject({ level: 'warn' })
    expect(t.calls).toHaveLength(0)
  })

  it('asks a VAT registered company how to book a sale without VAT, and does not guess', async () => {
    const t = makeCtx({ answer: emptyCompany() })
    loadInvoice.mockResolvedValue({ ...invoice, taxAmount: 0, totalAmount: 300 })
    expect((await push(t))?.summary).toBe(
      'invoice INV-1001 not sent, VAT type for tax-free sales not chosen'
    )
    expect(t.logs[0].message).toContain('Choose the VAT type')
    expect(t.calls).toHaveLength(0)
  })

  it('books a sale without VAT under the type and account the workshop chose', async () => {
    const t = makeCtx({
      settings: { zeroVatType: 'EXEMPT', zeroAccount: '3100' },
      answer: emptyCompany(),
    })
    loadInvoice.mockResolvedValue({ ...invoice, taxAmount: 0, totalAmount: 300 })
    await push(t)
    const sale = t.calls.find((c) => c.method === 'POST' && c.path === `${BASE}/sales`)
    expect(sale?.body?.lines).toEqual([
      { description: 'Brake service', netPrice: 20000, account: '3100', vatType: 'EXEMPT' },
      {
        description: 'BP-100 Brake pads',
        netPrice: 10000,
        account: '3100',
        vatType: 'EXEMPT',
      },
    ])
  })

  it('reads the company once and books without VAT handling when it is not VAT registered', async () => {
    const t = makeCtx({
      state: { company: null },
      answer: emptyCompany((call) =>
        call.method === 'GET' && call.path === BASE
          ? { json: { slug: SLUG, name: 'Verksted AS', vatType: 'no', hasApiAccess: false } }
          : pass
      ),
    })
    loadInvoice.mockResolvedValue({ ...invoice, taxRate: 0, taxAmount: 0, totalAmount: 300 })
    await push(t)
    expect(t.calls[0].path).toBe(BASE)
    const sale = t.calls.find((c) => c.method === 'POST' && c.path === `${BASE}/sales`)
    expect((sale?.body?.lines as { vatType: string }[]).map((l) => l.vatType)).toEqual([
      'NONE',
      'NONE',
    ])
    expect(t.logs.find((l) => l.level === 'warn')?.message).toContain('API module')
    expect(t.state.company).toMatchObject({ slug: SLUG, vatRegistered: false })

    t.reset()
    loadInvoice.mockResolvedValue({
      ...invoice,
      id: 'svc2',
      invoiceNumber: 'INV-1002',
      taxRate: 0,
      taxAmount: 0,
      totalAmount: 300,
    })
    await push(t, 'svc2')
    expect(t.calls.some((c) => c.path === BASE)).toBe(false)
  })
})

describe('Fiken: contacts', () => {
  const company: AccountingCustomer = {
    ...customer,
    id: 'cus2',
    name: 'Berg Transport AS',
    taxId: 'NO 987 654 321 MVA',
  }

  it('reuses a business Fiken knows by its organisation number, and makes a supplier a customer', async () => {
    const t = makeCtx({
      answer: emptyCompany((call) => {
        if (call.method === 'GET' && call.query.organizationNumber) {
          return {
            json: [
              {
                contactId: 77,
                name: 'Berg Transport',
                supplier: true,
                customer: false,
                email: 'a@b.no',
              },
            ],
          }
        }
        if (call.method === 'PUT') return { json: {} }
        return pass
      }),
    })
    loadInvoice.mockResolvedValue({ ...invoice, customer: company })
    await push(t)
    expect(t.calls[0].query).toEqual({ organizationNumber: '987654321', ...PAGE })
    expect(t.calls[1].method).toBe('PUT')
    expect(t.calls[1].path).toBe(`${BASE}/contacts/77`)
    expect(t.calls[1].body).toEqual({
      supplier: true,
      email: 'a@b.no',
      name: 'Berg Transport',
      customer: true,
    })
    expect(t.calls.some((c) => c.method === 'POST' && c.path === `${BASE}/contacts`)).toBe(false)
    expect(t.links.get('Customer:cus2')).toMatchObject({
      remoteId: '77',
      metadata: { reused: true },
    })
    const sale = t.calls.find((c) => c.method === 'POST' && c.path === `${BASE}/sales`)
    expect(sale?.body?.customerId).toBe(77)
  })

  it('matches a person on name and email, and never picks between two people of one name', async () => {
    const same = (rows: unknown[]) =>
      emptyCompany((call) =>
        call.method === 'GET' && call.path === `${BASE}/contacts` ? { json: rows } : pass
      )
    const byEmail = makeCtx({
      answer: same([
        { contactId: 1, name: 'Anna Berg', email: 'other@example.com', customer: true },
        { contactId: 2, name: 'Anna Berg', email: 'ANNA@example.com', customer: true },
      ]),
    })
    await push(byEmail)
    expect(byEmail.links.get('Customer:cus1')?.remoteId).toBe('2')

    const twoStrangers = makeCtx({
      answer: same([
        { contactId: 1, name: 'Anna Berg', email: 'one@example.com', customer: true },
        { contactId: 3, name: 'Anna Berg', email: 'two@example.com', customer: true },
      ]),
    })
    await push(twoStrangers)
    expect(twoStrangers.links.get('Customer:cus1')?.remoteId).toBe('501')
  })

  it('updates the contact when the customer is edited, keeping what Fiken holds beside it', async () => {
    const t = makeCtx({
      answer: emptyCompany((call) => {
        if (call.method === 'GET' && call.path === `${BASE}/contacts/501`) {
          return {
            json: {
              contactId: 501,
              name: 'Anna Berg',
              email: 'anna@example.com',
              customer: true,
              customerNumber: 10001,
              address: { streetAddress: 'Storgata 1', country: 'Norway' },
            },
          }
        }
        if (call.method === 'PUT') return { json: {} }
        return pass
      }),
    })
    await push(t)
    t.reset()
    loadCustomer.mockResolvedValue({ ...customer, phone: '400 00 000' })
    const out = await connector.jobs['accounting.customer'](t.ctx, { entityId: 'cus1' })
    expect(out?.summary).toBe('customer updated')
    expect(t.calls.map((c) => `${c.method} ${c.path}`)).toEqual([
      `GET ${BASE}/contacts/501`,
      `PUT ${BASE}/contacts/501`,
    ])
    expect(t.calls[1].body).toEqual({
      address: { streetAddress: 'Storgata 1', country: 'Norway' },
      name: 'Anna Berg',
      email: 'anna@example.com',
      phoneNumber: '400 00 000',
      memberNumberString: 'C-0042',
      customer: true,
    })
  })

  it('leaves a customer alone until their first invoice has gone over', async () => {
    const t = makeCtx({ answer: emptyCompany() })
    const out = await connector.jobs['accounting.customer'](t.ctx, { entityId: 'cus1' })
    expect(out?.summary).toBe('not in Fiken yet')
    expect(t.calls).toHaveLength(0)
  })
})

describe('Fiken: moving to another company', () => {
  it('starts over in the new company and never reuses ids from the old one', async () => {
    let answer: Answer = emptyCompany()
    const t = makeCtx({ answer: (call) => answer(call) })
    await push(t)
    t.reset()
    t.ctx.connection.settings.companySlug = 'ekte-verksted-as'
    t.state.company = {
      slug: 'ekte-verksted-as',
      vatRegistered: true,
      fetchedAt: new Date().toISOString(),
    }
    const other = '/api/v2/companies/ekte-verksted-as'
    answer = (call) => {
      if (call.method === 'GET') return { json: [] }
      if (call.path === `${other}/contacts`) return { created: 601 }
      if (call.path === `${other}/sales`) return { created: 9500 }
      if (call.path === `${other}/sales/9500/attachments`) return { status: 201 }
      throw new Error(`unexpected ${call.method} ${call.path}`)
    }
    const out = await push(t)
    expect(out?.summary).toBe('invoice INV-1001 created')
    expect(t.calls.map((c) => `${c.method} ${c.path}`)).toEqual([
      `GET ${other}/contacts`,
      `POST ${other}/contacts`,
      `GET ${other}/sales`,
      `POST ${other}/sales`,
      `GET ${other}/sales/9500`,
      `POST ${other}/sales/9500/attachments`,
    ])
    expect(t.calls[3].body?.customerId).toBe(601)
    expect(t.links.get('ServiceRecord:svc1')).toMatchObject({
      remoteId: '9500',
      metadata: { company: 'ekte-verksted-as', contactId: 601 },
    })
  })
})

describe('Fiken: a deleted invoice', () => {
  it('reverses the sale', async () => {
    const t = makeCtx({
      answer: emptyCompany((call) =>
        call.method === 'GET' && call.path === `${BASE}/sales/9001`
          ? { json: { saleId: 9001, salePayments: [] } }
          : pass
      ),
    })
    await push(t)
    t.reset()
    loadInvoice.mockResolvedValue(null)
    const out = await push(t)
    expect(out?.summary).toBe('sale INV-1001 reversed')
    expect(t.calls[1]).toMatchObject({
      method: 'PATCH',
      path: `${BASE}/sales/9001/delete`,
      query: { description: 'Deleted in Torqvoice' },
    })
    expect(t.links.has('ServiceRecord:svc1')).toBe(false)
  })

  it('leaves a sale with payments in Fiken', async () => {
    const t = makeCtx({
      answer: emptyCompany((call) =>
        call.method === 'GET' && call.path === `${BASE}/sales/9001`
          ? { json: { saleId: 9001, settled: true } }
          : pass
      ),
    })
    await push(t)
    t.reset()
    loadInvoice.mockResolvedValue(null)
    const out = await push(t)
    expect(out?.summary).toBe('left in Fiken, has payments')
    expect(t.calls.map((c) => c.method)).toEqual(['GET'])
    expect(t.links.has('ServiceRecord:svc1')).toBe(false)
  })

  it('forgets a sale Fiken no longer has', async () => {
    const t = makeCtx({
      answer: emptyCompany((call) =>
        call.method === 'GET' && call.path === `${BASE}/sales/9001`
          ? { status: 404, json: { message: 'Not found' } }
          : pass
      ),
    })
    await push(t)
    loadInvoice.mockResolvedValue(null)
    expect((await push(t))?.summary).toBe('already gone from Fiken')
    expect((await push(t))?.summary).toBe('nothing to do')
  })
})

describe('Fiken: payments', () => {
  it('records a payment on the sale, in øre, on the chosen account', async () => {
    const t = makeCtx({ answer: emptyCompany() })
    loadInvoice.mockResolvedValue({ ...invoice, payments: [payment] })
    const out = await connector.jobs['accounting.payment'](t.ctx, { entityId: 'pay1' })
    expect(out?.summary).toBe('payment recorded')
    const pay = t.calls.at(-1)
    expect(pay).toMatchObject({ method: 'POST', path: `${BASE}/sales/9001/payments` })
    expect(pay?.body).toEqual({ date: '2026-09-05', account: '1920:10001', amount: 37500 })
    expect(t.links.get('Payment:pay1')).toMatchObject({
      remoteId: '7001',
      metadata: { company: SLUG, createdByUs: true, serviceRecordId: 'svc1', saleId: '9001' },
    })
    expect(t.links.get('ServiceRecord:svc1')?.metadata?.payments).toEqual(['7001'])

    t.reset()
    expect((await connector.jobs['accounting.payment'](t.ctx, { entityId: 'pay1' }))?.summary).toBe(
      'unchanged'
    )
    expect(t.calls).toHaveLength(0)
  })

  it('finds the first ordinary bank account once when none is chosen', async () => {
    const t = makeCtx({
      settings: { paymentAccount: '' },
      answer: emptyCompany((call) =>
        call.method === 'GET' && call.path === `${BASE}/bankAccounts`
          ? {
              json: [
                { accountCode: '1950:10001', type: 'tax_deduction' },
                { accountCode: '1920:10007', type: 'normal' },
              ],
            }
          : pass
      ),
    })
    loadInvoice.mockResolvedValue({ ...invoice, payments: [payment, { ...payment, id: 'pay2' }] })
    await push(t)
    const bank = t.calls.filter((c) => c.path === `${BASE}/bankAccounts`)
    expect(bank).toHaveLength(1)
    expect(bank[0].query).toEqual({ inactive: 'false', ...PAGE })
    const pays = t.calls.filter((c) => c.path.endsWith('/payments'))
    expect(pays.map((c) => c.body?.account)).toEqual(['1920:10007', '1920:10007'])
    expect(t.state.paymentAccount).toEqual({ slug: SLUG, code: '1920:10007' })
  })

  it('does not send payments when that is switched off, or money handed back', async () => {
    const off = makeCtx({ settings: { pushPayments: false }, answer: emptyCompany() })
    loadInvoice.mockResolvedValue({ ...invoice, payments: [payment] })
    expect(
      (await connector.jobs['accounting.payment'](off.ctx, { entityId: 'pay1' }))?.summary
    ).toBe('payments not sent')
    const refund = makeCtx({ answer: emptyCompany() })
    loadInvoice.mockResolvedValue({ ...invoice, payments: [{ ...payment, amount: -50 }] })
    await push(refund)
    expect(refund.calls.some((c) => c.path.endsWith('/payments'))).toBe(false)
  })

  it('removes a payment deleted here, and leaves one that came from Fiken', async () => {
    const t = makeCtx({ answer: emptyCompany() })
    loadInvoice.mockResolvedValue({ ...invoice, payments: [payment] })
    await push(t)
    t.reset()
    loadPayment.mockResolvedValue(null)
    const out = await connector.jobs['accounting.payment'](t.ctx, { entityId: 'pay1' })
    expect(out?.summary).toBe('payment deleted')
    expect(t.calls).toHaveLength(1)
    expect(t.calls[0]).toMatchObject({
      method: 'DELETE',
      path: `${BASE}/sales/9001/payments/7001`,
      query: { description: 'Deleted in Torqvoice' },
    })
    expect(t.links.has('Payment:pay1')).toBe(false)
    expect(t.links.get('ServiceRecord:svc1')?.metadata?.payments).toEqual([])

    await t.ctx.links.set('Payment', 'pulled1', {
      remoteId: '7100',
      metadata: { company: SLUG, createdByUs: false, serviceRecordId: 'svc1', saleId: '9001' },
    })
    t.reset()
    const kept = await connector.jobs['accounting.payment'](t.ctx, { entityId: 'pulled1' })
    expect(kept?.summary).toBe('payment came from Fiken; left there')
    expect(t.calls).toHaveLength(0)
  })

  it('closes an invoice marked paid by hand with one payment for what Fiken shows as owed', async () => {
    const t = makeCtx({
      settings: { manualPaidAsPayment: true },
      answer: emptyCompany((call) =>
        call.method === 'GET' && call.path === `${BASE}/sales/9001`
          ? { json: { saleId: 9001, outstandingBalance: 37500, settled: false } }
          : pass
      ),
    })
    loadInvoice.mockResolvedValue({ ...invoice, manuallyPaid: true })
    const out = await push(t)
    expect(out?.summary).toBe('invoice INV-1001 created, 1 payments recorded')
    expect(t.calls.at(-1)?.body).toEqual({
      date: '2026-09-04',
      account: '1920:10001',
      amount: 37500,
    })
    expect(t.links.get('Payment:manual:svc1')?.metadata).toMatchObject({ manual: true })

    t.reset()
    await push(t)
    expect(t.calls).toHaveLength(0)
  })
})

describe('Fiken: pulling payments', () => {
  const salesWith = (payments: unknown[], extra: Record<string, unknown> = {}): Answer =>
    emptyCompany((call) =>
      call.method === 'GET' && call.path === `${BASE}/sales` && call.query.lastModifiedGe
        ? {
            json: [
              { saleId: 9001, salePayments: payments, ...extra },
              {
                saleId: 4444,
                salePayments: [
                  { paymentId: 1, date: '2026-09-06', account: '1920:10001', amount: 100 },
                ],
              },
            ],
          }
        : pass
    )

  it('records a payment registered in Fiken on the invoice here, once', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-09-10T08:00:00Z'))
    let answer = emptyCompany()
    const t = makeCtx({ answer: (call) => answer(call) })
    await push(t)
    t.reset()
    answer = salesWith([
      { paymentId: 7100, date: '2026-09-06', account: '1920:10001', amount: 37500 },
    ])
    const out = await connector.jobs['accounting.pull'](t.ctx, {})
    expect(out?.summary).toBe('1 payments recorded')
    expect(t.calls).toHaveLength(1)
    expect(t.calls[0].query).toEqual({ lastModifiedGe: '2026-09-09', ...PAGE })
    expect(recordPulledPayment).toHaveBeenCalledTimes(1)
    expect(recordPulledPayment).toHaveBeenCalledWith('org1', {
      serviceRecordId: 'svc1',
      amount: 375,
      date: new Date('2026-09-06T12:00:00Z'),
      method: 'transfer',
      provider: 'fiken',
      externalId: '7100',
      note: 'Recorded in Fiken',
    })
    expect(t.links.get('Payment:pulled1')).toMatchObject({
      remoteId: '7100',
      metadata: { createdByUs: false, serviceRecordId: 'svc1', saleId: '9001' },
    })
    expect(t.state.lastPullDay).toBe('2026-09-10')

    // The next pull reads from the day before the last one and sees the same payment.
    vi.setSystemTime(new Date('2026-09-12T08:00:00Z'))
    t.reset()
    const again = await connector.jobs['accounting.pull'](t.ctx, {})
    expect(again?.summary).toBe('no changes')
    expect(t.calls[0].query.lastModifiedGe).toBe('2026-09-09')
    expect(recordPulledPayment).toHaveBeenCalledTimes(1)
  })

  it('removes a pulled payment that was deleted in Fiken', async () => {
    let answer = emptyCompany()
    const t = makeCtx({ answer: (call) => answer(call) })
    await push(t)
    answer = salesWith([{ paymentId: 7100, date: '2026-09-06', account: '1900', amount: 37500 }])
    await connector.jobs['accounting.pull'](t.ctx, {})
    expect(recordPulledPayment.mock.calls[0][1]).toMatchObject({ method: 'cash' })
    answer = salesWith([])
    const out = await connector.jobs['accounting.pull'](t.ctx, {})
    expect(out?.summary).toBe('1 payments removed')
    expect(removePulledPayment).toHaveBeenCalledWith('org1', 'pulled1', 'fiken')
    expect(t.links.has('Payment:pulled1')).toBe(false)
    expect(t.links.get('ServiceRecord:svc1')?.metadata?.payments).toEqual([])
  })

  it('keeps a payment made here when Fiken deleted its copy, and says so', async () => {
    let answer = emptyCompany()
    const t = makeCtx({ answer: (call) => answer(call) })
    loadInvoice.mockResolvedValue({ ...invoice, payments: [payment] })
    await push(t)
    answer = salesWith([])
    const out = await connector.jobs['accounting.pull'](t.ctx, {})
    expect(out?.summary).toBe('no changes')
    expect(removePulledPayment).not.toHaveBeenCalled()
    expect(t.links.has('Payment:pay1')).toBe(false)
    expect(t.logs.at(-1)).toMatchObject({ level: 'warn' })
    expect(t.logs.at(-1)?.message).toContain('deleted in Fiken; it is kept here')
  })

  it('does not bring back a payment this app sent', async () => {
    let answer = emptyCompany()
    const t = makeCtx({ answer: (call) => answer(call) })
    loadInvoice.mockResolvedValue({ ...invoice, payments: [payment] })
    await push(t)
    answer = salesWith([
      { paymentId: 7001, date: '2026-09-05', account: '1920:10001', amount: 37500 },
    ])
    const out = await connector.jobs['accounting.pull'](t.ctx, {})
    expect(out?.summary).toBe('no changes')
    expect(recordPulledPayment).not.toHaveBeenCalled()
  })

  it('unlinks a sale deleted in Fiken so an edit here enters it again', async () => {
    let answer = emptyCompany()
    const t = makeCtx({ answer: (call) => answer(call) })
    await push(t)
    answer = salesWith([], { deleted: true })
    const out = await connector.jobs['accounting.pull'](t.ctx, {})
    expect(out?.summary).toBe('1 sales unlinked')
    expect(t.links.has('ServiceRecord:svc1')).toBe(false)
  })

  it('does nothing when the pull is switched off', async () => {
    const t = makeCtx({ settings: { pullPayments: false }, answer: emptyCompany() })
    expect((await connector.jobs['accounting.pull'](t.ctx, {}))?.summary).toBe('pull switched off')
    expect(t.calls).toHaveLength(0)
  })
})

describe('Fiken: the connection', () => {
  it('names the person who gave access without exposing their email as the id', async () => {
    const t = makeCtx({
      answer: () => ({ json: { name: 'Kari Nordmann', email: 'kari@example.com' } }),
    })
    const who = await connector.identify?.(t.ctx)
    expect(t.calls[0].path).toBe('/api/v2/user')
    expect(who?.name).toBe('Kari Nordmann')
    expect(who?.id).toMatch(/^fiken-[0-9a-f]{16}$/)
  })

  it('fails the test when the company has no API module', async () => {
    const t = makeCtx({
      answer: (call) =>
        call.path === BASE
          ? { json: { slug: SLUG, name: 'Verksted AS', hasApiAccess: false } }
          : { json: { name: 'Kari' } },
    })
    expect(await connector.test(t.ctx)).toEqual({
      ok: false,
      message:
        'The API module is not activated for Verksted AS in Fiken. Activate it under Foretak, Tilleggstjenester.',
    })
    const testCompany = makeCtx({
      answer: (call) =>
        call.path === BASE
          ? { json: { slug: SLUG, name: 'Torqvoice Test', hasApiAccess: false, testCompany: true } }
          : { json: { name: 'Kari' } },
    })
    expect(await connector.test(testCompany.ctx)).toEqual({ ok: true })
    const refused = makeCtx({ answer: () => ({ status: 403, json: { message: 'Ingen tilgang' } }) })
    const result = await connector.test(refused.ctx)
    expect(result.ok).toBe(false)
    expect(result.message).toContain('Fiken: Ingen tilgang (request ')
  })

  it('lists companies, income accounts and bank accounts for the settings', async () => {
    const t = makeCtx({
      answer: (call) => {
        if (call.path === '/api/v2/companies') {
          return {
            json: [
              { slug: 'verksted-as', name: 'Verksted AS', organizationNumber: '987654321' },
              { slug: 'test', name: 'Torqvoice Test' },
            ],
          }
        }
        if (call.path === `${BASE}/accounts`) {
          return {
            json: [
              { code: '3100', name: 'Salgsinntekt, avgiftsfri' },
              { code: '3000', name: 'Salgsinntekt, avgiftspliktig' },
            ],
          }
        }
        return { json: [{ accountCode: '1920:10001', name: 'Driftskonto', type: 'normal' }] }
      },
    })
    expect(await connector.remoteOptions?.companies(t.ctx)).toEqual([
      { value: 'test', label: 'Torqvoice Test' },
      { value: 'verksted-as', label: 'Verksted AS, 987654321' },
    ])
    expect(await connector.remoteOptions?.incomeAccounts(t.ctx)).toEqual([
      { value: '3000', label: '3000 Salgsinntekt, avgiftspliktig' },
      { value: '3100', label: '3100 Salgsinntekt, avgiftsfri' },
    ])
    expect(t.calls[1].query).toEqual({ fromAccount: '3000', toAccount: '3999' })
    expect(await connector.remoteOptions?.paymentAccounts(t.ctx)).toEqual([
      { value: '1920:10001', label: 'Driftskonto (1920:10001)' },
    ])

    const unset = makeCtx({ settings: { companySlug: '' }, answer: () => ({ json: [] }) })
    expect(await connector.remoteOptions?.incomeAccounts(unset.ctx)).toEqual([])
    expect(unset.calls).toHaveLength(0)
  })

  it('reads a long list page by page', async () => {
    const t = makeCtx({
      answer: (call) => ({
        json:
          call.query.page === '0'
            ? Array.from({ length: 100 }, (_, i) => ({ slug: `a${i}`, name: `A ${i}` }))
            : [{ slug: 'z', name: 'Z' }],
        headers: { 'Fiken-Api-Page-Count': '2' },
      }),
    })
    const options = await connector.remoteOptions?.companies(t.ctx)
    expect(options).toHaveLength(101)
    expect(t.calls.map((c) => c.query.page)).toEqual(['0', '1'])
  })

  it('sends one request at a time, as Fiken demands', async () => {
    let inFlight = 0
    let most = 0
    const t = makeCtx({ answer: () => ({ json: [] }) })
    const fetchNow = t.ctx.http.fetch
    t.ctx.http.fetch = async (url, init) => {
      inFlight++
      most = Math.max(most, inFlight)
      await new Promise((resolve) => setTimeout(resolve, 5))
      const res = await fetchNow(url, init)
      inFlight--
      return res
    }
    await Promise.all([
      connector.remoteOptions?.companies(t.ctx),
      connector.remoteOptions?.incomeAccounts(t.ctx),
      connector.remoteOptions?.paymentAccounts(t.ctx),
    ])
    expect(t.calls).toHaveLength(3)
    expect(most).toBe(1)
  })

  it('hands the grant back on disconnect', async () => {
    const t = makeCtx({ answer: () => ({ json: {} }) })
    await connector.onDisconnect?.(t.ctx)
    expect(t.calls).toHaveLength(1)
    expect(t.calls[0]).toMatchObject({ method: 'POST', host: 'fiken.no', path: '/oauth/revoke' })
  })
})
