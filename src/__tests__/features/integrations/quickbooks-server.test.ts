import { beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  AccountingCustomer,
  AccountingInvoice,
  AccountingPayment,
} from '@/features/integrations/Lib/accounting-sync'
import {
  ConnectorHttpError,
  type ConnectorContext,
  type LinkRecord,
  type LogLevel,
} from '@/features/integrations/Lib/types'

/**
 * The connector against a scripted QuickBooks: every request it makes is
 * recorded and answered from here, so the exact URLs, query parameters and
 * bodies that would reach Intuit are asserted without a company. The
 * loaders that read this app's database are replaced with fixtures.
 */

const loadInvoice = vi.fn<(orgId: string, id: string) => Promise<AccountingInvoice | null>>()
const loadPayment = vi.fn<(orgId: string, id: string) => Promise<AccountingPayment | null>>()
const loadCustomer = vi.fn<(orgId: string, id: string) => Promise<AccountingCustomer | null>>()
const recordPulledPayment = vi.fn()
const removePulledPayment = vi.fn()
const workshopCurrency = vi.fn<() => Promise<string | null>>()

vi.mock('@/features/integrations/Lib/accounting-sync', () => ({
  INVOICE_ENTITY: 'ServiceRecord',
  CUSTOMER_ENTITY: 'Customer',
  PAYMENT_ENTITY: 'Payment',
  invoiceUrl: (appUrl: string, inv: { id: string; vehicleId: string | null }) =>
    inv.vehicleId
      ? `${appUrl}/vehicles/${inv.vehicleId}/service/${inv.id}`
      : `${appUrl}/sales/${inv.id}`,
  loadInvoiceForAccounting: (orgId: string, id: string) => loadInvoice(orgId, id),
  loadPaymentForAccounting: (orgId: string, id: string) => loadPayment(orgId, id),
  loadCustomerForAccounting: (orgId: string, id: string) => loadCustomer(orgId, id),
  recordPulledPayment: (...args: unknown[]) => recordPulledPayment(...args),
  removePulledPayment: (...args: unknown[]) => removePulledPayment(...args),
  workshopCurrency: () => workshopCurrency(),
}))

const { connector } = await import('@/integrations/quickbooks/server')

interface Call {
  method: string
  path: string
  query: Record<string, string>
  body: Record<string, unknown> | null
  host: string
  headers: Record<string, string>
}

type Answer = (call: Call) => unknown

function fault(status: number, code: string, message: string): ConnectorHttpError {
  return new ConnectorHttpError(
    status,
    JSON.stringify({ Fault: { Error: [{ Message: message, Detail: message, code }] } }),
    'https://quickbooks.api.intuit.com/x'
  )
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
    realmId: '9130357',
    environment: 'production',
    country: 'GB',
    homeCurrency: 'GBP',
    multiCurrency: false,
    customTxnNumbers: true,
    ...input.state,
  }
  const key = (t: string, e: string) => `${t}:${e}`
  const ctx: ConnectorContext = {
    connection: {
      id: 'conn1',
      organizationId: 'org1',
      connectorId: 'quickbooks',
      settings: { laborItemId: '7', partsItemId: '8', taxCodeId: '3', ...input.settings },
      state,
      externalAccountId: '9130357',
    },
    credentials: { accessToken: 'tok', refreshToken: 'ref' },
    http: {
      fetch: async () => {
        throw new Error('not used')
      },
      async json<T>(url: string, init?: RequestInit): Promise<T> {
        const u = new URL(url)
        const headers = Object.fromEntries(new Headers(init?.headers).entries())
        const call: Call = {
          method: init?.method ?? 'GET',
          host: u.host,
          path: u.pathname,
          query: Object.fromEntries(u.searchParams.entries()),
          body: init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : null,
          headers,
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
    timezone: 'Europe/London',
    appUrl: 'https://shop.example.com',
  }
  return { ctx, calls, links, logs, state }
}

const customer: AccountingCustomer = {
  id: 'cus1',
  name: 'Anna Berg',
  email: 'anna@example.com',
  phone: '+44 20 7946 0958',
  address: '1 High Street\nLondon',
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
  taxRate: 20,
  taxAmount: 60,
  taxInclusive: false,
  totalAmount: 360,
  manuallyPaid: false,
  customer,
  vehicle: { year: 2018, make: 'Toyota', model: 'Corolla', licensePlate: 'AB12 CDE' },
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
  amount: 360,
  date: new Date('2026-09-05T10:00:00Z'),
  method: 'card',
  note: null,
  provider: 'stripe',
  externalId: 'pi_123',
}

/** A QuickBooks that has nothing yet and accepts everything. */
function emptyCompany(): Answer {
  let nextId = 100
  return (call) => {
    if (call.path.endsWith('/query')) return { QueryResponse: {} }
    if (call.method === 'POST' && call.path.endsWith('/customer'))
      return { Customer: { Id: '58', SyncToken: '0', DisplayName: call.body?.DisplayName } }
    if (call.method === 'POST' && call.path.endsWith('/invoice'))
      return {
        Invoice: {
          Id: String(nextId++),
          SyncToken: '0',
          DocNumber: call.body?.DocNumber,
          TotalAmt: 360,
          Balance: 360,
        },
      }
    if (call.method === 'POST' && call.path.endsWith('/payment'))
      return { Payment: { Id: String(nextId++), SyncToken: '0' } }
    throw new Error(`unexpected ${call.method} ${call.path}`)
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  loadInvoice.mockResolvedValue(invoice)
  loadPayment.mockResolvedValue(payment)
  loadCustomer.mockResolvedValue(customer)
  workshopCurrency.mockResolvedValue('GBP')
  recordPulledPayment.mockResolvedValue({ id: 'pulled1', created: true })
  removePulledPayment.mockResolvedValue(true)
})

describe('QuickBooks: pushing an invoice', () => {
  it('creates the customer, then the invoice, at the company URL with the minor version', async () => {
    const t = makeCtx({ answer: emptyCompany() })
    const out = await connector.jobs['accounting.invoice'](t.ctx, { entityId: 'svc1' })
    expect(out?.summary).toBe('invoice INV-1001 created')

    const [lookup, createCustomer, createInvoice] = t.calls
    expect(lookup.host).toBe('quickbooks.api.intuit.com')
    expect(lookup.path).toBe('/v3/company/9130357/query')
    expect(lookup.query.minorversion).toBe('75')
    expect(lookup.query.query).toBe(
      "select Id, DisplayName from Customer where DisplayName = 'Anna Berg'"
    )
    expect(lookup.headers.accept).toBe('application/json')

    expect(createCustomer.path).toBe('/v3/company/9130357/customer')
    expect(createCustomer.body).toEqual({
      DisplayName: 'Anna Berg',
      PrimaryEmailAddr: { Address: 'anna@example.com' },
      PrimaryPhone: { FreeFormNumber: '+44 20 7946 0958' },
      BillAddr: { Line1: '1 High Street', Line2: 'London' },
      Notes: 'Torqvoice customer C-0042',
      Taxable: true,
    })

    expect(createInvoice.path).toBe('/v3/company/9130357/invoice')
    expect(createInvoice.query).toEqual({ minorversion: '75' })
    expect(createInvoice.body).toEqual({
      CustomerRef: { value: '58' },
      TxnDate: '2026-09-04',
      DueDate: '2026-09-18',
      DocNumber: 'INV-1001',
      Line: [
        {
          DetailType: 'DescriptionOnly',
          Description: 'Vehicle: 2018 Toyota Corolla, AB12 CDE, 84200 km',
          DescriptionLineDetail: { ServiceDate: '2026-09-03' },
        },
        {
          DetailType: 'SalesItemLineDetail',
          Amount: 200,
          Description: 'Brake service',
          SalesItemLineDetail: {
            ItemRef: { value: '7' },
            Qty: 2,
            UnitPrice: 100,
            ServiceDate: '2026-09-03',
            TaxCodeRef: { value: '3' },
          },
        },
        {
          DetailType: 'SalesItemLineDetail',
          Amount: 100,
          Description: 'BP-100 Brake pads',
          SalesItemLineDetail: {
            ItemRef: { value: '8' },
            Qty: 1,
            UnitPrice: 100,
            ServiceDate: '2026-09-03',
            TaxCodeRef: { value: '3' },
          },
        },
      ],
      PrivateNote: 'Torqvoice https://shop.example.com/vehicles/veh1/service/svc1',
      BillEmail: { Address: 'anna@example.com' },
      GlobalTaxCalculation: 'TaxExcluded',
    })
    expect(t.calls).toHaveLength(3)

    const link = t.links.get('ServiceRecord:svc1')
    expect(link?.remoteId).toBe('100')
    expect(link?.remoteUrl).toBe('https://app.qbo.intuit.com/app/invoice?txnId=100')
    expect(t.links.get('Customer:cus1')?.remoteId).toBe('58')
    expect(t.logs.filter((l) => l.level === 'warn')).toHaveLength(0)
  })

  it('does nothing for an invoice that is not issued, and nothing twice for an unchanged one', async () => {
    loadInvoice.mockResolvedValue({ ...invoice, issuedAt: null })
    const t = makeCtx({ answer: emptyCompany() })
    expect((await connector.jobs['accounting.invoice'](t.ctx, { entityId: 'svc1' }))?.summary).toBe(
      'not issued yet'
    )
    expect(t.calls).toHaveLength(0)

    loadInvoice.mockResolvedValue(invoice)
    await connector.jobs['accounting.invoice'](t.ctx, { entityId: 'svc1' })
    const before = t.calls.length
    const again = await connector.jobs['accounting.invoice'](t.ctx, { entityId: 'svc1' })
    expect(again?.summary).toBe('invoice INV-1001 unchanged')
    expect(t.calls).toHaveLength(before)
  })

  it('sends a completed job before it is issued only when asked to', async () => {
    loadInvoice.mockResolvedValue({ ...invoice, issuedAt: null })
    const t = makeCtx({ settings: { pushOnComplete: true }, answer: emptyCompany() })
    expect((await connector.jobs['accounting.invoice'](t.ctx, { entityId: 'svc1' }))?.summary).toBe(
      'invoice INV-1001 created'
    )
  })

  it('skips invoices dated before the start date', async () => {
    const t = makeCtx({ settings: { startDate: '2026-10-01' }, answer: emptyCompany() })
    expect((await connector.jobs['accounting.invoice'](t.ctx, { entityId: 'svc1' }))?.summary).toBe(
      'not issued yet'
    )
    expect(t.calls).toHaveLength(0)
  })

  it('updates a linked invoice with the current SyncToken as a sparse update', async () => {
    const t = makeCtx({
      answer: (call) => {
        if (call.method === 'GET' && call.path.endsWith('/invoice/100'))
          return { Invoice: { Id: '100', SyncToken: '4', TotalAmt: 360, Balance: 360 } }
        return emptyCompany()(call)
      },
    })
    await t.ctx.links.set('Customer', 'cus1', { remoteId: '58', checksum: 'stale' })
    await t.ctx.links.set('ServiceRecord', 'svc1', { remoteId: '100', checksum: 'stale' })
    // The customer changed too: it is read for its SyncToken and updated first.
    const answer = t.ctx.http.json
    t.ctx.http.json = async (url, init) => {
      if (url.includes('/customer/58') && (init?.method ?? 'GET') === 'GET') {
        t.calls.push({
          method: 'GET',
          host: '',
          path: '/v3/company/9130357/customer/58',
          query: {},
          body: null,
          headers: {},
        })
        return { Customer: { Id: '58', SyncToken: '2', DisplayName: 'Anna Berg' } } as never
      }
      return answer(url, init)
    }
    const out = await connector.jobs['accounting.invoice'](t.ctx, { entityId: 'svc1' })
    expect(out?.summary).toBe('invoice INV-1001 updated')
    const customerUpdate = t.calls.find((c) => c.method === 'POST' && c.path.endsWith('/customer'))
    expect(customerUpdate?.body).toMatchObject({ Id: '58', SyncToken: '2', sparse: true })
    const invoiceUpdate = t.calls.find((c) => c.method === 'POST' && c.path.endsWith('/invoice'))
    expect(invoiceUpdate?.body).toMatchObject({ Id: '100', SyncToken: '4', sparse: true })
    expect((invoiceUpdate?.body?.Line as unknown[]).length).toBe(3)
  })

  it('recreates an invoice QuickBooks no longer has', async () => {
    const t = makeCtx({
      answer: (call) => {
        if (call.method === 'GET' && call.path.endsWith('/invoice/100'))
          throw fault(400, '610', 'Object Not Found')
        return emptyCompany()(call)
      },
    })
    await t.ctx.links.set('ServiceRecord', 'svc1', { remoteId: '100', checksum: 'stale' })
    const out = await connector.jobs['accounting.invoice'](t.ctx, { entityId: 'svc1' })
    expect(out?.summary).toBe('invoice INV-1001 created')
    expect(t.links.get('ServiceRecord:svc1')?.remoteId).toBe('100')
  })

  it('adopts an invoice it pushed before when QuickBooks reports a duplicate number', async () => {
    let attempt = 0
    const t = makeCtx({
      answer: (call) => {
        if (call.path.endsWith('/query') && call.query.query.includes('from Invoice'))
          return {
            QueryResponse: {
              Invoice: [
                { Id: '77', SyncToken: '1', DocNumber: 'INV-1001', PrivateNote: 'Torqvoice x' },
              ],
            },
          }
        if (call.method === 'POST' && call.path.endsWith('/invoice')) {
          attempt++
          if (attempt === 1) throw fault(400, '6140', 'Duplicate Document Number Error')
          return { Invoice: { Id: '77', SyncToken: '2', DocNumber: 'INV-1001', TotalAmt: 360 } }
        }
        return emptyCompany()(call)
      },
    })
    await connector.jobs['accounting.invoice'](t.ctx, { entityId: 'svc1' })
    const second = t.calls.filter((c) => c.method === 'POST' && c.path.endsWith('/invoice'))[1]
    expect(second.body).toMatchObject({ Id: '77', SyncToken: '1', sparse: true })
    expect(t.links.get('ServiceRecord:svc1')?.remoteId).toBe('77')
  })

  it('adds a duplicate number beside a foreign invoice and says so', async () => {
    let attempt = 0
    const t = makeCtx({
      answer: (call) => {
        if (call.path.endsWith('/query') && call.query.query.includes('from Invoice'))
          return {
            QueryResponse: {
              Invoice: [{ Id: '77', SyncToken: '1', DocNumber: 'INV-1001', PrivateNote: 'theirs' }],
            },
          }
        if (call.method === 'POST' && call.path.endsWith('/invoice')) {
          attempt++
          if (attempt === 1) throw fault(400, '6140', 'Duplicate Document Number Error')
          return { Invoice: { Id: '78', SyncToken: '0', DocNumber: 'INV-1001', TotalAmt: 360 } }
        }
        return emptyCompany()(call)
      },
    })
    await connector.jobs['accounting.invoice'](t.ctx, { entityId: 'svc1' })
    const second = t.calls.filter((c) => c.method === 'POST' && c.path.endsWith('/invoice'))[1]
    expect(second.query.include).toBe('allowduplicatedocnum')
    expect(t.logs.some((l) => l.level === 'warn' && l.message.includes('did not come from'))).toBe(
      true
    )
  })

  it('leaves out the document number when the company numbers invoices itself', async () => {
    const t = makeCtx({ state: { customTxnNumbers: false }, answer: emptyCompany() })
    await connector.jobs['accounting.invoice'](t.ctx, { entityId: 'svc1' })
    const create = t.calls.find((c) => c.method === 'POST' && c.path.endsWith('/invoice'))
    expect(create?.body?.DocNumber).toBeUndefined()
  })

  it('always names the currency in a multi-currency company, on the customer too', async () => {
    workshopCurrency.mockResolvedValue('NOK')
    const t = makeCtx({ state: { multiCurrency: true }, answer: emptyCompany() })
    await connector.jobs['accounting.invoice'](t.ctx, { entityId: 'svc1' })
    const cust = t.calls.find((c) => c.method === 'POST' && c.path.endsWith('/customer'))
    const inv = t.calls.find((c) => c.method === 'POST' && c.path.endsWith('/invoice'))
    expect(cust?.body?.CurrencyRef).toEqual({ value: 'NOK' })
    expect(inv?.body?.CurrencyRef).toEqual({ value: 'NOK' })
  })

  it('warns when the workshop currency differs and multi-currency is off', async () => {
    workshopCurrency.mockResolvedValue('NOK')
    const t = makeCtx({ answer: emptyCompany() })
    await connector.jobs['accounting.invoice'](t.ctx, { entityId: 'svc1' })
    const inv = t.calls.find((c) => c.method === 'POST' && c.path.endsWith('/invoice'))
    expect(inv?.body?.CurrencyRef).toBeUndefined()
    expect(t.logs.some((l) => l.level === 'warn' && l.message.includes('multi-currency'))).toBe(
      true
    )
  })

  it('uses no GlobalTaxCalculation for a US company', async () => {
    const t = makeCtx({ state: { country: 'US' }, answer: emptyCompany() })
    await connector.jobs['accounting.invoice'](t.ctx, { entityId: 'svc1' })
    const inv = t.calls.find((c) => c.method === 'POST' && c.path.endsWith('/invoice'))
    expect(inv?.body?.GlobalTaxCalculation).toBeUndefined()
  })

  it('warns when QuickBooks arrives at another total', async () => {
    const t = makeCtx({
      answer: (call) => {
        const res = emptyCompany()(call) as { Invoice?: { TotalAmt: number } }
        if (res.Invoice) res.Invoice.TotalAmt = 300
        return res
      },
    })
    await connector.jobs['accounting.invoice'](t.ctx, { entityId: 'svc1' })
    expect(t.logs.some((l) => l.level === 'warn' && l.message.includes('differs'))).toBe(true)
  })

  it('books a counter sale to the walk-in customer', async () => {
    loadInvoice.mockResolvedValue({ ...invoice, customer: null, vehicle: null, vehicleId: null })
    const t = makeCtx({ answer: emptyCompany() })
    await connector.jobs['accounting.invoice'](t.ctx, { entityId: 'svc1' })
    const lookup = t.calls[0]
    expect(lookup.query.query).toContain("DisplayName = 'Walk-in customer'")
    expect(t.calls[1].body).toEqual({ DisplayName: 'Walk-in customer' })
    expect(t.state.walkInCustomerId).toBe('58')
    const inv = t.calls.find((c) => c.method === 'POST' && c.path.endsWith('/invoice'))
    expect((inv?.body?.Line as unknown[]).length).toBe(2)
    expect(inv?.body?.PrivateNote).toBe('Torqvoice https://shop.example.com/sales/svc1')
  })

  it('creates a Labour item under the income account when none is chosen', async () => {
    const t = makeCtx({
      settings: { laborItemId: '', partsItemId: '' },
      answer: (call) => {
        if (call.path.endsWith('/query') && call.query.query.includes('from Account'))
          return {
            QueryResponse: {
              Account: [
                { Id: '1', Name: 'Sales', AccountSubType: 'SalesOfProductIncome' },
                { Id: '2', Name: 'Services', AccountSubType: 'ServiceFeeIncome' },
              ],
            },
          }
        if (call.method === 'POST' && call.path.endsWith('/item'))
          return { Item: { Id: call.body?.Name === 'Labour' ? '70' : '80', Name: call.body?.Name } }
        return emptyCompany()(call)
      },
    })
    await connector.jobs['accounting.invoice'](t.ctx, { entityId: 'svc1' })
    const items = t.calls.filter((c) => c.method === 'POST' && c.path.endsWith('/item'))
    expect(items.map((c) => c.body)).toEqual([
      { Name: 'Labour', Type: 'Service', IncomeAccountRef: { value: '2' } },
      { Name: 'Parts', Type: 'Service', IncomeAccountRef: { value: '1' } },
    ])
    expect(t.state.defaultItems).toEqual({ labor: '70', part: '80' })
    const inv = t.calls.find((c) => c.method === 'POST' && c.path.endsWith('/invoice'))
    const lines = inv?.body?.Line as { SalesItemLineDetail?: { ItemRef: { value: string } } }[]
    expect(lines[1].SalesItemLineDetail?.ItemRef.value).toBe('70')
    expect(lines[2].SalesItemLineDetail?.ItemRef.value).toBe('80')
  })

  it('voids the ledger copy of a deleted record unless money was taken on it', async () => {
    loadInvoice.mockResolvedValue(null)
    const t = makeCtx({
      answer: (call) => {
        if (call.method === 'GET' && call.path.endsWith('/invoice/100'))
          return {
            Invoice: {
              Id: '100',
              SyncToken: '3',
              DocNumber: 'INV-1001',
              TotalAmt: 360,
              Balance: 360,
            },
          }
        if (call.query.operation === 'void') return { Invoice: { Id: '100', SyncToken: '4' } }
        throw new Error(`unexpected ${call.method} ${call.path}`)
      },
    })
    await t.ctx.links.set('ServiceRecord', 'svc1', { remoteId: '100' })
    const out = await connector.jobs['accounting.invoice'](t.ctx, { entityId: 'svc1' })
    expect(out?.summary).toBe('invoice INV-1001 voided')
    const voided = t.calls.find((c) => c.query.operation === 'void')
    expect(voided?.path).toBe('/v3/company/9130357/invoice')
    expect(voided?.body).toEqual({ Id: '100', SyncToken: '3' })
    expect(t.links.has('ServiceRecord:svc1')).toBe(false)

    const paid = makeCtx({
      answer: () => ({
        Invoice: { Id: '100', SyncToken: '3', DocNumber: 'INV-1001', TotalAmt: 360, Balance: 100 },
      }),
    })
    await paid.ctx.links.set('ServiceRecord', 'svc1', { remoteId: '100' })
    const kept = await connector.jobs['accounting.invoice'](paid.ctx, { entityId: 'svc1' })
    expect(kept?.summary).toContain('has payments')
    expect(paid.calls.some((c) => c.query.operation === 'void')).toBe(false)
  })
})

describe('QuickBooks: payments', () => {
  it('records the payments on an invoice right after pushing it', async () => {
    loadInvoice.mockResolvedValue({ ...invoice, payments: [payment] })
    const t = makeCtx({ settings: { depositAccountId: '35' }, answer: emptyCompany() })
    const out = await connector.jobs['accounting.invoice'](t.ctx, { entityId: 'svc1' })
    expect(out?.summary).toBe('invoice INV-1001 created, 1 payments recorded')
    const pay = t.calls.find((c) => c.method === 'POST' && c.path.endsWith('/payment'))
    expect(pay?.body).toEqual({
      CustomerRef: { value: '58' },
      TotalAmt: 360,
      TxnDate: '2026-09-05',
      PaymentRefNum: 'pi_123',
      PrivateNote: 'Torqvoice payment, card. via stripe',
      DepositToAccountRef: { value: '35' },
      Line: [{ Amount: 360, LinkedTxn: [{ TxnId: '100', TxnType: 'Invoice' }] }],
    })
    expect(t.links.get('Payment:pay1')?.metadata).toMatchObject({ createdByUs: true })
  })

  it('pushes the invoice first when a payment arrives on its own', async () => {
    loadInvoice.mockResolvedValue({ ...invoice, payments: [payment] })
    const t = makeCtx({ answer: emptyCompany() })
    const out = await connector.jobs['accounting.payment'](t.ctx, { entityId: 'pay1' })
    expect(out?.summary).toBe('payment recorded')
    expect(t.calls.map((c) => `${c.method} ${c.path.split('/').pop()}`)).toEqual([
      'GET query',
      'POST customer',
      'POST invoice',
      'POST payment',
    ])
  })

  it('deletes a payment it made when the payment is deleted here', async () => {
    loadPayment.mockResolvedValue(null)
    const t = makeCtx({
      answer: (call) => {
        if (call.method === 'GET' && call.path.endsWith('/payment/200'))
          return { Payment: { Id: '200', SyncToken: '1' } }
        if (call.query.operation === 'delete') return { Payment: { Id: '200', status: 'Deleted' } }
        throw new Error(`unexpected ${call.method} ${call.path}`)
      },
    })
    await t.ctx.links.set('Payment', 'pay1', { remoteId: '200', metadata: { createdByUs: true } })
    const out = await connector.jobs['accounting.payment'](t.ctx, { entityId: 'pay1' })
    expect(out?.summary).toBe('payment deleted')
    const del = t.calls.find((c) => c.query.operation === 'delete')
    expect(del?.path).toBe('/v3/company/9130357/payment')
    expect(del?.body).toEqual({ Id: '200', SyncToken: '1' })
    expect(t.links.has('Payment:pay1')).toBe(false)
  })

  it('leaves a payment that came from QuickBooks alone when deleted here', async () => {
    loadPayment.mockResolvedValue(null)
    const t = makeCtx({ answer: emptyCompany() })
    await t.ctx.links.set('Payment', 'pay1', { remoteId: '200', metadata: { createdByUs: false } })
    const out = await connector.jobs['accounting.payment'](t.ctx, { entityId: 'pay1' })
    expect(out?.summary).toContain('left there')
    expect(t.calls).toHaveLength(0)
  })

  it('settles an invoice marked paid by hand, once, when asked to', async () => {
    loadInvoice.mockResolvedValue({ ...invoice, manuallyPaid: true })
    const t = makeCtx({ settings: { manualPaidAsPayment: true }, answer: emptyCompany() })
    const out = await connector.jobs['accounting.invoice'](t.ctx, { entityId: 'svc1' })
    expect(out?.summary).toBe('invoice INV-1001 created, 1 payments recorded')
    const pay = t.calls.find((c) => c.method === 'POST' && c.path.endsWith('/payment'))
    expect(pay?.body).toMatchObject({
      TotalAmt: 360,
      TxnDate: '2026-09-04',
      Line: [{ Amount: 360, LinkedTxn: [{ TxnId: '100', TxnType: 'Invoice' }] }],
    })
    expect(pay?.body?.PaymentRefNum).toBeUndefined()
    expect(t.links.get('Payment:manual:svc1')?.metadata).toMatchObject({ manual: true })

    const again = await connector.jobs['accounting.invoice'](t.ctx, { entityId: 'svc1' })
    expect(again?.summary).toBe('invoice INV-1001 unchanged')

    const off = makeCtx({ answer: emptyCompany() })
    await connector.jobs['accounting.invoice'](off.ctx, { entityId: 'svc1' })
    expect(off.calls.some((c) => c.path.endsWith('/payment'))).toBe(false)
  })
})

describe('QuickBooks: pulling changes', () => {
  it('records a payment taken in QuickBooks against an invoice from here', async () => {
    const t = makeCtx({
      state: { lastPullAt: '2026-09-04T09:00:00.000Z' },
      answer: (call) => {
        expect(call.path).toBe('/v3/company/9130357/cdc')
        expect(call.query.entities).toBe('Payment,Invoice')
        expect(call.query.changedSince).toBe('2026-09-04T08:59:00Z')
        return {
          CDCResponse: [
            {
              QueryResponse: [
                {
                  Payment: [
                    {
                      Id: '300',
                      SyncToken: '0',
                      TxnDate: '2026-09-06',
                      TotalAmt: 360,
                      PaymentRefNum: 'CHQ 42',
                      PaymentMethodRef: { value: '2', name: 'Bank Transfer' },
                      Line: [{ Amount: 360, LinkedTxn: [{ TxnId: '100', TxnType: 'Invoice' }] }],
                    },
                    {
                      Id: '301',
                      SyncToken: '0',
                      TxnDate: '2026-09-06',
                      Line: [{ Amount: 50, LinkedTxn: [{ TxnId: '999', TxnType: 'Invoice' }] }],
                    },
                  ],
                },
                { Invoice: [{ Id: '100', SyncToken: '1' }] },
              ],
            },
          ],
        }
      },
    })
    await t.ctx.links.set('ServiceRecord', 'svc1', { remoteId: '100' })
    const out = await connector.jobs['accounting.pull'](t.ctx, {})
    expect(out?.summary).toBe('1 payments recorded')
    expect(recordPulledPayment).toHaveBeenCalledTimes(1)
    expect(recordPulledPayment).toHaveBeenCalledWith('org1', {
      serviceRecordId: 'svc1',
      amount: 360,
      date: new Date('2026-09-06T12:00:00Z'),
      method: 'transfer',
      provider: 'quickbooks',
      externalId: '300',
      note: 'Ref CHQ 42. Recorded in QuickBooks',
    })
    expect(t.links.get('Payment:pulled1')).toMatchObject({
      remoteId: '300',
      metadata: { createdByUs: false, serviceRecordId: 'svc1' },
    })
    expect(typeof t.state.lastPullAt).toBe('string')
  })

  it('does not record a payment it pushed itself, and removes one QuickBooks deleted', async () => {
    const t = makeCtx({
      answer: () => ({
        CDCResponse: [
          {
            QueryResponse: [
              {
                Payment: [
                  {
                    Id: '200',
                    SyncToken: '1',
                    Line: [{ Amount: 360, LinkedTxn: [{ TxnId: '100', TxnType: 'Invoice' }] }],
                  },
                  { Id: '300', status: 'Deleted', SyncToken: '1' },
                ],
              },
            ],
          },
        ],
      }),
    })
    await t.ctx.links.set('ServiceRecord', 'svc1', { remoteId: '100' })
    await t.ctx.links.set('Payment', 'pay1', { remoteId: '200', metadata: { createdByUs: true } })
    await t.ctx.links.set('Payment', 'pulled1', {
      remoteId: '300',
      metadata: { createdByUs: false },
    })
    const out = await connector.jobs['accounting.pull'](t.ctx, {})
    expect(out?.summary).toBe('1 payments removed')
    expect(recordPulledPayment).not.toHaveBeenCalled()
    expect(removePulledPayment).toHaveBeenCalledWith('org1', 'pulled1', 'quickbooks')
    expect(t.links.has('Payment:pulled1')).toBe(false)
  })

  it('unlinks an invoice deleted in QuickBooks so an edit here recreates it', async () => {
    const t = makeCtx({
      answer: () => ({
        CDCResponse: [{ QueryResponse: [{ Invoice: [{ Id: '100', status: 'Deleted' }] }] }],
      }),
    })
    await t.ctx.links.set('ServiceRecord', 'svc1', { remoteId: '100' })
    const out = await connector.jobs['accounting.pull'](t.ctx, {})
    expect(out?.summary).toBe('1 invoices unlinked')
    expect(t.links.has('ServiceRecord:svc1')).toBe(false)
  })

  it('never reaches back more than the 30 days QuickBooks keeps', async () => {
    const t = makeCtx({
      state: { lastPullAt: '2020-01-01T00:00:00.000Z' },
      answer: (call) => {
        const since = Date.parse(call.query.changedSince)
        expect(Date.now() - since).toBeLessThanOrEqual(30 * 86_400_000 + 5_000)
        return { CDCResponse: [] }
      },
    })
    expect((await connector.jobs['accounting.pull'](t.ctx, {}))?.summary).toBe('no changes')
  })
})

describe('QuickBooks: connecting', () => {
  it('falls back to the sandbox host when the live one rejects the keys, and reads the company', async () => {
    const t = makeCtx({
      state: { environment: undefined, country: undefined, customTxnNumbers: undefined },
      answer: (call) => {
        if (call.host === 'quickbooks.api.intuit.com')
          throw fault(401, '3200', 'message=AuthenticationFailed')
        if (call.path.endsWith('/companyinfo/9130357'))
          return { CompanyInfo: { CompanyName: 'Sandbox Garage Ltd', Country: 'GB' } }
        if (call.path.endsWith('/preferences'))
          return {
            Preferences: {
              CurrencyPrefs: { HomeCurrency: { value: 'GBP' }, MultiCurrencyEnabled: true },
              SalesFormsPrefs: { CustomTxnNumbers: false },
            },
          }
        throw new Error(`unexpected ${call.path}`)
      },
    })
    const who = await connector.identify?.(t.ctx)
    expect(who).toEqual({ id: '9130357', name: 'Sandbox Garage Ltd (sandbox)' })
    expect(t.state).toMatchObject({
      environment: 'sandbox',
      country: 'GB',
      homeCurrency: 'GBP',
      multiCurrency: true,
      customTxnNumbers: false,
    })
    expect(t.logs.some((l) => l.message.includes('Custom transaction numbers'))).toBe(true)
    expect(t.calls.at(-1)?.host).toBe('sandbox-quickbooks.api.intuit.com')
  })

  it('reports a failed test with the vendor wording', async () => {
    const t = makeCtx({ answer: () => fault(401, '3200', 'AuthenticationFailed') })
    t.ctx.http.json = async () => {
      throw fault(401, '3200', 'message=AuthenticationFailed')
    }
    const res = await connector.test(t.ctx)
    expect(res.ok).toBe(false)
    expect(res.message).toContain('AuthenticationFailed')
  })

  it('lists items, tax codes and deposit accounts for the settings page', async () => {
    const t = makeCtx({
      answer: (call) => {
        const q = call.query.query
        if (q.includes('from Item'))
          return { QueryResponse: { Item: [{ Id: '2', Name: 'Labour', Type: 'Service' }] } }
        if (q.includes('from TaxCode'))
          return { QueryResponse: { TaxCode: [{ Id: '3', Name: '20.0% S' }] } }
        if (q.includes('from Account'))
          return {
            QueryResponse: {
              Account: [
                { Id: '35', Name: 'Undeposited Funds', AccountType: 'Other Current Asset' },
              ],
            },
          }
        return { QueryResponse: {} }
      },
    })
    expect(await connector.remoteOptions?.items(t.ctx)).toEqual([
      { value: '2', label: 'Labour (Service)' },
    ])
    expect(await connector.remoteOptions?.taxCodes(t.ctx)).toEqual([
      { value: '3', label: '20.0% S' },
    ])
    expect(await connector.remoteOptions?.depositAccounts(t.ctx)).toEqual([
      { value: '35', label: 'Undeposited Funds (Other Current Asset)' },
    ])
    expect(t.calls[0].query.query).toContain("Type in ('Service', 'NonInventory', 'Inventory')")
  })
})
