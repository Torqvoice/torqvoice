import { NextRequest, NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/get-auth-context'
import { type ImportEntity, templateFieldsFor } from '@/features/import/Lib/fields'
import { spreadsheetTemplateResponse } from '@/features/import/Lib/template'

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
  return spreadsheetTemplateResponse({
    fileBase: `torqvoice-${entity}-template`,
    sheetName: entity,
    headers: fields.map((f) => f.templateHeader),
    rows: [fields.map((f) => f.example)],
    format,
  })
}
