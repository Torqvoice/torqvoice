/**
 * @vitest-environment node
 *
 * The billing list filtered by invoice date, grouped with subtotals, and
 * turned into a report. A report has to hold every invoice the filter keeps
 * (not just the rows scrolled into view), on the workshop's calendar, with
 * totals that match the rows, and only ever this workshop's invoices.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const queries = vi.hoisted(() => ({ calls: [] as { sql: string; values: unknown[] }[] }))
const answers = vi.hoisted(() => ({
  rows: [] as Record<string, unknown>[],
  groups: [] as Record<string, unknown>[],
}))

vi.mock('@/lib/db', () => ({
  db: {
    $queryRaw: vi.fn(async (query: { sql: string; values: unknown[] }) => {
      queries.calls.push({ sql: query.sql, values: query.values })
      if (query.sql.includes('AS group_key')) return answers.groups
      if (query.sql.includes('COUNT(*) AS cnt')) {
        return [{ cnt: BigInt(3), invoiced: 300.1, paid: 100.05 }]
      }
      if (query.sql.includes('total_revenue')) return [{}]
      return answers.rows
    }),
    organization: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => ({
        name: where.id === 'org-1' ? 'ZZ Test Garage' : 'Someone else',
      })),
    },
    appSetting: {
      findMany: vi.fn(async () => [
        { key: 'workshop.address', value: '12 Example Road\nLeeds' },
        { key: 'workshop.currencyCode', value: 'GBP' },
      ]),
    },
  },
}))
// Far from UTC, so a day boundary read on the wrong clock shows.
vi.mock('@/lib/workshop-timezone', () => ({
  workshopTimeZone: async () => 'Pacific/Auckland',
  workshopDateSettings: async () => ({
    timeZone: 'Pacific/Auckland',
    dateFormat: 'dd/MM/yyyy',
    timeFormat: '24h',
  }),
}))
vi.mock('@/lib/with-auth', () => ({
  withAuth: async (run: (ctx: { organizationId: string }) => Promise<unknown>) => {
    try {
      return { success: true, data: await run({ organizationId: 'org-1' }) }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  },
}))

import { getBillingRows } from '@/features/billing/Actions/getBillingRows'
import { billingDateWindow } from '@/features/billing/Lib/billingList.server'
import { loadBillingReport } from '@/features/billing/Lib/billingReport.server'
import { billingReportCsv, excelDateFormat } from '@/features/billing/Lib/billingReportFiles.server'
import {
  buildReportModel,
  labelSpan,
  type ReportFormatters,
  type Translate,
} from '@/features/billing/Lib/billingReportModel'
import { parseBillingColumns } from '@/features/billing/Schema/billingListSchema'

function row(id: string, over: Record<string, unknown> = {}) {
  return {
    id,
    title: `Job ${id}`,
    invoiceNumber: `2026-${id}`,
    serviceDate: new Date('2026-11-01T10:00:00Z'),
    startDateTime: null,
    invoiceDate: null,
    effective_total: 100,
    paid_amount: 0,
    manually_paid: false,
    vehicle_id: 'v1',
    vehicle_make: 'Ford',
    vehicle_model: 'Transit',
    vehicle_year: 2021,
    vehicle_license_plate: 'ZZ21 VAN',
    customer_id: 'c1',
    customer_name: 'Nordvik Transport',
    sent_at: null,
    view_count: 0,
    last_viewed_at: null,
    job_status: 'completed',
    group_month: '2026-11',
    ...over,
  }
}

beforeEach(() => {
  queries.calls = []
  answers.rows = []
  answers.groups = []
})

describe('the invoice date range', () => {
  it('covers whole days on the workshop calendar, not UTC days', () => {
    // November in Auckland is UTC+13: the 1st starts at 11:00 UTC on 31 October.
    const window = billingDateWindow({ from: '2026-11-01', to: '2026-11-30' }, 'Pacific/Auckland')
    expect(window.gte?.toISOString()).toBe('2026-10-31T11:00:00.000Z')
    expect(window.lt?.toISOString()).toBe('2026-11-30T11:00:00.000Z')
  })

  it('leaves an end open when it is missing or not a day', () => {
    expect(billingDateWindow({ from: 'yesterday', to: '' }, 'Pacific/Auckland')).toEqual({
      gte: undefined,
      lt: undefined,
    })
  })

  it('filters the list, its count and the summary cards by the range', async () => {
    await getBillingRows({ from: '2026-11-01', to: '2026-11-30' })
    const start = '2026-10-31T11:00:00.000Z'
    const end = '2026-11-30T11:00:00.000Z'
    const batch = queries.calls.find((q) => q.sql.includes('ORDER BY'))
    const count = queries.calls.find((q) => q.sql.includes('COUNT(*) AS cnt'))
    const summary = queries.calls.find((q) => q.sql.includes('total_revenue'))
    for (const query of [batch, count, summary]) {
      expect(query?.values).toEqual(expect.arrayContaining([start, end, 'org-1']))
    }
  })

  it('refuses a range that is not made of days', async () => {
    const result = await getBillingRows({ from: '1 Nov' })
    expect(result.success).toBe(false)
  })
})

describe('grouping the list', () => {
  it('keeps a group together and brings the subtotals of the groups in the batch', async () => {
    answers.rows = [row('1'), row('2', { customer_id: null, customer_name: null })]
    answers.groups = [
      { group_key: 'c1', cnt: BigInt(7), invoiced: 700, paid: 200 },
      { group_key: '', cnt: BigInt(1), invoiced: 50, paid: 0 },
    ]
    const result = await getBillingRows({ groupBy: 'customer' })
    const batch = queries.calls.find((q) => q.sql.includes('ORDER BY'))
    expect(batch?.sql).toMatch(/ORDER BY sub\.customer_name ASC NULLS LAST, sub\.customer_id ASC/)
    const groupQuery = queries.calls.find((q) => q.sql.includes('AS group_key'))
    // Only the groups this batch shows, and only this workshop's invoices.
    expect(groupQuery?.values).toEqual(expect.arrayContaining(['org-1', 'c1', '']))
    expect(result.data?.groups).toEqual({
      c1: { count: 7, invoiced: 700, paid: 200, outstanding: 500 },
      '': { count: 1, invoiced: 50, paid: 0, outstanding: 50 },
    })
  })

  it('asks for no subtotals when the list is not grouped', async () => {
    answers.rows = [row('1')]
    const result = await getBillingRows({ groupBy: 'colour' })
    expect(queries.calls.some((q) => q.sql.includes('AS group_key'))).toBe(false)
    expect(result.data?.groups).toBeUndefined()
  })
})

describe('loading a report', () => {
  it('reads every matching row (not a batch), the totals, and only this workshop', async () => {
    answers.rows = [row('1'), row('2', { paid_amount: 40 })]
    const report = await loadBillingReport(
      'org-1',
      { status: 'unpaid', from: '2026-11-01' },
      ['invoice', 'customer', 'age', 'balance'],
      undefined,
      new Date('2026-11-20T12:00:00Z')
    )
    for (const query of queries.calls) expect(query.values).toContain('org-1')
    const rowsQuery = queries.calls.find((q) => q.sql.includes('ORDER BY'))
    expect(rowsQuery?.values).toContain(5001)
    expect(report.rows).toHaveLength(2)
    expect(report.truncated).toBe(false)
    expect(report.totals).toEqual({ count: 3, invoiced: 300.1, paid: 100.05, outstanding: 200.05 })
    expect(report.rows[1].balance).toBe(60)
    expect(report.workshop.name).toBe('ZZ Test Garage')
    expect(report.currencyCode).toBe('GBP')
  })

  it('counts age in workshop days', async () => {
    // 1 Nov 10:00 UTC is 1 Nov 23:00 in Auckland; 20 Nov 12:00 UTC is 21 Nov 01:00 there.
    answers.rows = [row('1')]
    const report = await loadBillingReport(
      'org-1',
      {},
      ['age'],
      undefined,
      new Date('2026-11-20T12:00:00Z')
    )
    expect(report.rows[0].day).toBe('2026-11-01')
    expect(report.rows[0].ageDays).toBe(20)
  })

  it('says when more invoices matched than one report holds', async () => {
    answers.rows = Array.from({ length: 5001 }, (_, i) => row(String(i)))
    const report = await loadBillingReport('org-1', {}, ['invoice'])
    expect(report.rows).toHaveLength(5000)
    expect(report.truncated).toBe(true)
  })

  it('lists every group with its subtotal, in the order the rows come', async () => {
    answers.rows = [row('1', { customer_id: 'c2', customer_name: 'Alpha' }), row('2')]
    answers.groups = [
      { group_key: 'c1', group_name: 'Nordvik Transport', cnt: BigInt(1), invoiced: 100, paid: 0 },
      { group_key: 'c2', group_name: 'Alpha', cnt: BigInt(1), invoiced: 100, paid: 25 },
    ]
    const report = await loadBillingReport('org-1', { groupBy: 'customer' }, ['invoice'])
    expect(report.groups.map((g) => [g.key, g.name, g.totals.outstanding])).toEqual([
      ['c2', 'Alpha', 75],
      ['c1', 'Nordvik Transport', 100],
    ])
  })
})

/** English words, as the messages give them, enough for the model. */
const t: Translate = (key, values) => {
  const words: Record<string, string> = {
    defaultTitle: 'Billing report',
    'columns.invoice': 'Invoice #',
    'columns.customer': 'Customer',
    'columns.date': 'Date',
    'columns.age': 'Age (days)',
    'columns.total': 'Total',
    'columns.paid': 'Paid',
    'columns.balance': 'Balance',
    'columns.title': 'Title',
    'status.unpaid': 'Unpaid',
    'status.all': 'All',
    'chips.invoiceDate': 'Invoice date',
    'chips.status': 'Status',
    'chips.groupedBy': 'Grouped by',
    'chips.sortedBy': 'Sorted by',
    'chips.descending': 'descending',
    'groupBy.customer': 'Customer',
    noCustomer: 'No customer',
  }
  if (key === 'invoiceCount') return `${values?.count} invoices`
  if (key === 'totalLine') return `Total, ${values?.count} invoices`
  if (key === 'generated') return `Generated ${values?.date}`
  if (key === 'truncated') return `First ${values?.shown} of ${values?.count}`
  return words[key] ?? key
}
const f: ReportFormatters = {
  day: (key) => key.split('-').reverse().join('/'),
  dateTime: (iso) => iso,
  money: (amount) => `£${amount.toFixed(2)}`,
  month: (key) => key,
}

describe('the report layout', () => {
  async function grouped() {
    answers.rows = [row('1'), row('2', { customer_id: null, customer_name: null, paid_amount: 30 })]
    answers.groups = [
      { group_key: 'c1', group_name: 'Nordvik Transport', cnt: BigInt(1), invoiced: 100, paid: 0 },
      { group_key: '', group_name: null, cnt: BigInt(1), invoiced: 100, paid: 30 },
    ]
    return loadBillingReport(
      'org-1',
      { status: 'unpaid', from: '2026-11-01', to: '2026-11-30', groupBy: 'customer' },
      ['invoice', 'customer', 'date', 'total', 'paid', 'balance'],
      undefined,
      new Date('2026-11-20T12:00:00Z')
    )
  }

  it('heads the report with the filters it was made with', async () => {
    const model = buildReportModel(await grouped(), t, f)
    expect(model.title).toBe('Billing report')
    expect(model.chips).toEqual(
      expect.arrayContaining([
        { label: 'Invoice date', value: '01/11/2026 – 30/11/2026' },
        { label: 'Status', value: 'Unpaid' },
        { label: 'Grouped by', value: 'Customer' },
      ])
    )
    expect(model.workshopLines).toEqual(['12 Example Road, Leeds'])
  })

  it('prints only the chosen columns, a section per group with its subtotal, and the total', async () => {
    const model = buildReportModel(await grouped(), t, f)
    expect(model.headers.map((h) => h.label)).toEqual([
      'Invoice #',
      'Customer',
      'Date',
      'Total',
      'Paid',
      'Balance',
    ])
    expect(model.sections.map((s) => s.heading)).toEqual([
      'Nordvik Transport · 1 invoices',
      'No customer · 1 invoices',
    ])
    expect(model.sections[1].rows[0].map((c) => c.text)).toEqual([
      '2026-2',
      '',
      '01/11/2026',
      '£100.00',
      '£30.00',
      '£70.00',
    ])
    expect(model.sections[1].subtotal?.map((c) => c.text)).toEqual([
      '',
      '',
      '',
      '£100.00',
      '£30.00',
      '£70.00',
    ])
    expect(model.total.slice(3).map((c) => c.text)).toEqual(['£300.10', '£100.05', '£200.05'])
    expect(model.totalLabel).toBe('Total, 3 invoices')
    expect(labelSpan(model)).toBe(3)
  })

  it('writes CSV a spreadsheet reads safely: numbers plain, dates as days, formulas defused', async () => {
    answers.rows = [row('1', { title: '=HYPERLINK("http://x")', customer_name: 'Smith, Jones' })]
    const report = await loadBillingReport('org-1', {}, ['title', 'customer', 'date', 'balance'])
    const csv = billingReportCsv(buildReportModel(report, t, f))
    expect(csv.startsWith('﻿')).toBe(true)
    const lines = csv.slice(1).trim().split('\r\n')
    expect(lines[0]).toBe('Title,Customer,Date,Balance')
    expect(lines[1]).toBe(`"'=HYPERLINK(""http://x"")","Smith, Jones",2026-11-01,100.00`)
  })

  it('adds a group column to CSV when the report is grouped', async () => {
    const report = await grouped()
    const csv = billingReportCsv(buildReportModel(report, t, f), 'Customer')
    const lines = csv.slice(1).trim().split('\r\n')
    expect(lines[0].startsWith('Customer,Invoice #')).toBe(true)
    expect(lines[2].startsWith('No customer,2026-2')).toBe(true)
  })
})

describe('report settings', () => {
  it('turns the workshop date format into an Excel one, or ISO when it cannot', () => {
    expect(excelDateFormat('dd/MM/yyyy')).toBe('dd/mm/yyyy')
    expect(excelDateFormat('MMM d, yyyy')).toBe('mmm d, yyyy')
    expect(excelDateFormat("do 'of' MMMM")).toBe('yyyy-mm-dd')
  })

  it('reads remembered columns in list order and falls back to the default', () => {
    expect(parseBillingColumns('balance,invoice,nonsense')).toEqual(['invoice', 'balance'])
    expect(parseBillingColumns('')).toContain('title')
    expect(parseBillingColumns(undefined)).not.toContain('age')
  })
})
