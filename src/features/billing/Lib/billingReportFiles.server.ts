import { renderToBuffer } from '@react-pdf/renderer'
import ExcelJS from 'exceljs'
import React from 'react'
import { BillingReportPDF } from '@/features/billing/Pdf/BillingReportPDF'
import type { BillingReportData } from '@/features/billing/Lib/billingReport.server'
import {
  labelSpan,
  NUMERIC_COLUMNS,
  type ReportCell,
  type ReportModel,
} from '@/features/billing/Lib/billingReportModel'
import { pdfFontsReady } from '@/features/vehicles/Components/invoice-pdf/fonts'

export interface ReportFile {
  fileName: string
  mimeType: string
  /** The file's bytes, base64, so a server action can hand it to the browser. */
  base64: string
}

const MONEY_COLUMNS = new Set(['total', 'paid', 'balance'])

/** A CSV field, quoted when it has to be. A leading = + - @ is defused so a spreadsheet never runs it. */
function csvField(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value
  return /[",\n\r;]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe
}

function csvValue(c: ReportCell, column: string): string {
  if (typeof c.raw === 'number') {
    return MONEY_COLUMNS.has(column) ? c.raw.toFixed(2) : String(c.raw)
  }
  return csvField(c.raw ?? '')
}

/**
 * The report as CSV: one line per invoice, amounts as plain numbers with a
 * point, dates as YYYY-MM-DD, so any spreadsheet or bookkeeping import reads
 * them the same. Grouped, a first column names the group. A byte-order mark
 * makes Excel read it as UTF-8.
 */
export function billingReportCsv(model: ReportModel, groupLabel?: string): string {
  const columns = model.headers.map((h) => h.column)
  const grouped = Boolean(groupLabel)
  const header = [...(grouped ? [groupLabel as string] : []), ...model.headers.map((h) => h.label)]
  const lines = [header.map(csvField).join(',')]
  for (const section of model.sections) {
    for (const row of section.rows) {
      const cells = row.map((c, i) => csvValue(c, columns[i]))
      lines.push([...(grouped ? [csvField(section.label ?? '')] : []), ...cells].join(','))
    }
  }
  return `﻿${lines.join('\r\n')}\r\n`
}

/** A date-fns pattern as an Excel one, or ISO when it uses something Excel has no word for. */
export function excelDateFormat(pattern: string): string {
  return /^[dMy\s./,-]+$/.test(pattern) ? pattern.replace(/M/g, 'm') : 'yyyy-mm-dd'
}

/**
 * The report as a workbook: the letterhead and filters on top, then the
 * table with real numbers and dates (so it sums and sorts), group headings
 * and subtotals when grouped, and the total. The header row is frozen and
 * filterable.
 */
export async function billingReportXlsx(
  model: ReportModel,
  report: BillingReportData,
  sheetName: string
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook()
  workbook.created = new Date(report.generatedAt)
  const sheet = workbook.addWorksheet(
    sheetName.slice(0, 31).replace(/[\\/?*[\]:]/g, ' ') || 'Report'
  )
  const width = model.headers.length
  const dateFormat = excelDateFormat(report.dateFormat)
  const moneyFormat = '#,##0.00'

  sheet.addRow([model.title]).font = { bold: true, size: 14 }
  sheet.addRow([model.workshopName]).font = { bold: true }
  for (const line of model.workshopLines) sheet.addRow([line])
  sheet.addRow([model.generated])
  sheet.addRow([model.chips.map((c) => (c.value ? `${c.label}: ${c.value}` : c.label)).join(' · ')])
  for (const s of model.summary) sheet.addRow([s.label, s.value]).getCell(1).font = { bold: true }
  if (model.notice) sheet.addRow([model.notice]).font = { italic: true }
  sheet.addRow([])

  const headerRow = sheet.addRow(
    model.headers.map((h) =>
      MONEY_COLUMNS.has(h.column) ? `${h.label} (${report.currencyCode})` : h.label
    )
  )
  headerRow.font = { bold: true }
  headerRow.eachCell((c) => {
    c.border = { bottom: { style: 'medium' } }
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFEFEF' } }
  })
  model.headers.forEach((h, i) => {
    if (h.numeric) headerRow.getCell(i + 1).alignment = { horizontal: 'right' }
  })
  const headerIndex = headerRow.number

  const writeCells = (cells: ReportCell[]) =>
    cells.map((c, i) => {
      const column = model.headers[i].column
      if (column === 'date' && typeof c.raw === 'string' && c.raw) {
        const [y, m, d] = c.raw.split('-').map(Number)
        return new Date(Date.UTC(y, m - 1, d))
      }
      return c.raw ?? ''
    })
  const styleRow = (row: ExcelJS.Row) => {
    model.headers.forEach((h, i) => {
      const cell = row.getCell(i + 1)
      if (MONEY_COLUMNS.has(h.column)) cell.numFmt = moneyFormat
      if (h.column === 'date') cell.numFmt = dateFormat
    })
  }
  const totalsRow = (label: string, cells: ReportCell[], bold: boolean) => {
    const span = labelSpan(model)
    const values = writeCells(cells)
    if (span > 0) values[0] = label
    else sheet.addRow([label]).font = { bold }
    const row = sheet.addRow(values)
    styleRow(row)
    row.font = { bold }
    return row
  }

  for (const section of model.sections) {
    if (section.heading) {
      const heading = sheet.addRow([section.heading])
      heading.font = { bold: true }
      if (width > 1) sheet.mergeCells(heading.number, 1, heading.number, width)
    }
    for (const cells of section.rows) styleRow(sheet.addRow(writeCells(cells)))
    if (section.subtotal && section.label !== undefined) {
      totalsRow(section.label, section.subtotal, false).font = { italic: true }
    }
  }
  const total = totalsRow(model.totalLabel, model.total, true)
  total.eachCell((c) => {
    c.border = { top: { style: 'medium' } }
  })

  sheet.views = [{ state: 'frozen', ySplit: headerIndex }]
  sheet.autoFilter = {
    from: { row: headerIndex, column: 1 },
    to: { row: headerIndex, column: width },
  }
  model.headers.forEach((h, i) => {
    const longest = Math.max(
      h.label.length + (MONEY_COLUMNS.has(h.column) ? 6 : 0),
      ...model.sections.flatMap((s) => s.rows.map((r) => r[i].text.length))
    )
    sheet.getColumn(i + 1).width = Math.min(
      Math.max(longest + 2, NUMERIC_COLUMNS.has(h.column) ? 10 : 8),
      48
    )
  })

  return Buffer.from(await workbook.xlsx.writeBuffer())
}

export async function billingReportPdf(model: ReportModel, pageLabel: string): Promise<Buffer> {
  await pdfFontsReady()
  // The component renders a <Document>; react-pdf's types only know that of the element itself.
  const element = React.createElement(BillingReportPDF, {
    model,
    pageLabel,
  }) as unknown as Parameters<typeof renderToBuffer>[0]
  return renderToBuffer(element)
}
