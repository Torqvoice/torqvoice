import type {
  BillingReportData,
  BillingReportRow,
} from '@/features/billing/Lib/billingReport.server'
import type { BillingTotals } from '@/features/billing/Lib/billingList.server'
import type { BillingColumn } from '@/features/billing/Schema/billingListSchema'
import { deliveryState } from '@/features/billing/Lib/deliveryState'
import { vehicleName } from '@/lib/vehicle-name'

/**
 * The billing report as one neutral layout: headings, filter chips, summary,
 * the table in sections, totals. The print sheet, the PDF, the spreadsheet
 * and the CSV all draw this, so the four never disagree about what a report
 * holds. Words come through `t` (the `billing.report` messages) and every
 * date and amount through the formatters, which carry the workshop's clock,
 * date format and currency.
 */

export type Translate = (key: string, values?: Record<string, string | number>) => string

export interface ReportFormatters {
  /** A YYYY-MM-DD workshop day in the workshop's date format. */
  day: (key: string) => string
  /** An instant as date and time on the workshop's clock. */
  dateTime: (iso: string) => string
  money: (amount: number) => string
  /** A YYYY-MM month as words, "November 2026". */
  month: (key: string) => string
}

/** A YYYY-MM month in words, read as a calendar month with no clock involved. */
export function monthName(key: string, locale: string): string {
  const [y, m] = key.split('-').map(Number)
  if (!y || !m) return key
  return new Intl.DateTimeFormat(locale, {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(y, m - 1, 1)))
}

/** Whole calendar days from one YYYY-MM-DD key to another. */
export function daysBetween(fromKey: string, toKey: string): number {
  const at = (key: string) => {
    const [y, m, d] = key.split('-').map(Number)
    return Date.UTC(y, m - 1, d)
  }
  return Math.round((at(toKey) - at(fromKey)) / 86_400_000)
}

export const NUMERIC_COLUMNS: ReadonlySet<BillingColumn> = new Set([
  'age',
  'total',
  'paid',
  'balance',
])

export type RawCell = string | number | null

export interface ReportCell {
  text: string
  /** What a spreadsheet stores: amounts and days as numbers, dates as YYYY-MM-DD. */
  raw: RawCell
}

export interface ReportSection {
  /** The group's name alone, for a spreadsheet's group column. */
  label?: string
  /** The group's heading with its count; none when the report is not grouped. */
  heading?: string
  /** The group's figures under its heading, one per column (empty where none). */
  subtotal?: ReportCell[]
  rows: ReportCell[][]
}

export interface ReportModel {
  title: string
  workshopName: string
  /** Address, phone and email, the lines under the name. */
  workshopLines: string[]
  logo?: string
  generated: string
  chips: { label: string; value?: string }[]
  summary: { label: string; value: string; emphasis?: boolean }[]
  headers: { column: BillingColumn; label: string; numeric: boolean }[]
  sections: ReportSection[]
  total: ReportCell[]
  totalLabel: string
  notice?: string
  /** The short line every page ends with. */
  footer: string
  /** What the file is called, without an extension. */
  fileName: string
}

const COLUMN_KEYS: Record<BillingColumn, string> = {
  invoice: 'columns.invoice',
  title: 'columns.title',
  vehicle: 'columns.vehicle',
  plate: 'columns.plate',
  customer: 'columns.customer',
  date: 'columns.date',
  age: 'columns.age',
  status: 'columns.status',
  delivery: 'columns.delivery',
  total: 'columns.total',
  paid: 'columns.paid',
  balance: 'columns.balance',
}

const SORT_COLUMN: Record<string, BillingColumn> = {
  invoiceNumber: 'invoice',
  title: 'title',
  vehicle: 'vehicle',
  customer: 'customer',
  total: 'total',
  date: 'date',
  delivery: 'delivery',
}

export function columnLabel(t: Translate, column: BillingColumn) {
  return t(COLUMN_KEYS[column])
}

function cell(
  row: BillingReportRow,
  column: BillingColumn,
  t: Translate,
  f: ReportFormatters
): ReportCell {
  switch (column) {
    case 'invoice':
      return { text: row.invoiceNumber ?? '', raw: row.invoiceNumber ?? '' }
    case 'title':
      return { text: row.title, raw: row.title }
    case 'vehicle': {
      const name = row.vehicle ? vehicleName(row.vehicle) : ''
      return { text: name, raw: name }
    }
    case 'plate':
      return { text: row.vehicle?.licensePlate ?? '', raw: row.vehicle?.licensePlate ?? '' }
    case 'customer':
      return { text: row.customer?.name ?? '', raw: row.customer?.name ?? '' }
    case 'date':
      return { text: f.day(row.day), raw: row.day }
    case 'age':
      return { text: String(row.ageDays), raw: row.ageDays }
    case 'status': {
      const label = t(`status.${row.status}`)
      return { text: label, raw: label }
    }
    case 'delivery': {
      const state = deliveryState(row)
      const label =
        state === 'viewed' ? t('delivery.viewed') : state === 'sent' ? t('delivery.sent') : ''
      return { text: label, raw: label }
    }
    case 'total':
      return { text: f.money(row.totalAmount), raw: row.totalAmount }
    case 'paid':
      return { text: f.money(row.totalPaid), raw: row.totalPaid }
    case 'balance':
      return { text: f.money(row.balance), raw: row.balance }
  }
}

/** A totals line laid under the columns: money under total, paid and balance, nothing elsewhere. */
function totalsCells(
  columns: BillingColumn[],
  totals: BillingTotals,
  f: ReportFormatters
): ReportCell[] {
  return columns.map((column) => {
    if (column === 'total') return { text: f.money(totals.invoiced), raw: totals.invoiced }
    if (column === 'paid') return { text: f.money(totals.paid), raw: totals.paid }
    if (column === 'balance') return { text: f.money(totals.outstanding), raw: totals.outstanding }
    return { text: '', raw: null }
  })
}

export function buildReportModel(
  report: BillingReportData,
  t: Translate,
  f: ReportFormatters
): ReportModel {
  const { filters, columns, groupBy } = report
  const title = report.title || t('defaultTitle')

  const chips: ReportModel['chips'] = []
  if (filters.from || filters.to) {
    const from = filters.from ? f.day(filters.from) : ''
    const to = filters.to ? f.day(filters.to) : ''
    chips.push({ label: t('chips.invoiceDate'), value: `${from} – ${to}`.trim() })
  } else {
    chips.push({ label: t('chips.invoiceDate'), value: t('chips.allDates') })
  }
  const status = ['paid', 'partial', 'unpaid'].includes(filters.status ?? '')
    ? filters.status
    : 'all'
  chips.push({ label: t('chips.status'), value: t(`status.${status}`) })
  if (filters.delivery === 'unviewed') chips.push({ label: t('chips.notViewed') })
  if (filters.completedOnly) chips.push({ label: t('chips.completedOnly') })
  if (filters.search) chips.push({ label: t('chips.search'), value: filters.search })
  if (groupBy) chips.push({ label: t('chips.groupedBy'), value: t(`groupBy.${groupBy}`) })
  const sortColumn = SORT_COLUMN[filters.sortBy ?? ''] ?? 'date'
  const sortDir = filters.sortBy ? (filters.sortOrder ?? 'desc') : 'desc'
  chips.push({
    label: t('chips.sortedBy'),
    value: `${columnLabel(t, sortColumn)} (${t(sortDir === 'asc' ? 'chips.ascending' : 'chips.descending')})`,
  })

  const headers = columns.map((column) => ({
    column,
    label: columnLabel(t, column),
    numeric: NUMERIC_COLUMNS.has(column),
  }))
  const toCells = (row: BillingReportRow) => columns.map((column) => cell(row, column, t, f))

  const groupHeading = (key: string, name: string) => {
    if (groupBy === 'customer') return name || t('noCustomer')
    if (groupBy === 'month') return key ? f.month(key) : t('noDate')
    return t(`status.${key}`)
  }

  let sections: ReportSection[]
  if (groupBy) {
    const rowsByKey = new Map<string, BillingReportRow[]>()
    for (const row of report.rows) {
      const key =
        groupBy === 'customer'
          ? (row.customer?.id ?? '')
          : groupBy === 'month'
            ? (row.month ?? '')
            : row.status
      rowsByKey.set(key, [...(rowsByKey.get(key) ?? []), row])
    }
    sections = report.groups.map((group) => ({
      label: groupHeading(group.key, group.name),
      heading: `${groupHeading(group.key, group.name)} · ${t('invoiceCount', { count: group.totals.count })}`,
      subtotal: totalsCells(columns, group.totals, f),
      rows: (rowsByKey.get(group.key) ?? []).map(toCells),
    }))
  } else {
    sections = [{ rows: report.rows.map(toCells) }]
  }

  const workshopLines = [report.workshop.address, report.workshop.phone, report.workshop.email]
    .map((line) => line.replace(/\s*\n\s*/g, ', ').trim())
    .filter(Boolean)

  const range =
    filters.from || filters.to
      ? `${filters.from ? f.day(filters.from) : ''} – ${filters.to ? f.day(filters.to) : ''}`.trim()
      : ''
  const footer = [report.workshop.name, title, t(`status.${status}`), range]
    .filter(Boolean)
    .join(' · ')

  const stamp = report.generatedAt.slice(0, 10)
  const fileName = `${title}-${filters.from ?? ''}${filters.to ? `_${filters.to}` : ''}`
    .replace(/-$/, `-${stamp}`)
    .replace(/[^\p{L}\p{N}_-]+/gu, '-')
    .replace(/-+/g, '-')
    .toLowerCase()

  return {
    title,
    workshopName: report.workshop.name,
    workshopLines,
    logo: report.workshop.logo,
    generated: t('generated', { date: f.dateTime(report.generatedAt), zone: report.timeZone }),
    chips,
    summary: [
      { label: t('summary.invoices'), value: String(report.totals.count) },
      { label: t('summary.invoiced'), value: f.money(report.totals.invoiced) },
      { label: t('summary.paid'), value: f.money(report.totals.paid) },
      {
        label: t('summary.outstanding'),
        value: f.money(report.totals.outstanding),
        emphasis: true,
      },
    ],
    headers,
    sections,
    total: totalsCells(columns, report.totals, f),
    totalLabel: t('totalLine', { count: report.totals.count }),
    notice: report.truncated
      ? t('truncated', { shown: report.rows.length, count: report.totals.count })
      : undefined,
    footer,
    fileName,
  }
}

/**
 * How many leading cells a totals line merges for its label: those before
 * the first amount. Zero when an amount is the first column, and then the
 * label goes on a line of its own.
 */
export function labelSpan(model: Pick<ReportModel, 'headers'>): number {
  const first = model.headers.findIndex(
    (h) => h.column === 'total' || h.column === 'paid' || h.column === 'balance'
  )
  return first === -1 ? model.headers.length : first
}
