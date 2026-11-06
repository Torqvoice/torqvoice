import { NextRequest, NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/get-auth-context'
import { spreadsheetTemplateResponse } from '@/features/import/Lib/template'
import {
  EXAMPLE_HEADERS,
  exampleJson,
  exampleSheetRows,
} from '@/features/fault-codes/Lib/codeImportFile.server'

/**
 * The example file for importing fault codes, as an Excel workbook, a CSV or JSON: two codes
 * with every column filled in or left out, so a workshop sees the shape and types over it.
 */
export async function GET(request: NextRequest) {
  const ctx = await getAuthContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const format = request.nextUrl.searchParams.get('format')
  if (format === 'json') {
    return new NextResponse(exampleJson(), {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': 'attachment; filename="torqvoice-fault-codes-example.json"',
      },
    })
  }
  return spreadsheetTemplateResponse({
    fileBase: 'torqvoice-fault-codes-example',
    sheetName: 'Fault codes',
    headers: EXAMPLE_HEADERS,
    rows: exampleSheetRows(),
    format: format === 'csv' ? 'csv' : 'xlsx',
  })
}
