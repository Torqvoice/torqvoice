import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The sign-in door counts callers by address, whatever they put in the
 * Authorization header.
 *
 * The limiter keys a request on its bearer token when one is present, which
 * is right for the technician API, where the token is the identity. On the
 * auth route nobody has a session yet, and the route used to call the
 * limiter without saying so: a made-up bearer on every request was a fresh
 * budget for guessing passwords, reset tokens and 2FA codes. The route passes
 * `anonymous` now, and this holds it to that.
 */

async function freshLimiter() {
  vi.resetModules()
  return (await import('@/lib/auth-rate-limit')).limitAuthRequest
}

function signIn(headers: Record<string, string> = {}) {
  return new Request('https://app.torqvoice.com/api/public/auth/sign-in/email', {
    method: 'POST',
    headers: { 'x-real-ip': '203.0.113.9', ...headers },
  })
}

beforeEach(() => {
  vi.unstubAllEnvs()
})

describe('the sign-in budget', () => {
  it('is spent by address, and a rotating bearer token does not refill it', async () => {
    const limit = await freshLimiter()
    const path = '/api/public/auth/sign-in/email'

    for (let n = 1; n <= 10; n++) {
      const attempt = signIn({ authorization: `Bearer made-up-${n}` })
      expect(limit(attempt, path), `attempt ${n}`).toBeNull()
    }
    // Eleventh try, eleventh invented token, same caller: refused.
    const eleventh = limit(signIn({ authorization: 'Bearer made-up-11' }), path)
    expect(eleventh?.status).toBe(429)
    // And so is one with no header at all; it is the same address.
    expect(limit(signIn(), path)?.status).toBe(429)
  })

  it('keeps the tighter budget for sign-up and reset, and a looser one elsewhere', async () => {
    const limit = await freshLimiter()

    const resets = '/api/public/auth/request-password-reset'
    for (let n = 1; n <= 5; n++) expect(limit(signIn(), resets)).toBeNull()
    expect(limit(signIn(), resets)?.status).toBe(429)

    // A different budget for a path that is not on the strict list.
    const other = '/api/public/auth/get-session'
    expect(limit(signIn(), other)).toBeNull()
  })
})
