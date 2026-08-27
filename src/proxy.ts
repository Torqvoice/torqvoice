import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

/**
 * Cross-origin access to the technician API, in development only.
 *
 * The app that consumes this API is native, and native clients are not subject
 * to the same-origin policy, so production needs no CORS headers at all and
 * deliberately sends none. The only thing they would enable there is a browser
 * on someone else's origin holding a workshop's bearer token.
 *
 * Development is different: Expo serves the app from localhost on its own port
 * while the workshop runs on another, so every request is cross-origin and the
 * browser blocks it before the app sees a response. From inside the app that
 * is indistinguishable from being offline, which sends people hunting for the
 * wrong bug.
 *
 * This is `proxy.ts`, not `middleware.ts`. Next 16 renamed the file, and on
 * 16.3.1 the old name still loads and runs but makes every matched API route
 * answer 404, whatever the handler returns. That failure looks like a missing
 * route rather than a misplaced file, so it is worth stating here: do not
 * rename this back.
 */

const IS_DEV = process.env.NODE_ENV !== 'production'

function applyCors(response: NextResponse, origin: string | null) {
  if (!IS_DEV) return response

  // Echoes the caller's origin rather than sending `*`, because a wildcard and
  // an `Authorization` header are not a combination worth normalising, even
  // in development.
  response.headers.set('Access-Control-Allow-Origin', origin ?? '*')
  response.headers.append('Vary', 'Origin')
  response.headers.set('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS')
  response.headers.set('Access-Control-Allow-Headers', 'Authorization,Content-Type,Accept,X-Org-Id')
  response.headers.set('Access-Control-Max-Age', '600')
  // Without this the browser hides the header from the app entirely, and
  // sign-in succeeds on the server while the client reports no token back.
  // Native clients see every header and never needed it.
  response.headers.set('Access-Control-Expose-Headers', 'set-auth-token')
  return response
}

export default function proxy(request: NextRequest) {
  if (!IS_DEV) return undefined

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
