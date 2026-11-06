import { NextRequest, NextResponse } from 'next/server'
import { isDemoMode } from '@/lib/demo'
import { fail, readImportRequest } from '@/features/fault-codes/Lib/codeImportRequest.server'
import { codeImportsFor, sendCodeImportFor } from '@/features/fault-codes/Lib/service.server'

/**
 * Sends an import's new and changed codes to the code service, where a person reviews each
 * before any workshop sees it. The sender confirms they may share what is in the file. The
 * file is read again here rather than trusted from the check.
 */
export async function POST(request: NextRequest) {
  if (isDemoMode) return fail(403, 'demo')
  const read = await readImportRequest(request)
  if (!read.ok) return read.response
  const { organizationId, fields, file, fileName, form } = read
  if (form.get('rights') !== 'yes') return fail(400, 'rights')
  const result = await sendCodeImportFor(organizationId, {
    make: fields.make,
    lang: fields.lang,
    source: fields.source ?? file.source,
    fileName,
    rows: file.rows,
  })
  if (!result.ok) {
    switch (result.reason) {
      case 'paused':
        return fail(503, 'paused')
      case 'nothing':
        return fail(400, 'nothing')
      case 'too_large':
        return fail(413, 'file', 'too_many')
      case 'invalid':
        return fail(400, 'invalid')
      default:
        return fail(502, 'unavailable')
    }
  }
  return NextResponse.json({
    success: true,
    data: { id: result.id, counts: result.counts, imports: await codeImportsFor(organizationId) },
  })
}
