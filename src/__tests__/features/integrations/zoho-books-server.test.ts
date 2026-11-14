import { beforeEach, describe, expect, it, vi } from 'vitest'
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

/**
 * The connector against a scripted Zoho Books: every call it makes is
 * recorded and answered from here, so the paths and bodies that would reach
 * Zoho are asserted without an organisation. The answers copy what the
 * live organisation sent on 14 Nov 2026.
 */

const loadInvoice = vi.fn<(orgId: string, id: string) => Promise<AccountingInvoice | null>>()
const loadPayment = vi.fn<(orgId: string, id: string) => Promise<AccountingPayment | null>>()
const recordPulledPayment = vi.fn()
const removePulledPayment = vi.fn()

vi.mock('@/features/integrations/Lib/accounting-sync', () => ({
  INVOICE_ENTITY: 'ServiceRecord',
  CUSTOMER_ENTITY: 'Customer',
  PAYMENT_ENTITY: 'Payment',
  loadInvoiceForAccounting: (orgId: string, id: string) => loadInvoice(orgId, id),
  loadPaymentForAccounting: (orgId: string, id: string) => loadPayment(orgId, id),
  loadCustomerForAccounting: async () => null,
  loadInvoicePdfForAccounting: async () => ({
    buffer: new Uint8Array([37, 80, 68, 70]),
    filename: 'x.pdf',
  }),
  recordPulledPayment: (...args: unknown[]) => recordPulledPayment(...args),
  removePulledPayment: (...args: unknown[]) => removePulledPayment(...args),
  workshopCurrency: async () => 'NOK',
  workshopDistanceUnit: async () => 'km',
}))

const { connector } = await import('@/integrations/zoho-books/server')

interface Call {
  method: string
  path: string
  query: Record<string, string>
  body: Record<string, unknown> | null
}

type Answer = (call: Call) => unknown

const BASE = '/books/v3'

function zohoError(status: number, code: number, message: string): ConnectorHttpError {
  return new ConnectorHttpError(
    status,
    JSON.stringify({ code, message }),
    'https://www.zohoapis.eu/books/v3/x'
  )
}

function makeCtx(input: { settings?: Record<string, unknown>; answer: Answer }) {
  const calls: Call[] = []
  const uploads: { url: string; method: string }[] = []
  const links = new Map<string, LinkRecord & { entityId: string; entityType: string }>()
  const logs: { level: LogLevel; message: string }[] = []
  const now = new Date().toISOString()
  const state: Record<string, unknown> = {
    org: {
      organizationId: '201',
      fetchedAt: now,
      name: 'Torqvoice',
      currencyCode: 'NOK',
      locationsEnabled: false,
    },
    catalog: {
      organizationId: '201',
      fetchedAt: now,
      taxes: [
        { id: 'tax25', name: 'MVA 25%', percent: 25 },
        { id: 'tax15', name: 'MVA 15%', percent: 15 },
      ],
      skus: {},
      currencies: { NOK: 'cur-nok' },
    },
    walkIn: null,
    lastPull: null,
    deposit: { organizationId: '201', fetchedAt: now, accountId: 'acc-undeposited' },
  }
  const key = (t: string, e: string) => `${t}:${e}`
  const ctx: ConnectorContext = {
    connection: {
      id: 'conn1',
      organizationId: 'org1',
      connectorId: 'zoho-books',
      settings: { organizationId: '201', ...input.settings },
      state,
      externalAccountId: 'zoho-abc',
    },
    credentials: { accessToken: 'tok', refreshToken: 'ref', apiDomain: 'https://www.zohoapis.eu' },
    http: {
      async fetch(url: string, init?: RequestInit) {
        uploads.push({ url, method: init?.method ?? 'GET' })
        return new Response(
          JSON.stringify({
            code: 0,
            documents: [{ document_id: 'doc-new', file_name: '2026-1054.pdf' }],
          }),
          { status: 200 }
        )
      },
      async json<T>(url: string, init?: RequestInit): Promise<T> {
        const u = new URL(url)
        const call: Call = {
          method: init?.method ?? 'GET',
          path: u.pathname.replace(BASE, ''),
          query: Object.fromEntries(u.searchParams.entries()),
          body: init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : null,
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
    timezone: 'Europe/Oslo',
    appUrl: 'https://shop.example.com',
  }
  return { ctx, calls, uploads, links, logs, state }
}

const customer: AccountingCustomer = {
  id: 'cus1',
  name: 'Kari Nordmann',
  email: 'kari@example.com',
  phone: null,
  address: null,
  company: null,
  taxId: null,
  taxExempt: false,
  customerNumber: null,
}

const invoice: AccountingInvoice = {
  id: 'svc1',
  vehicleId: 'veh1',
  title: 'Oil service',
  invoiceNumber: '2026-1054',
  status: 'completed',
  issuedAt: new Date('2026-11-04T09:00:00Z'),
  invoiceDate: new Date('2026-11-04T09:00:00Z'),
  serviceDate: new Date('2026-11-03T09:00:00Z'),
  dueDate: new Date('2026-11-18T09:00:00Z'),
  mileage: null,
  notes: null,
  subtotal: 1000,
  taxableSubtotal: null,
  discountType: null,
  discountValue: 0,
  discountAmount: 0,
  taxRate: 25,
  taxAmount: 250,
  taxInclusive: false,
  totalAmount: 1250,
  manuallyPaid: false,
  customer,
  vehicle: null,
  lines: [
    {
      kind: 'labor',
      description: 'Service',
      partNumber: null,
      quantity: 1,
      unitPrice: 1000,
      total: 1000,
      taxable: true,
    },
  ],
  payments: [],
}

const cashPayment: AccountingPayment = {
  id: 'pay1',
  serviceRecordId: 'svc1',
  amount: 1250,
  date: new Date('2026-11-05T09:00:00Z'),
  method: 'cash',
  note: null,
  provider: null,
  externalId: null,
}

interface Remote {
  status: string
  total: number
  balance: number
  adjustment?: number
}

/** A Zoho that holds one invoice and answers the calls this connector makes. */
function zoho(remote: Remote, overrides: Partial<Record<string, Answer>> = {}): Answer {
  return (call) => {
    const id = `${call.method} ${call.path}`
    for (const [pattern, answer] of Object.entries(overrides)) {
      if (new RegExp(`^${pattern}$`).test(id) && answer) return answer(call)
    }
    if (id === 'GET /contacts') return { code: 0, contacts: [] }
    if (id === 'POST /contacts') return { code: 0, contact: { contact_id: 'zc1' } }
    if (id === 'GET /invoices') return { code: 0, invoices: [] }
    if (id === 'POST /invoices' || id === 'PUT /invoices/zi1') {
      return {
        code: 0,
        invoice: {
          invoice_id: 'zi1',
          invoice_number: '2026-1054',
          status: remote.status,
          total: remote.total,
          balance: remote.balance,
          adjustment: remote.adjustment ?? 0,
          line_items: [{ line_item_id: 'li1' }],
        },
      }
    }
    if (id === 'GET /invoices/zi1') {
      return {
        code: 0,
        invoice: {
          invoice_id: 'zi1',
          invoice_number: '2026-1054',
          customer_id: 'zc1',
          status: remote.status,
          total: remote.total,
          balance: remote.balance,
          adjustment: remote.adjustment ?? 0,
          line_items: [{ line_item_id: 'li1' }],
        },
      }
    }
    if (id === 'POST /invoices/zi1/status/sent') {
      remote.status = 'sent'
      return { code: 0 }
    }
    if (id === 'GET /invoices/zi1/payments') return { code: 0, payments: [] }
    if (id === 'POST /customerpayments') return { code: 0, payment: { payment_id: 'zp1' } }
    throw new Error(`unexpected ${id}`)
  }
}

beforeEach(() => {
  loadInvoice.mockReset()
  loadPayment.mockReset()
  recordPulledPayment.mockReset()
  removePulledPayment.mockReset()
})

async function run(ctx: ConnectorContext, job: string, entityId?: string): Promise<JobOutcome> {
  return (await connector.jobs[job](ctx, entityId ? { entityId } : {})) ?? {}
}

describe('sending an invoice', () => {
  it('creates the contact and the invoice under the Torqvoice number, marks it sent and attaches the PDF', async () => {
    loadInvoice.mockResolvedValue(invoice)
    const remote: Remote = { status: 'draft', total: 1250, balance: 1250 }
    const { ctx, calls, uploads } = makeCtx({ answer: zoho(remote) })
    const out = await run(ctx, 'accounting.invoice', 'svc1')
    expect(out.summary).toBe('invoice 2026-1054 created')
    const create = calls.find((c) => c.method === 'POST' && c.path === '/invoices')
    expect(create?.query).toMatchObject({
      organization_id: '201',
      ignore_auto_number_generation: 'true',
    })
    expect(create?.body).toMatchObject({
      customer_id: 'zc1',
      invoice_number: '2026-1054',
      notes: '',
      adjustment: 0,
      line_items: [
        { description: 'Service', rate: 1000, quantity: 1, tax_id: 'tax25', discount: 0 },
      ],
    })
    expect(create?.body).not.toHaveProperty('reason')
    expect(calls.some((c) => c.path === '/invoices/zi1/status/sent')).toBe(true)
    expect(uploads.map((u) => u.url)).toEqual([
      expect.stringContaining('/books/v3/invoices/zi1/attachment?organization_id=201'),
    ])
  })

  it('closes a cent of Zoho’s tax rounding with its rounding adjustment, keeping the line ids', async () => {
    loadInvoice.mockResolvedValue(invoice)
    const remote: Remote = { status: 'draft', total: 1249.99, balance: 1249.99 }
    const { ctx, calls } = makeCtx({
      settings: { attachPdf: false },
      answer: zoho(remote, {
        'PUT /invoices/zi1': (call) => {
          remote.total = 1249.99 + Number(call.body?.adjustment ?? 0)
          return {
            code: 0,
            invoice: {
              invoice_id: 'zi1',
              status: 'draft',
              total: remote.total,
              balance: remote.total,
              line_items: [{ line_item_id: 'li1' }],
            },
          }
        },
      }),
    })
    await run(ctx, 'accounting.invoice', 'svc1')
    const fix = calls.find((c) => c.method === 'PUT' && c.path === '/invoices/zi1')
    expect(fix?.body).toMatchObject({
      adjustment: 0.01,
      adjustment_description: 'Rounding',
      line_items: [{ line_item_id: 'li1' }],
    })
    expect(remote.total).toBe(1250)
  })

  it('leaves a bigger gap alone and says so, rather than hiding a real difference', async () => {
    loadInvoice.mockResolvedValue(invoice)
    const remote: Remote = { status: 'sent', total: 1240, balance: 1240 }
    const { ctx, calls, logs } = makeCtx({ settings: { attachPdf: false }, answer: zoho(remote) })
    await run(ctx, 'accounting.invoice', 'svc1')
    expect(calls.filter((c) => c.method === 'PUT')).toHaveLength(0)
    expect(logs.some((l) => /Zoho Books total 1240 differs from 1250/.test(l.message))).toBe(true)
  })

  it('sends nothing when nothing changed, and gives a reason when a sent invoice changes', async () => {
    loadInvoice.mockResolvedValue(invoice)
    const remote: Remote = { status: 'draft', total: 1250, balance: 1250 }
    const { ctx, calls } = makeCtx({ settings: { attachPdf: false }, answer: zoho(remote) })
    await run(ctx, 'accounting.invoice', 'svc1')
    calls.length = 0
    expect((await run(ctx, 'accounting.invoice', 'svc1')).summary).toBe(
      'invoice 2026-1054 unchanged'
    )
    expect(calls.filter((c) => c.method !== 'GET')).toHaveLength(0)

    loadInvoice.mockResolvedValue({ ...invoice, title: 'Oil and filters', notes: 'Changed <here>' })
    await run(ctx, 'accounting.invoice', 'svc1')
    const update = calls.find((c) => c.method === 'PUT')
    expect(update?.body).toMatchObject({ reason: 'Changed in Torqvoice', notes: 'Changed ‹here›' })
  })

  it('keeps a voided invoice out, since Zoho keeps its number, and sends it again once renumbered', async () => {
    loadInvoice.mockResolvedValue(invoice)
    const remote: Remote = { status: 'draft', total: 1250, balance: 1250 }
    const { ctx, logs } = makeCtx({ settings: { attachPdf: false }, answer: zoho(remote) })
    await run(ctx, 'accounting.invoice', 'svc1')
    remote.status = 'void'
    loadInvoice.mockResolvedValue({ ...invoice, notes: 'edited' })
    expect((await run(ctx, 'accounting.invoice', 'svc1')).summary).toContain('voided in Zoho Books')
    expect(logs.some((l) => l.level === 'warn' && /voided in Zoho Books/.test(l.message))).toBe(
      true
    )
    expect((await run(ctx, 'accounting.invoice', 'svc1')).summary).toContain('not sent again')
  })

  it('says plainly when the organisation has used its calls for the day', async () => {
    loadInvoice.mockResolvedValue(invoice)
    const { ctx } = makeCtx({
      answer: zoho(
        { status: 'draft', total: 1250, balance: 1250 },
        {
          'GET /contacts': () => {
            throw zohoError(429, 45, 'You have exceeded the maximum call rate limit of 1000.')
          },
        }
      ),
    })
    await expect(run(ctx, 'accounting.invoice', 'svc1')).rejects.toThrow(
      /used its API calls for today/
    )
  })
})

describe('deleting a job here', () => {
  async function linked(status: string, balance = 1250) {
    loadInvoice.mockResolvedValue(invoice)
    const remote: Remote = { status: 'draft', total: 1250, balance: 1250 }
    const made = makeCtx({
      settings: { attachPdf: false, invoiceStatus: 'draft' },
      answer: zoho(remote, {
        'DELETE /invoices/zi1': () => ({ code: 0 }),
        'POST /invoices/zi1/status/void': () => ({ code: 0 }),
      }),
    })
    await run(made.ctx, 'accounting.invoice', 'svc1')
    remote.status = status
    remote.balance = balance
    loadInvoice.mockResolvedValue(null)
    made.calls.length = 0
    return made
  }

  it('deletes a draft, which frees its number', async () => {
    const { ctx, calls } = await linked('draft')
    expect((await run(ctx, 'accounting.invoice', 'svc1')).summary).toContain(
      'deleted in Zoho Books'
    )
    expect(calls.some((c) => c.method === 'DELETE' && c.path === '/invoices/zi1')).toBe(true)
  })

  it('voids a sent one', async () => {
    const { ctx, calls } = await linked('sent')
    expect((await run(ctx, 'accounting.invoice', 'svc1')).summary).toContain('voided in Zoho Books')
    expect(calls.some((c) => c.path === '/invoices/zi1/status/void')).toBe(true)
  })

  it('never touches one with payments in Zoho', async () => {
    const { ctx, calls, logs } = await linked('partially_paid', 250)
    expect((await run(ctx, 'accounting.invoice', 'svc1')).summary).toBe(
      'left in Zoho Books, has payments'
    )
    expect(calls.filter((c) => c.method !== 'GET')).toHaveLength(0)
    expect(logs.some((l) => /has payments in Zoho Books/.test(l.message))).toBe(true)
  })
})

describe('payments', () => {
  it('records a payment into the account for its method, trimmed to the balance when a few øre over', async () => {
    loadInvoice.mockResolvedValue({ ...invoice, payments: [{ ...cashPayment, amount: 1250.03 }] })
    const remote: Remote = { status: 'draft', total: 1250, balance: 1250 }
    const { ctx, calls } = makeCtx({
      settings: { attachPdf: false, cashAccount: 'acc-cash' },
      answer: zoho(remote),
    })
    const out = await run(ctx, 'accounting.invoice', 'svc1')
    expect(out.summary).toContain('1 payments recorded')
    expect(calls.find((c) => c.path === '/customerpayments')?.body).toMatchObject({
      customer_id: 'zc1',
      payment_mode: 'cash',
      amount: 1250,
      account_id: 'acc-cash',
      invoices: [{ invoice_id: 'zi1', amount_applied: 1250 }],
    })
  })

  it('waits while the invoice is a draft in Zoho, and goes once it is sent', async () => {
    loadInvoice.mockResolvedValue({ ...invoice, payments: [cashPayment] })
    loadPayment.mockResolvedValue(cashPayment)
    const remote: Remote = { status: 'draft', total: 1250, balance: 1250 }
    const { ctx, calls } = makeCtx({
      settings: { attachPdf: false, invoiceStatus: 'draft' },
      answer: zoho(remote),
    })
    const waiting = await run(ctx, 'accounting.payment', 'pay1')
    expect(waiting).toMatchObject({ rescheduleInSeconds: 3600 })
    expect(calls.some((c) => c.path === '/customerpayments')).toBe(false)
    remote.status = 'sent'
    expect((await run(ctx, 'accounting.payment', 'pay1')).summary).toBe('payment recorded')
  })

  it('brings back a payment recorded in Zoho, and removes one deleted there', async () => {
    loadInvoice.mockResolvedValue(invoice)
    const remote: Remote = { status: 'sent', total: 1250, balance: 1250 }
    let theirs = [
      { payment_id: 'zp9', amount: 500, date: '2026-11-10', reference_number: 'BANK-1' },
    ]
    const { ctx } = makeCtx({
      settings: { attachPdf: false },
      answer: zoho(remote, {
        'GET /invoices': (call) =>
          call.query.last_modified_time
            ? {
                code: 0,
                invoices: [{ invoice_id: 'zi1', status: 'partially_paid', customer_id: 'zc1' }],
              }
            : { code: 0, invoices: [] },
        'GET /invoices/zi1/payments': () => ({ code: 0, payments: theirs }),
      }),
    })
    await run(ctx, 'accounting.invoice', 'svc1')
    recordPulledPayment.mockResolvedValue({ id: 'local9', created: true })
    expect((await run(ctx, 'accounting.pull')).summary).toBe('1 payments recorded')
    expect(recordPulledPayment).toHaveBeenCalledWith(
      'org1',
      expect.objectContaining({
        serviceRecordId: 'svc1',
        amount: 500,
        provider: 'zoho-books',
        externalId: 'zp9',
        note: 'Recorded in Zoho Books. Ref BANK-1',
      })
    )

    theirs = []
    loadInvoice.mockResolvedValue({
      ...invoice,
      payments: [
        { ...cashPayment, id: 'local9', amount: 500, provider: 'zoho-books', externalId: 'zp9' },
      ],
    })
    removePulledPayment.mockImplementation(async () => {
      // Gone here too, as the real removal deletes the row.
      loadInvoice.mockResolvedValue(invoice)
      return true
    })
    expect((await run(ctx, 'accounting.pull')).summary).toBe('1 payments removed')
    expect(removePulledPayment).toHaveBeenCalledWith('org1', 'local9', 'zoho-books')
  })

  it('keeps a payment from here that the bookkeeper removed in Zoho, and never sends it again', async () => {
    const sent = { ...cashPayment, amount: 500 }
    loadInvoice.mockResolvedValue({ ...invoice, payments: [sent] })
    const remote: Remote = { status: 'sent', total: 1250, balance: 1250 }
    const { ctx, calls, logs } = makeCtx({
      settings: { attachPdf: false },
      answer: zoho(remote, {
        'GET /invoices': (call) =>
          call.query.last_modified_time
            ? { code: 0, invoices: [{ invoice_id: 'zi1', status: 'sent', customer_id: 'zc1' }] }
            : { code: 0, invoices: [] },
      }),
    })
    await run(ctx, 'accounting.invoice', 'svc1')
    expect(calls.filter((c) => c.path === '/customerpayments')).toHaveLength(1)
    // Removed in Zoho: its payments list is empty from now on.
    await run(ctx, 'accounting.pull')
    await run(ctx, 'accounting.pull')
    await run(ctx, 'accounting.invoice', 'svc1')
    expect(calls.filter((c) => c.path === '/customerpayments')).toHaveLength(1)
    expect(removePulledPayment).not.toHaveBeenCalled()
    expect(logs.filter((l) => /was removed in Zoho Books/.test(l.message))).toHaveLength(1)
  })
})
