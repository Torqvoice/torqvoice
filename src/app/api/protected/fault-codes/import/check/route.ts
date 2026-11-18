import { NextRequest, NextResponse } from 'next/server'
import { fail, readImportRequest } from '@/features/fault-codes/Lib/codeImportRequest.server'
import { checkCodeImportFor } from '@/features/fault-codes/Lib/service.server'

/**
 * What each code in an import file would do, before anything is sent for review: new for the
 * make, a change to the text there is, the same, or a problem to fix in the file. Nothing is
 * kept. A route rather than a server action because it carries the file.
 */
export async function POST(request: NextRequest) {
  const read = await readImportRequest(request)
  if (!read.ok) return read.response
  const { organizationId, fields, file } = read
  const result = await checkCodeImportFor(organizationId, {
    make: fields.make,
    lang: fields.lang,
    rows: file.rows,
  })
  if (!result.ok) {
    if (result.reason === 'too_large') return fail(413, 'file', 'too_many')
    if (result.reason === 'invalid') return fail(400, 'invalid')
    return fail(502, 'unavailable')
  }
  return NextResponse.json({
    success: true,
    data: {
      counts: result.counts,
      // Each row with the title the file gives it, so the list reads without the file.
      rows: result.rows.map((r) => ({
        ...r,
        title: file.rows[r.n - 1]?.title ?? null,
      })),
      // What a JSON file says of itself, for the dialog to offer.
      meta: {
        make: file.make ?? null,
        language: file.language ?? null,
        source: file.source ?? null,
      },
    },
  })
}
