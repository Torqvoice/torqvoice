import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  configuredOrigin,
  explainInvalidOrigin,
  invalidOriginMessage,
  requestOrigin,
  warnAboutAppUrl,
} from '@/lib/auth-origin-hint'

function refusal(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 403,
    headers: { 'content-type': 'application/json', 'set-cookie': 'a=b', ...init.headers },
    ...init,
  })
}

function request(headers: Record<string, string> = {}): Request {
  return new Request('http://localhost:3000/api/public/auth/sign-in/email', {
    method: 'POST',
    headers,
  })
}

describe('requestOrigin', () => {
  it('reduces the header to scheme, host and port', () => {
    expect(requestOrigin(new Headers({ origin: 'http://192.168.1.5:3000' }))).toBe(
      'http://192.168.1.5:3000'
    )
    expect(
      requestOrigin(new Headers({ referer: 'https://shop.example.com/auth/sign-in?x=1' }))
    ).toBe('https://shop.example.com')
  })

  it('drops anything that is not a URL rather than echoing it', () => {
    expect(requestOrigin(new Headers({ origin: 'null' }))).toBeNull()
    expect(requestOrigin(new Headers({ origin: '<script>alert(1)</script>' }))).toBeNull()
    expect(requestOrigin(new Headers({ origin: `http://${'a'.repeat(300)}.com` }))).toBeNull()
    expect(requestOrigin(new Headers())).toBeNull()
  })
})

describe('explainInvalidOrigin', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('names both addresses and keeps the refusal', async () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'http://localhost:3000')
    const res = await explainInvalidOrigin(
      request({ origin: 'http://192.168.1.5:3000' }),
      refusal({ code: 'INVALID_ORIGIN', message: 'Invalid origin' })
    )
    expect(res.status).toBe(403)
    expect(res.headers.get('set-cookie')).toBe('a=b')
    const body = await res.json()
    expect(body.code).toBe('INVALID_ORIGIN')
    expect(body.origin).toBe('http://192.168.1.5:3000')
    expect(body.configured).toBe('http://localhost:3000')
    expect(body.message).toContain('http://192.168.1.5:3000')
    expect(body.message).toContain('http://localhost:3000')
    expect(body.message).toContain('NEXT_PUBLIC_APP_URL')
  })

  it('matches on the message alone, for older bodies without a code', async () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://shop.example.com')
    const res = await explainInvalidOrigin(
      request({ origin: 'http://shop.example.com' }),
      refusal({ message: 'Invalid origin' })
    )
    const body = await res.json()
    expect(body.code).toBe('INVALID_ORIGIN')
    expect(body.configured).toBe('https://shop.example.com')
  })

  it('leaves every other response alone', async () => {
    const ok = new Response('{"ok":true}', {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
    expect(await explainInvalidOrigin(request(), ok)).toBe(ok)
    const other403 = refusal({ code: 'FORBIDDEN', message: 'Nope' })
    expect(await explainInvalidOrigin(request(), other403)).toBe(other403)
    const html = new Response('<h1>Forbidden</h1>', {
      status: 403,
      headers: { 'content-type': 'text/html' },
    })
    expect(await explainInvalidOrigin(request(), html)).toBe(html)
    const broken = new Response('not json', {
      status: 403,
      headers: { 'content-type': 'application/json' },
    })
    expect(await explainInvalidOrigin(request(), broken)).toBe(broken)
  })

  it('never repeats the trusted list, only the two addresses', async () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'http://localhost:3000')
    vi.stubEnv('EXPO_DEV_ORIGIN', 'exp://10.0.0.5:8081')
    const res = await explainInvalidOrigin(
      request({ origin: 'http://192.168.1.5:3000' }),
      refusal({ code: 'INVALID_ORIGIN', message: 'Invalid origin' })
    )
    expect(await res.text()).not.toContain('exp://')
  })
})

describe('invalidOriginMessage', () => {
  it('still explains when one side is unknown', () => {
    expect(invalidOriginMessage('http://a:3000', null)).toContain('http://a:3000')
    expect(invalidOriginMessage(null, null)).toContain('NEXT_PUBLIC_APP_URL')
  })
})

describe('warnAboutAppUrl', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it('warns when unset, invalid, or localhost in production', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    vi.stubEnv('NEXT_PUBLIC_APP_URL', '')
    warnAboutAppUrl()
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'torqvoice.example.com')
    warnAboutAppUrl()
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'http://localhost:3000')
    vi.stubEnv('NODE_ENV', 'production')
    warnAboutAppUrl()
    expect(warn).toHaveBeenCalledTimes(3)
    expect(configuredOrigin()).toBe('http://localhost:3000')
  })

  it('stays quiet for a proper public address', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://torqvoice.example.com')
    vi.stubEnv('NODE_ENV', 'production')
    warnAboutAppUrl()
    expect(warn).not.toHaveBeenCalled()
  })
})
