import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { generateKeyPairSync, sign } from 'node:crypto'
import { isCloudInstance, verifyCloudTokenWith } from '@/lib/cloud-instance'

const APP = 'https://app.torqvoice.com'

const { privateKey, publicKey } = generateKeyPairSync('ed25519')
const other = generateKeyPairSync('ed25519')

function mint(
  overrides: Partial<Record<string, unknown>> = {},
  key = privateKey,
  prefix = 'tvc1'
): string {
  const payload = { v: 1, origin: APP, issuedAt: new Date().toISOString(), ...overrides }
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const sig = sign(null, Buffer.from(encoded), key).toString('base64url')
  return `${prefix}.${encoded}.${sig}`
}

const verify = (token: string | null | undefined, appUrl: string | undefined = APP) =>
  verifyCloudTokenWith([publicKey], token, appUrl)

describe('verifyCloudTokenWith', () => {
  it('accepts a token signed for this origin', () => {
    expect(verify(mint())).toBe('valid')
  })

  it('compares origins, not the written URL', () => {
    expect(verify(mint(), `${APP}/`)).toBe('valid')
    expect(verify(mint({ origin: `${APP}/` }), APP)).toBe('valid')
  })

  it('reports a missing token', () => {
    expect(verify(undefined)).toBe('missing')
    expect(verify('  ')).toBe('missing')
  })

  it('refuses a token minted for another URL', () => {
    expect(verify(mint(), 'https://staging.torqvoice.com')).toBe('wrong-origin')
    expect(verify(mint(), '')).toBe('wrong-origin')
  })

  it('honours an expiry when the token has one', () => {
    const now = Date.now()
    const token = mint({ expiresAt: new Date(now + 60_000).toISOString() })
    expect(verifyCloudTokenWith([publicKey], token, APP, new Date(now))).toBe('valid')
    expect(verifyCloudTokenWith([publicKey], token, APP, new Date(now + 120_000))).toBe('expired')
    expect(verify(mint({ expiresAt: 'soon' }))).toBe('invalid')
  })

  it('refuses a token signed with another key', () => {
    expect(verify(mint({}, other.privateKey))).toBe('invalid')
  })

  it('refuses a white-label licence token, even one signed with the right key', () => {
    expect(verify(mint({}, privateKey, 'tvl1'))).toBe('invalid')
  })

  it('refuses a payload edited after signing', () => {
    const [prefix, , sig] = mint().split('.')
    const forged = Buffer.from(
      JSON.stringify({ v: 1, origin: 'https://evil.example', issuedAt: new Date().toISOString() })
    ).toString('base64url')
    expect(verify(`${prefix}.${forged}.${sig}`, 'https://evil.example')).toBe('invalid')
  })

  it('refuses malformed tokens and payloads', () => {
    expect(verify('tvc1.abc')).toBe('invalid')
    expect(verify('nonsense')).toBe('invalid')
    expect(verify(mint({ v: 2 }))).toBe('invalid')
    expect(verify(mint({ origin: 'not a url' }))).toBe('invalid')
    expect(verify(mint({ origin: undefined }))).toBe('invalid')
  })
})

describe('isCloudInstance', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockReturnValue(undefined)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it('is off outside cloud mode', () => {
    vi.stubEnv('TORQVOICE_MODE', 'self-hosted')
    expect(isCloudInstance()).toBe(false)
    expect(console.error).not.toHaveBeenCalled()
  })

  it('is off when cloud mode is set without a token, and says why', () => {
    vi.stubEnv('TORQVOICE_MODE', 'cloud')
    vi.stubEnv('TORQVOICE_CLOUD_TOKEN', '')
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://workshop.example')
    expect(isCloudInstance()).toBe(false)
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('is not set'))
  })

  it('is off with a token nobody at torqvoice.com signed', () => {
    vi.stubEnv('TORQVOICE_MODE', 'cloud')
    vi.stubEnv('TORQVOICE_CLOUD_TOKEN', mint({ origin: 'https://workshop.example' }))
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://workshop.example')
    expect(isCloudInstance()).toBe(false)
  })
})
