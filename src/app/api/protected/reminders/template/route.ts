import { NextRequest, NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/get-auth-context'
import { spreadsheetTemplateResponse } from '@/features/import/Lib/template'
import { REMINDER_COLUMNS, REMINDER_TEMPLATE_ROWS } from '@/features/vehicles/Lib/reminderImport'

/** The reminder import layout, with one example row per kind of reminder. */
export async function GET(request: NextRequest) {
  const ctx = await getAuthContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  return spreadsheetTemplateResponse({
    fileBase: 'torqvoice-reminders-template',
    sheetName: 'reminders',
    headers: REMINDER_COLUMNS.map((c) => c.header),
    rows: REMINDER_TEMPLATE_ROWS,
    format: request.nextUrl.searchParams.get('format') === 'xlsx' ? 'xlsx' : 'csv',
  })
}
