import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createHmac } from 'node:crypto'

vi.mock('@/lib/db', () => ({ db: {} }))

import {
  ACCOUNT_LINK_PREFIX,
  ACCOUNT_LINK_TTL_SECONDS,
  accountLinkUrl,
  billingRequest,
  checkoutUrl,
  createAccountLinkToken,
  createHandoffToken,
  HANDOFF_PREFIX,
  HANDOFF_TTL_SECONDS,
  isTorqvoiceComBillingConfigured,
  TorqvoiceComError,
} from '@/lib/torqvoice-com'

const SECRET = 'a-service-secret-that-is-long-enough'

function decode(token: string) {
  const [prefix, payload, signature] = token.split('.')
  return {
    prefix,
    signature,
    payload: JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')),
    encodedPayload: payload,
  }
}

beforeEach(() => {
  vi.stubEnv('TORQVOICE_SERVICE_SECRET', SECRET)
  vi.stubEnv('TORQVOICE_MODE', 'cloud')
  vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://app.torqvoice.com/some/path')
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('isTorqvoiceComBillingConfigured', () => {
  it('needs cloud mode and the shared secret', () => {
    expect(isTorqvoiceComBillingConfigured()).toBe(true)
    vi.stubEnv('TORQVOICE_MODE', '')
    expect(isTorqvoiceComBillingConfigured()).toBe(false)
    vi.stubEnv('TORQVOICE_MODE', 'cloud')
    vi.stubEnv('TORQVOICE_SERVICE_SECRET', 'short')
    expect(isTorqvoiceComBillingConfigured()).toBe(false)
  })
})

describe('createHandoffToken', () => {
  const input = {
    organizationId: 'org-1',
    plan: 'pro' as const,
    email: 'owner@example.com',
    name: 'Owner',
  }

  it('signs the organization, plan, buyer and this app origin with the shared secret', () => {
    const now = 1_700_000_000_000
    const token = createHandoffToken(input, now)
    const { prefix, payload, signature, encodedPayload } = decode(token)

    expect(prefix).toBe(HANDOFF_PREFIX)
    expect(payload).toMatchObject({
      v: 1,
      org: 'org-1',
      plan: 'pro',
      email: 'owner@example.com',
      name: 'Owner',
      appUrl: 'https://app.torqvoice.com',
      iat: 1_700_000_000,
      exp: 1_700_000_000 + HANDOFF_TTL_SECONDS,
    })
    expect(payload.jti).toMatch(/^[A-Za-z0-9_-]{20,}$/)

    const expected = createHmac('sha256', SECRET)
      .update(`${HANDOFF_PREFIX}.${encodedPayload}`)
      .digest('base64url')
    expect(signature).toBe(expected)
  })

  it('refuses to mint without the secret', () => {
    vi.stubEnv('TORQVOICE_SERVICE_SECRET', '')
    expect(() => createHandoffToken(input)).toThrow(/TORQVOICE_SERVICE_SECRET/)
  })

  it('lands on the checkout page of torqvoice.com', () => {
    const url = new URL(checkoutUrl('tvh1.a.b'))
    expect(url.origin).toBe('https://torqvoice.com')
    expect(url.pathname).toBe('/checkout')
    expect(url.searchParams.get('token')).toBe('tvh1.a.b')
  })
})

describe('createAccountLinkToken', () => {
  it('signs who is signed in, with a one-time id and a two-minute life', () => {
    const now = 1_700_000_000_000
    const token = createAccountLinkToken(
      { userId: 'user-1', email: 'owner@example.com', name: 'Owner', emailVerified: true },
      now
    )
    const { prefix, payload, signature, encodedPayload } = decode(token)
    expect(prefix).toBe(ACCOUNT_LINK_PREFIX)
    expect(payload).toMatchObject({
      v: 1,
      sub: 'user-1',
      email: 'owner@example.com',
      name: 'Owner',
      emailVerified: true,
      appUrl: 'https://app.torqvoice.com',
      iat: 1_700_000_000,
      exp: 1_700_000_000 + ACCOUNT_LINK_TTL_SECONDS,
    })
    expect(payload.jti).toMatch(/^[A-Za-z0-9_-]{20,}$/)
    const expected = createHmac('sha256', SECRET)
      .update(`${ACCOUNT_LINK_PREFIX}.${encodedPayload}`)
      .digest('base64url')
    expect(signature).toBe(expected)
    expect(ACCOUNT_LINK_TTL_SECONDS).toBeLessThanOrEqual(HANDOFF_TTL_SECONDS)
  })

  it('is never the same twice', () => {
    const input = { userId: 'u', email: 'a@b.c', name: '', emailVerified: false }
    expect(createAccountLinkToken(input)).not.toBe(createAccountLinkToken(input))
  })

  it('points at the sign-in endpoint on torqvoice.com', () => {
    const url = new URL(accountLinkUrl('tva1.a.b'))
    expect(url.origin).toBe('https://torqvoice.com')
    expect(url.pathname).toBe('/api/auth/sso/app-link')
    expect(url.searchParams.get('token')).toBe('tva1.a.b')
  })
})

describe('billingRequest', () => {
  it('posts to torqvoice.com with the bearer secret and this app origin', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ url: 'https://billing.stripe.com/x' }), { status: 200 })
      )
    vi.stubGlobal('fetch', fetchMock)

    const result = await billingRequest<{ url: string }>('portal', { organizationId: 'org-1' })

    expect(result).toEqual({ url: 'https://billing.stripe.com/x' })
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://torqvoice.com/api/app/subscription/portal')
    expect(init.method).toBe('POST')
    expect(init.headers.Authorization).toBe(`Bearer ${SECRET}`)
    expect(JSON.parse(init.body)).toEqual({
      appUrl: 'https://app.torqvoice.com',
      organizationId: 'org-1',
    })
  })

  it('shows a refusal the site marks for the customer, and hides everything else', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ error: 'No billing account found', code: 'billing' }), {
            status: 400,
          })
        )
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
        )
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ error: 'stack trace here', code: 'billing' }), {
            status: 500,
          })
        )
    )

    await expect(billingRequest('portal', {})).rejects.toMatchObject({
      name: 'TorqvoiceComError',
      message: 'No billing account found',
      status: 400,
    })
    // A wrong secret is the operator's problem, never "Unauthorized" to a
    // customer who is signed in.
    await expect(billingRequest('portal', {})).rejects.toMatchObject({
      message: 'Billing is temporarily unavailable',
      status: 502,
      upstreamStatus: 401,
    })
    await expect(billingRequest('portal', {})).rejects.toMatchObject({
      message: 'Billing is temporarily unavailable',
      status: 502,
      upstreamStatus: 500,
    })
  })

  it('caps the name at what the site accepts', () => {
    const token = createHandoffToken({
      ...{ organizationId: 'o', plan: 'pro', email: 'a@b.c' },
      name: 'x'.repeat(500),
    })
    expect(decode(token).payload.name).toHaveLength(200)
  })

  it('turns an unreachable torqvoice.com into a 502', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')))
    const error: unknown = await billingRequest('cancel', {}).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(TorqvoiceComError)
    expect((error as TorqvoiceComError).status).toBe(502)
  })

  it('refuses without the secret before touching the network', async () => {
    vi.stubEnv('TORQVOICE_SERVICE_SECRET', '')
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    await expect(billingRequest('resume', {})).rejects.toMatchObject({ status: 500 })
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
