import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

/**
 * Cross-origin access to the technician API, in development only.
 *
 * The app that consumes this API is native, and native clients are not subject
 * to the same-origin policy, so production needs no CORS headers at all and
 * deliberately sends none. Anything that would benefit from them in production
 * is a browser on someone else's origin holding a workshop's bearer token,
 * which is not a thing this API wants to make easier.
 *
 * Development is different: Expo serves the app from localhost on its own port
 * while the workshop runs on another, so every request is cross-origin and the
 * browser blocks it before the app sees a response. That failure looks exactly
 * like a network outage from inside the app, which sends people hunting for
 * the wrong bug.
 *
 * Scoped by the matcher below to the technician API and the auth endpoints it
 * signs in against. It never runs for a page or a server action.
 */

const DEV_ONLY = process.env.NODE_ENV !== 'production'

function applyCors(response: NextResponse, origin: string | null) {
  if (!DEV_ONLY) return response

  // Echoes the caller's origin rather than sending `*`, because a wildcard and
  // an `Authorization` header are not a combination worth normalising, even
  // in development.
  response.headers.set('Access-Control-Allow-Origin', origin ?? '*')
  response.headers.set('Vary', 'Origin')
  response.headers.set('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS')
  response.headers.set('Access-Control-Allow-Headers', 'Authorization,Content-Type,Accept,X-Org-Id')
  response.headers.set('Access-Control-Max-Age', '600')
  // Without this the browser hides the header from the app entirely, and
  // sign-in succeeds on the server while the client reports no token back.
  // Native clients see every header and never needed it.
  response.headers.set('Access-Control-Expose-Headers', 'set-auth-token')
  return response
}

export function middleware(request: NextRequest) {
  const origin = request.headers.get('origin')

  // Preflight. The app sends Authorization and X-Org-Id, both of which put
  // every request past the "simple request" bar and into a preflight.
  if (request.method === 'OPTIONS') {
    return applyCors(new NextResponse(null, { status: 204 }), origin)
  }

  return applyCors(NextResponse.next(), origin)
}

export const config = {
  matcher: [
    '/api/v1/tech/:path*',
    // Sign-in lives here, so the app hits it before it has a session and
    // would otherwise fail its very first request from a browser.
    '/api/public/auth/:path*',
  ],
}
