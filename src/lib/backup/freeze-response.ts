import { NextResponse } from 'next/server'
import { RESTORE_IN_PROGRESS_MESSAGE } from './freeze'

/**
 * The answer a vendor webhook gets while its workshop is being restored.
 * A write made now would be lost when the restore replaces the workshop's
 * rows, so nothing is written; a 503 with Retry-After makes the vendor
 * deliver the event again once the restore is done.
 */
export function restoringResponse(): NextResponse {
  return NextResponse.json(
    { error: RESTORE_IN_PROGRESS_MESSAGE },
    { status: 503, headers: { 'Retry-After': '300' } }
  )
}
