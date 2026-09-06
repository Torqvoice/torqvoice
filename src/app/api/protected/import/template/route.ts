import ExcelJS from 'exceljs'
import { NextRequest, NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/get-auth-context'
import { type ImportEntity, templateFieldsFor } from '@/features/import/Lib/fields'

const ENTITIES: ImportEntity[] = ['customers', 'vehicles', 'services']

/**
 * A blank spreadsheet with the headers the importer recognises on sight and
 * one example row. Offered as CSV and as an Excel workbook, since "open it,
 * paste your data in, upload" is the whole migration for a small shop.
 */
export async function GET(request: NextRequest) {
  const ctx = await getAuthContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const entity = request.nextUrl.searchParams.get('entity') as ImportEntity
  const format = request.nextUrl.searchParams.get('format') === 'xlsx' ? 'xlsx' : 'csv'
  if (!ENTITIES.includes(entity)) {
    return NextResponse.json({ error: 'Unknown import type.' }, { status: 400 })
  }

  const fields = templateFieldsFor(entity)
  const headers = fields.map((f) => f.templateHeader)
  const example = fields.map((f) => f.example)
  const fileBase = `torqvoice-${entity}-template`

  if (format === 'csv') {
    const quote = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)
    const csv = `﻿${[headers, example].map((r) => r.map(quote).join(',')).join('\r\n')}\r\n`
    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${fileBase}.csv"`,
      },
    })
  }

  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet(entity)
  sheet.addRow(headers)
  sheet.addRow(example)
  sheet.getRow(1).font = { bold: true }
  sheet.columns.forEach((col, i) => {
    col.width = Math.max(14, headers[i].length + 4)
  })
  const buffer = await workbook.xlsx.writeBuffer()
  return new NextResponse(buffer as unknown as ArrayBuffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${fileBase}.xlsx"`,
    },
  })
}
