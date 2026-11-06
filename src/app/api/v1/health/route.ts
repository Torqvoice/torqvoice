import { NextResponse } from 'next/server'
import { checkHealth } from '@/lib/health'

export const dynamic = 'force-dynamic'

/**
 * The container's health check and any uptime monitor: 200 when the
 * database answers, uploads can be written and the background jobs are
 * running, 503 otherwise. Public, so it names the check that failed and
 * nothing more.
 */
export async function GET() {
  const { healthy, checks } = await checkHealth()
  return NextResponse.json(
    { status: healthy ? 'ok' : 'error', checks },
    { status: healthy ? 200 : 503, headers: { 'Cache-Control': 'no-store' } }
  )
}
