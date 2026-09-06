/**
 * A readable reason for better-auth's "Invalid origin".
 *
 * better-auth refuses any request whose Origin header is not on its trusted
 * list, and says only "Invalid origin". On a self-hosted install that
 * nearly always means NEXT_PUBLIC_APP_URL differs from the address in the
 * browser, so the refusal is rewritten to say which two addresses disagree
 * and which variable to set. The refusal itself is left alone: same status,
 * same headers, nothing gets through that was refused before.
 *
 * What the message names is already public. The address the person used is
 * their own address bar, and the configured one ships to every browser in
 * the bundle as NEXT_PUBLIC_APP_URL. The full trusted list, which can hold
 * development and app origins, is not repeated.
 */

export const INVALID_ORIGIN_CODE = 'INVALID_ORIGIN'
const BETTER_AUTH_MESSAGE = 'Invalid origin'
const MAX_ORIGIN_LENGTH = 200

/** Scheme, host and port only; anything unparseable is dropped, not echoed. */
function toOrigin(raw: string | null | undefined): string | null {
  if (!raw) return null
  try {
    const { origin } = new URL(raw)
    if (origin === 'null' || origin.length > MAX_ORIGIN_LENGTH) return null
    return origin
  } catch {
    return null
  }
}

/** The origin the browser sent, the same way better-auth reads it. */
export function requestOrigin(headers: Headers): string | null {
  return toOrigin(headers.get('origin') || headers.get('referer'))
}

export function configuredOrigin(): string | null {
  return toOrigin(process.env.NEXT_PUBLIC_APP_URL)
}

export function invalidOriginMessage(origin: string | null, configured: string | null): string {
  const fix =
    'Set NEXT_PUBLIC_APP_URL to the exact address you use in the browser, then restart Torqvoice.'
  if (origin && configured)
    return `You opened Torqvoice at ${origin}, but it is configured for ${configured}. ${fix}`
  if (origin)
    return `You opened Torqvoice at ${origin}, which is not the address it is configured for. ${fix}`
  return `The address you opened Torqvoice at is not the one it is configured for. ${fix}`
}

interface RefusalBody {
  code?: unknown
  message?: unknown
}

/**
 * The same 403, with a body that says why. Any other response, and any 403
 * that is not better-auth's origin refusal, passes through untouched.
 */
export async function explainInvalidOrigin(
  request: Request,
  response: Response
): Promise<Response> {
  if (response.status !== 403) return response
  if (!(response.headers.get('content-type') ?? '').includes('application/json')) return response
  let body: RefusalBody | null
  try {
    body = (await response.clone().json()) as RefusalBody | null
  } catch {
    return response
  }
  if (body?.code !== INVALID_ORIGIN_CODE && body?.message !== BETTER_AUTH_MESSAGE) return response

  const origin = requestOrigin(request.headers)
  const configured = configuredOrigin()
  const headers = new Headers(response.headers)
  headers.delete('content-length')
  headers.set('content-type', 'application/json')
  return new Response(
    JSON.stringify({
      code: INVALID_ORIGIN_CODE,
      message: invalidOriginMessage(origin, configured),
      origin,
      configured,
    }),
    { status: response.status, statusText: response.statusText, headers }
  )
}

/**
 * Said once at startup, since the mismatch itself only shows when someone
 * tries to sign in. Both cases are the ones support sees.
 */
export function warnAboutAppUrl(): void {
  const raw = process.env.NEXT_PUBLIC_APP_URL
  if (!raw) {
    console.warn(
      '[auth] NEXT_PUBLIC_APP_URL is not set. Set it to the address people use in the browser, or sign-in is refused with "Invalid origin" and links in emails have no address.'
    )
    return
  }
  const origin = toOrigin(raw)
  if (!origin) {
    console.warn(
      `[auth] NEXT_PUBLIC_APP_URL is not a valid URL. Set it to the full address people use in the browser, such as https://torqvoice.example.com.`
    )
    return
  }
  const { hostname } = new URL(origin)
  if (
    process.env.NODE_ENV === 'production' &&
    (hostname === 'localhost' || hostname === '127.0.0.1')
  ) {
    console.warn(
      `[auth] NEXT_PUBLIC_APP_URL is ${origin}. Signing in from any other address is refused with "Invalid origin"; set it to the address people use in the browser.`
    )
  }
}
