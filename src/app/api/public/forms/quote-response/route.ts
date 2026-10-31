import { NextResponse } from 'next/server'
import { respondToQuote } from '@/features/quotes/Actions/quoteResponseActions'
import { RestoreInProgressError } from '@/lib/backup/freeze'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const result = await respondToQuote(body)
    return NextResponse.json(result, { status: result.success ? 200 : 400 })
  } catch (error) {
    // A restore of the workshop answers 409, so the page shows why and the customer can retry.
    if (error instanceof RestoreInProgressError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 409 })
    }
    const message = error instanceof Error ? error.message : 'Failed to process quote response'
    return NextResponse.json({ success: false, error: message }, { status: 400 })
  }
}
