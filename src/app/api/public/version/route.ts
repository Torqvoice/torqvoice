import { NextResponse } from 'next/server'
import { buildVersion } from '@/lib/build-version.server'

export const dynamic = 'force-dynamic'

/**
 * Which build is running. Open tabs ask now and then and offer a reload when
 * the answer is not the build they were loaded from. A route and not a server
 * action: an action of the old build is exactly what stops working after a
 * deploy. Public, because a tab whose session ran out still needs the answer.
 */
export function GET() {
  return NextResponse.json(
    { version: buildVersion() },
    { headers: { 'Cache-Control': 'no-store' } }
  )
}
