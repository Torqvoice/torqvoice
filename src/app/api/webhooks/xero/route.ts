import { type NextRequest, NextResponse } from 'next/server'
import { receiveXeroWebhook } from '@/integrations/xero/webhook'

/**
 * Xero's webhook address, one for every connection on the same Xero app.
 * Xero wants an answer within five seconds and an empty body, so this only
 * checks the signature and queues work; the integration cron does the rest.
 */
export async function POST(request: NextRequest) {
  const body = await request.text()
  const { status } = await receiveXeroWebhook(body, request.headers.get('x-xero-signature'))
  return new NextResponse(null, { status })
}
