import { NextResponse } from 'next/server'
import {
  createQuoteRequest,
  cancelQuoteRequest,
} from '@/features/inspections/Actions/quoteRequestActions'
import { RestoreInProgressError } from '@/lib/backup/freeze'

/** A restore of the workshop answers 409, so the page shows why and the customer can retry. */
function restoring(error: unknown) {
  return error instanceof RestoreInProgressError
    ? NextResponse.json({ success: false, error: error.message }, { status: 409 })
    : null
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const result = await createQuoteRequest(body)
    return NextResponse.json(result, { status: result.success ? 200 : 400 })
  } catch (error) {
    const refused = restoring(error)
    if (refused) return refused
    const message = error instanceof Error ? error.message : 'Failed to create quote request'
    return NextResponse.json({ success: false, error: message }, { status: 400 })
  }
}

export async function DELETE(request: Request) {
  try {
    const body = await request.json()
    const result = await cancelQuoteRequest(body)
    return NextResponse.json(result, { status: result.success ? 200 : 400 })
  } catch (error) {
    const refused = restoring(error)
    if (refused) return refused
    const message = error instanceof Error ? error.message : 'Failed to cancel quote request'
    return NextResponse.json({ success: false, error: message }, { status: 400 })
  }
}
