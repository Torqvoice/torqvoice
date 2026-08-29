import { createHash } from 'node:crypto'
import { NextResponse } from 'next/server'

interface RateLimitEntry {
  count: number
  resetAt: number
}

const store = new Map<string, RateLimitEntry>()

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
  { limit = 30, windowMs = 60_000 }: { limit?: number; windowMs?: number } = {}
): NextResponse | null {
  // cf-connecting-ip is set by Cloudflare and not client-forgeable on proxied
  // traffic; x-real-ip is set by nginx for direct/staging traffic. The first
  // entry of x-forwarded-for is client-controlled (proxies append, not
  // replace), so it is only a last resort.
  const forwarded = request.headers.get('x-forwarded-for')
  const ip =
    request.headers.get('cf-connecting-ip') ||
    request.headers.get('x-real-ip') ||
    forwarded?.split(',')[0]?.trim() ||
    'unknown'
  // Prefer the caller's own token over their IP.
  //
  // A workshop is one public address: eight technicians on the shop wifi share
  // it, so an IP-keyed budget is divided between them and the busiest bay
  // exhausts it for everyone. Hashed rather than stored, because this map is
  // in memory and a session token has no business sitting in it.
  //
  // Falls back to the IP for unauthenticated callers, which is the only signal
  // available before anyone has proved who they are.
  const authHeader = request.headers.get('authorization')
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
