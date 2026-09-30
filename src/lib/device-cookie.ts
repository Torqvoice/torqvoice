import { randomBytes } from 'node:crypto'

/** Long-lived cookie naming this browser to the app, across sign-ins. */
export const DEVICE_COOKIE = 'torqvoice-device'
const DEVICE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365
const DEVICE_ID_PATTERN = /^[a-f0-9]{48}$/

/** The device id a request carries, or null when the browser has none yet. */
export function readDeviceCookie(
  headers: { get(name: string): string | null } | undefined
): string | null {
  const raw = headers?.get('cookie')
  if (!raw) return null
  for (const part of raw.split(';')) {
    const [name, ...rest] = part.trim().split('=')
    if (name === DEVICE_COOKIE) {
      const value = rest.join('=').trim()
      return DEVICE_ID_PATTERN.test(value) ? value : null
    }
  }
  return null
}

/**
 * Gives a browser its device id before better-auth sees the request.
 *
 * The session hook that records devices runs after the response has been
 * put together, so a cookie set from there never reaches the browser. The
 * id is minted here instead, added to the request's cookie header so the
 * hook reads it like any returning device, and set on the response so the
 * browser brings it back next time.
 */
export function withDeviceCookie(request: Request): { request: Request; issued: string | null } {
  if (readDeviceCookie(request.headers)) return { request, issued: null }

  const issued = randomBytes(24).toString('hex')
  const headers = new Headers(request.headers)
  const existing = headers.get('cookie')
  headers.set(
    'cookie',
    existing ? `${existing}; ${DEVICE_COOKIE}=${issued}` : `${DEVICE_COOKIE}=${issued}`
  )
  return { request: new Request(request, { headers }), issued }
}

/** Sets the freshly issued id on the response, leaving other cookies alone. */
export function attachDeviceCookie(response: Response, issued: string | null): Response {
  if (!issued) return response
  const secure = (process.env.NEXT_PUBLIC_APP_URL ?? '').startsWith('https://')
  response.headers.append(
    'set-cookie',
    `${DEVICE_COOKIE}=${issued}; Path=/; Max-Age=${DEVICE_COOKIE_MAX_AGE}; HttpOnly; SameSite=Lax${secure ? '; Secure' : ''}`
  )
  return response
}
