import ExcelJS from 'exceljs'
import { NextResponse } from 'next/server'

/**
 * A download of headers and example rows, as CSV or an Excel workbook. The CSV
 * carries a BOM so Excel opens it as UTF-8 instead of mangling "ø" and "ü".
 */
export async function spreadsheetTemplateResponse(opts: {
  fileBase: string
  sheetName: string
  headers: readonly string[]
  rows: readonly (readonly string[])[]
  format: 'csv' | 'xlsx'
}): Promise<NextResponse> {
  const { fileBase, sheetName, headers, rows, format } = opts

  if (format === 'csv') {
    const quote = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)
    const csv = `﻿${[headers, ...rows].map((r) => r.map(quote).join(',')).join('\r\n')}\r\n`
    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${fileBase}.csv"`,
      },
    })
  }

  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet(sheetName)
  sheet.addRow([...headers])
  for (const row of rows) sheet.addRow([...row])
  sheet.getRow(1).font = { bold: true }
  sheet.columns.forEach((col, i) => {
    const longest = Math.max(headers[i].length, ...rows.map((r) => (r[i] ?? '').length))
    col.width = Math.min(40, Math.max(14, longest + 4))
  })
  const buffer = await workbook.xlsx.writeBuffer()
  return new NextResponse(buffer as unknown as ArrayBuffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${fileBase}.xlsx"`,
    },
  })
}
