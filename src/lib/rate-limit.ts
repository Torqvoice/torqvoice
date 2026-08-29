import { createHash } from 'node:crypto'
import { NextResponse } from 'next/server'

interface RateLimitEntry {
  count: number
  resetAt: number
}

const store = new Map<string, RateLimitEntry>()

/**
 * Whether Cloudflare genuinely fronts every request to this deployment.
 *
 * `cf-connecting-ip` is the only header carrying the real visitor when
 * Cloudflare is proxying, because the proxy behind it sets `X-Real-IP` from
 * the connection it can see, which is a Cloudflare edge address shared by
 * thousands of people. Trusting it there is not optional: without it every
 * visitor collapses into a handful of buckets and real users start collecting
 * 429s.
 *
 * It is also worthless the moment anybody can reach the origin without going
 * through Cloudflare, because then it is simply a header the caller wrote.
 * Turning this on is a statement that the origin refuses direct traffic.
 *
 * Off by default, for the self-hosted install behind nothing but its own
 * nginx, where trusting it would hand every caller their own rate limit.
 */
const TRUST_CLOUDFLARE = process.env.TRUST_CF_CONNECTING_IP === 'true'

/** Said once, not per request. */
let warnedAboutCloudflare = false

/**
 * Who to hold responsible for a request.
 *
 * Only headers a hop we control has overwritten. `X-Real-IP` is set by the
 * proxy from the real connection and a client cannot influence it.
 * `X-Forwarded-For` is appended to rather than replaced, so the entry the
 * proxy added is the last one and everything before it is whatever the caller
 * felt like typing.
 */
function clientAddress(request: Request): string {
  const cf = request.headers.get('cf-connecting-ip')?.trim()

  if (TRUST_CLOUDFLARE) {
    if (cf) return cf
  } else if (cf && !warnedAboutCloudflare) {
    // The expensive misconfiguration, and a silent one in both directions.
    // Seeing this header at all means either Cloudflare is in front and every
    // visitor is about to be counted as the same handful of edge addresses, or
    // somebody is sending it who should not be.
    warnedAboutCloudflare = true
    console.warn(
      '[rate-limit] cf-connecting-ip is arriving but is not trusted, so every ' +
        'visitor is being counted as the proxy address they arrived through. ' +
        'If Cloudflare fronts this deployment and the origin refuses direct ' +
        'traffic, set TRUST_CF_CONNECTING_IP=true.'
    )
  }

  const real = request.headers.get('x-real-ip')?.trim()
  if (real) return real

  const chain = request.headers.get('x-forwarded-for')?.split(',') ?? []
  return chain[chain.length - 1]?.trim() || 'unknown'
}

// Clean up expired entries every 5 minutes
setInterval(
  () => {
    const now = Date.now()
    for (const [key, entry] of store) {
      if (now > entry.resetAt) {
        store.delete(key)
      }
    }
  },
  5 * 60 * 1000
)

/**
 * Simple in-memory rate limiter.
 * Returns null if the request is allowed, or a 429 NextResponse if rate limited.
 */
export function rateLimit(
  request: Request,
  {
    limit = 30,
    windowMs = 60_000,
    anonymous = false,
  }: {
    limit?: number
    windowMs?: number
    /**
     * Key on the address alone, for endpoints that do not require a session.
     *
     * The token-keyed budget below is right for authenticated traffic and
     * exactly wrong without it: an endpoint anybody can call will happily
     * accept `Authorization: Bearer <anything>`, and a caller who changes that
     * value every request gets a fresh budget every request. On the sign-in
     * endpoints that is the whole rate limit gone, which is the only thing
     * standing between a guesser and a six digit code.
     */
    anonymous?: boolean
  } = {}
): NextResponse | null {
  const ip = clientAddress(request)
  // Prefer the caller's own token over their IP.
  //
  // A workshop is one public address: eight technicians on the shop wifi share
  // it, so an IP-keyed budget is divided between them and the busiest bay
  // exhausts it for everyone. Hashed rather than stored, because this map is
  // in memory and a session token has no business sitting in it.
  //
  // Falls back to the IP for unauthenticated callers, which is the only signal
  // available before anyone has proved who they are.
  const authHeader = anonymous ? null : request.headers.get('authorization')
  const identity = authHeader?.toLowerCase().startsWith('bearer ')
    ? `t:${createHash('sha256').update(authHeader.slice(7)).digest('hex').slice(0, 32)}`
    : `ip:${ip}`

  const url = new URL(request.url)
  const key = `${identity}:${url.pathname}`

  const now = Date.now()
  const entry = store.get(key)

  if (!entry || now > entry.resetAt) {
    store.set(key, { count: 1, resetAt: now + windowMs })
    return null
  }

  entry.count++

  if (entry.count > limit) {
    const retryAfter = Math.ceil((entry.resetAt - now) / 1000)
    return NextResponse.json(
      { error: 'Too many requests. Please try again later.' },
      {
        status: 429,
        headers: {
          'Retry-After': String(retryAfter),
        },
      }
    )
  }

  return null
}
