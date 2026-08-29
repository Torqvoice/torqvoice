import { NextResponse } from 'next/server'
import { rateLimit } from '@/lib/rate-limit'
import { MIN_APP_VERSION } from '@/lib/tech-app-version'

/**
 * Confirms a URL is a Torqvoice server, for the app's first screen.
 *
 * Unauthenticated by necessity: the technician types a workshop address
 * before they have any credentials for it. That makes this the one endpoint
 * an anonymous caller can reach, so it says nothing about the workshop
 * running here. No name, no organization count, no version of anything that
 * would help someone fingerprint the host. Only "yes, this is the right kind
 * of server, and it speaks v1".
 */
export async function GET(request: Request) {
  const limited = rateLimit(request, { limit: 20, windowMs: 60_000 })
  if (limited) return limited

  return NextResponse.json({
    data: {
      service: 'torqvoice',
      api: 'v1',
      /** Bumped when the app must update before it can talk to this server. */
      minAppVersion: MIN_APP_VERSION,
    },
  })
}
