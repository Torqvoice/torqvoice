import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Who a request gets counted as.
 *
 * The limiter is only worth anything if a caller cannot choose their own
 * identity. Production sits behind nginxproxy/nginx-proxy, which overwrites
 * X-Real-IP from the real connection and appends to X-Forwarded-For. It has no
 * reason to strip CF-Connecting-IP, so that header arrives exactly as written
 * by whoever sent it.
 */

const ATTACKER = { limit: 2, windowMs: 60_000, anonymous: true }

function req(headers: Record<string, string>, path = '/api/v1/tech/org/o/auth/verify') {
  return new Request(`https://app.torqvoice.com${path}`, { method: 'POST', headers })
}

async function freshLimiter() {
  vi.resetModules()
  return (await import('@/lib/rate-limit')).rateLimit
}

beforeEach(() => {
  vi.unstubAllEnvs()
})
afterEach(() => {
  vi.unstubAllEnvs()
})

describe('client address', () => {
  it('cannot be chosen by the caller with cf-connecting-ip', async () => {
    const rateLimit = await freshLimiter()
    const spoof = (n: number) =>
      req({ 'x-real-ip': '203.0.113.9', 'cf-connecting-ip': `10.0.0.${n}` })

    expect(rateLimit(spoof(1), ATTACKER)).toBeNull()
    expect(rateLimit(spoof(2), ATTACKER)).toBeNull()
    // Third request, third invented address, still the same real caller.
    expect(rateLimit(spoof(3), ATTACKER)?.status).toBe(429)
  })

  it('cannot be chosen by prepending to x-forwarded-for either', async () => {
    const rateLimit = await freshLimiter()
    // Proxies append, so the entry the proxy added is the last one and
    // everything before it is whatever the caller typed.
    const spoof = (n: number) => req({ 'x-forwarded-for': `10.0.0.${n}, 203.0.113.9` })

    expect(rateLimit(spoof(1), ATTACKER)).toBeNull()
    expect(rateLimit(spoof(2), ATTACKER)).toBeNull()
    expect(rateLimit(spoof(3), ATTACKER)?.status).toBe(429)
  })

  it('honours cf-connecting-ip only where Cloudflare really is in front', async () => {
    vi.stubEnv('TRUST_CF_CONNECTING_IP', 'true')
    const rateLimit = await freshLimiter()

    // Two genuinely different visitors behind the CDN keep separate budgets.
    expect(rateLimit(req({ 'cf-connecting-ip': '198.51.100.1' }), ATTACKER)).toBeNull()
    expect(rateLimit(req({ 'cf-connecting-ip': '198.51.100.2' }), ATTACKER)).toBeNull()
    expect(rateLimit(req({ 'cf-connecting-ip': '198.51.100.1' }), ATTACKER)).toBeNull()
    expect(rateLimit(req({ 'cf-connecting-ip': '198.51.100.1' }), ATTACKER)?.status).toBe(429)
  })

  it('keeps separate budgets for genuinely separate callers', async () => {
    const rateLimit = await freshLimiter()

    expect(rateLimit(req({ 'x-real-ip': '203.0.113.1' }), ATTACKER)).toBeNull()
    expect(rateLimit(req({ 'x-real-ip': '203.0.113.2' }), ATTACKER)).toBeNull()
    expect(rateLimit(req({ 'x-real-ip': '203.0.113.1' }), ATTACKER)).toBeNull()
    expect(rateLimit(req({ 'x-real-ip': '203.0.113.1' }), ATTACKER)?.status).toBe(429)
  })

  it('counts one workshop’s technicians separately once they are signed in', async () => {
    const rateLimit = await freshLimiter()
    // Eight technicians share one public address on the shop wifi, so an
    // address-keyed budget would be divided between them.
    const tech = (token: string) =>
      req({ 'x-real-ip': '203.0.113.7', authorization: `Bearer ${token}` })

    const opts = { limit: 2, windowMs: 60_000 }
    expect(rateLimit(tech('alice'), opts)).toBeNull()
    expect(rateLimit(tech('alice'), opts)).toBeNull()
    expect(rateLimit(tech('alice'), opts)?.status).toBe(429)
    // Bob is unaffected by Alice being busy.
    expect(rateLimit(tech('bob'), opts)).toBeNull()
  })
})
