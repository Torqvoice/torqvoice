// @vitest-environment node
/**
 * What happened to the customer's car, as the thread draws it between the
 * messages: read from the job, the update, the quote and the invoice
 * themselves, in the order it happened. A read that fails leaves the events
 * out and never takes the thread with it.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { serviceRecord, statusReport, quote } = vi.hoisted(() => ({
  serviceRecord: { findMany: vi.fn() },
  statusReport: { findMany: vi.fn() },
  quote: { findMany: vi.fn() },
}))
vi.mock('@/lib/db', () => ({ db: { serviceRecord, statusReport, quote } }))
vi.mock('@/lib/workshop-currency', () => ({
  workshopMoneyFormatter: async () => (amount: number) => `kr ${amount.toFixed(2)}`,
}))
// Half a day ahead of the server, so "still valid today" is the workshop's today.
vi.mock('@/lib/workshop-timezone', () => ({ workshopTimeZone: async () => 'Pacific/Auckland' }))
vi.mock('@/features/portal/Lib/portalLive', () => ({ isPortalLive: async () => true }))
vi.mock('@/features/portal/Lib/portalLook.server', () => ({
  loadPortalLook: async () => ({ messagesEnabled: true }),
}))

import { getPortalThreadEvents } from '@/features/portal/Lib/chat.server'

const car = { make: 'Volvo', model: 'V60' }
// 09:00 on 21 November in Auckland, still the evening of the 20th in UTC.
const now = new Date('2026-11-20T20:00:00Z')
const events = () => getPortalThreadEvents('org1', 'kari', 'fjordside', { now })

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
  serviceRecord.findMany.mockImplementation(async ({ where }: { where: { status?: string } }) =>
    where.status === 'completed'
      ? [
          {
            id: 'i1',
            title: 'Brake overhaul',
            invoiceNumber: 'INV-2041',
            totalAmount: 6480,
            issuedAt: new Date('2026-11-20T15:00:00Z'),
            sentAt: new Date('2026-11-20T15:00:00Z'),
            serviceDate: new Date('2026-11-19T07:00:00Z'),
            invoiceDueDate: null,
            manuallyPaid: false,
            payments: [],
            vehicle: car,
          },
        ]
      : [
          {
            id: 'j1',
            title: 'Brake overhaul',
            vehicle: car,
            timeEntries: [{ startedAt: new Date('2026-11-19T07:40:00Z') }],
          },
        ]
  )
  statusReport.findMany.mockResolvedValue([
    {
      id: 'u1',
      publicToken: 'tok',
      message: 'Pads were down to 2 mm.\nSee the photos.',
      title: null,
      sentAt: new Date('2026-11-19T10:00:00Z'),
      serviceRecord: { vehicle: car },
    },
  ])
  quote.findMany.mockResolvedValue([
    {
      id: 'q1',
      title: 'Front brake pads and discs',
      quoteNumber: 'Q-1001',
      status: 'sent',
      totalAmount: 6480,
      // The 21st: today in Auckland, tomorrow on the server.
      validUntil: new Date('2026-11-20T11:00:00Z'),
      sentAt: new Date('2026-11-19T08:30:00Z'),
      sharedAt: null,
      vehicle: car,
    },
  ])
})

describe('the events of a thread', () => {
  it('lists work starting, the quote, the update and the invoice in the order they happened', async () => {
    expect(await events()).toEqual([
      {
        id: 'work_started:j1',
        kind: 'work_started',
        at: '2026-11-19T07:40:00.000Z',
        dayOnly: false,
        vehicle: 'Volvo V60',
        title: 'Brake overhaul',
        amount: null,
        href: null,
        answerable: false,
        overdue: false,
      },
      {
        id: 'quote:q1',
        kind: 'quote',
        at: '2026-11-19T08:30:00.000Z',
        dayOnly: false,
        vehicle: 'Volvo V60',
        title: 'Front brake pads and discs',
        amount: 'kr 6480.00',
        href: '/portal/fjordside/quotes/q1',
        answerable: true,
        overdue: false,
      },
      {
        id: 'update:u1',
        kind: 'update',
        at: '2026-11-19T10:00:00.000Z',
        dayOnly: false,
        vehicle: 'Volvo V60',
        title: 'Pads were down to 2 mm. See the photos.',
        amount: null,
        href: '/share/status-report/fjordside/tok',
        answerable: false,
        overdue: false,
      },
      {
        id: 'invoice:i1',
        kind: 'invoice',
        at: '2026-11-20T15:00:00.000Z',
        dayOnly: false,
        vehicle: 'Volvo V60',
        title: 'INV-2041',
        amount: 'kr 6480.00',
        href: '/portal/fjordside/invoices/i1',
        answerable: false,
        overdue: false,
      },
    ])
  })

  it("reads only this customer's records in this workshop", async () => {
    await events()
    const mine = {
      organizationId: 'org1',
      OR: [{ vehicle: { customerId: 'kari' } }, { customerId: 'kari' }],
    }
    for (const [call] of serviceRecord.findMany.mock.calls) {
      expect(call.where).toMatchObject(mine)
    }
    expect(statusReport.findMany.mock.calls[0][0].where).toMatchObject({
      organizationId: 'org1',
      serviceRecord: mine,
    })
    expect(quote.findMany.mock.calls[0][0].where).toMatchObject({
      organizationId: 'org1',
      customerId: 'kari',
    })
  })

  it('offers a quote to read, not to answer, once it was answered', async () => {
    quote.findMany.mockResolvedValue([
      {
        id: 'q1',
        title: 'Front brake pads and discs',
        quoteNumber: null,
        status: 'accepted',
        totalAmount: 6480,
        validUntil: null,
        sentAt: new Date('2026-11-19T08:30:00Z'),
        sharedAt: null,
        vehicle: null,
      },
    ])
    const quoted = (await events()).find((event) => event.kind === 'quote')
    expect(quoted).toMatchObject({ answerable: false, vehicle: null })
  })

  it('leaves out what happened before the thread begins', async () => {
    const since = new Date('2026-11-19T09:00:00Z')
    const kinds = (await getPortalThreadEvents('org1', 'kari', 'fjordside', { now, since })).map(
      (event) => event.kind
    )
    expect(kinds).toEqual(['update', 'invoice'])
  })

  const invoice = (over: Record<string, unknown>) => ({
    id: 'i1',
    title: 'Brake overhaul',
    invoiceNumber: 'INV-2041',
    totalAmount: 6480,
    issuedAt: new Date('2026-11-10T15:00:00Z'),
    sentAt: new Date('2026-11-10T15:00:00Z'),
    serviceDate: new Date('2026-11-09T07:00:00Z'),
    invoiceDueDate: null,
    manuallyPaid: false,
    payments: [],
    vehicle: car,
    ...over,
  })
  const invoiceEvent = async (over: Record<string, unknown>) => {
    serviceRecord.findMany.mockImplementation(async ({ where }: { where: { status?: string } }) =>
      where.status === 'completed' ? [invoice(over)] : []
    )
    return (await events()).find((event) => event.kind === 'invoice')
  }

  it('marks an unpaid invoice overdue from the day after its due day in the workshop', async () => {
    // Due the 20th. In Auckland it is already the 21st; on the server still the 20th.
    expect(await invoiceEvent({ invoiceDueDate: new Date('2026-11-19T11:00:00Z') })).toMatchObject({
      overdue: true,
    })
    // Due the 21st: today in the workshop, so not overdue yet.
    expect(await invoiceEvent({ invoiceDueDate: new Date('2026-11-20T11:00:00Z') })).toMatchObject({
      overdue: false,
    })
  })

  it('never calls a paid invoice overdue', async () => {
    const due = new Date('2026-11-01T11:00:00Z')
    expect(await invoiceEvent({ invoiceDueDate: due, manuallyPaid: true })).toMatchObject({
      overdue: false,
    })
    expect(await invoiceEvent({ invoiceDueDate: due, payments: [{ amount: 6480 }] })).toMatchObject(
      { overdue: false }
    )
  })

  it('stands where the customer would look for it: when it was sent, else on its own date', async () => {
    // Sent on the 18th: that moment, whatever day the sheet was frozen.
    expect(
      await invoiceEvent({
        sentAt: new Date('2026-11-18T13:05:00Z'),
        invoiceDate: new Date('2026-11-10T11:00:00Z'),
        issuedAt: new Date('2026-11-12T03:47:00Z'),
      })
    ).toMatchObject({ at: '2026-11-18T13:05:00.000Z', dayOnly: false })
    // Never sent: its own date, which is a day and not a time of day. When
    // the sheet was frozen (a payment at 4:47 in the morning) is not shown.
    expect(
      await invoiceEvent({
        sentAt: null,
        invoiceDate: new Date('2026-11-10T11:00:00Z'),
        issuedAt: new Date('2026-11-12T03:47:00Z'),
      })
    ).toMatchObject({ at: '2026-11-10T11:00:00.000Z', dayOnly: true })
    // No invoice date: the day its page in the portal shows, the scheduled
    // start and then the day of the work. Still a day, never the freeze time.
    expect(
      await invoiceEvent({
        sentAt: null,
        invoiceDate: null,
        startDateTime: new Date('2026-11-08T07:00:00Z'),
        issuedAt: new Date('2026-11-12T03:47:00Z'),
      })
    ).toMatchObject({ at: '2026-11-08T07:00:00.000Z', dayOnly: true })
    expect(
      await invoiceEvent({ sentAt: null, invoiceDate: null, startDateTime: null })
    ).toMatchObject({ at: '2026-11-09T07:00:00.000Z', dayOnly: true })
  })

  it('asks only for invoices whose own place in the thread is inside the window', async () => {
    await events()
    const where = serviceRecord.findMany.mock.calls
      .map(([args]) => args.where)
      .find((one) => one.status === 'completed')
    const since = new Date(now.getTime() - 30 * 86_400_000)
    // A fallback date counts only for a row with no date of higher rank, and
    // the freeze time is not asked about at all: twelve old invoices frozen
    // this week can no longer fill the page and hide a recent one.
    expect(where.AND[1]).toEqual({
      OR: [
        { sentAt: { gte: since } },
        { sentAt: null, invoiceDate: { gte: since } },
        { sentAt: null, invoiceDate: null, startDateTime: { gte: since } },
        { sentAt: null, invoiceDate: null, startDateTime: null, serviceDate: { gte: since } },
      ],
    })
    expect(JSON.stringify(where.AND[1])).not.toContain('issuedAt')
  })

  it('goes back a month unless asked for more, and never past half a year', async () => {
    expect(await invoiceEvent({ sentAt: new Date('2026-10-01T10:00:00Z') })).toBeUndefined()
    const asked = (since: string) =>
      getPortalThreadEvents('org1', 'kari', 'fjordside', { now, since: new Date(since) })
    const kinds = async (since: string) => (await asked(since)).map((event) => event.kind)
    expect(await kinds('2026-09-01T00:00:00Z')).toContain('invoice')
    serviceRecord.findMany.mockImplementation(async ({ where }: { where: { status?: string } }) =>
      where.status === 'completed' ? [invoice({ sentAt: new Date('2026-01-05T10:00:00Z') })] : []
    )
    expect(await kinds('2025-01-01T00:00:00Z')).not.toContain('invoice')
  })

  it('answers no events, and does not throw, when a read fails', async () => {
    statusReport.findMany.mockRejectedValue(new Error('db down'))
    expect(await events()).toEqual([])
  })
})
