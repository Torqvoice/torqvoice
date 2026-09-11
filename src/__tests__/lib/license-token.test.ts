import { describe, it, expect } from 'vitest'
import { generateKeyPairSync, sign } from 'node:crypto'
import {
  LICENSE_TOKEN_MAX_AGE_DAYS,
  verifyLicenseToken,
  verifyLicenseTokenWith,
} from '@/lib/license/token'

const DAY_MS = 24 * 60 * 60 * 1000
const ORG = 'org-abc'

const { privateKey, publicKey } = generateKeyPairSync('ed25519')
const other = generateKeyPairSync('ed25519')

function mint(
  overrides: Partial<Record<string, unknown>> = {},
  key = privateKey,
  prefix = 'tvl1'
): string {
  const payload = {
    v: 1,
    lid: 'lic-1',
    org: ORG,
    plan: 'white-label',
    expiresAt: new Date(Date.now() + 200 * DAY_MS).toISOString(),
    issuedAt: new Date().toISOString(),
    ...overrides,
  }
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const sig = sign(null, Buffer.from(encoded), key).toString('base64url')
  return `${prefix}.${encoded}.${sig}`
}

const verify = (token: string | null | undefined, now?: Date) =>
  verifyLicenseTokenWith([publicKey], token, ORG, now)

describe('verifyLicenseToken', () => {
  it('accepts a fresh token signed for this org', () => {
    const v = verify(mint())
    expect(v.status).toBe('valid')
    expect(v.payload?.plan).toBe('white-label')
    expect(v.ageDays).toBe(0)
    expect(v.daysUntilExpiry).toBe(200)
  })

  it('reports missing when there is no token', () => {
    expect(verify(null).status).toBe('missing')
    expect(verify('').status).toBe('missing')
    expect(verify(undefined).status).toBe('missing')
  })

  it('rejects a token signed with a different key', () => {
    expect(verify(mint({}, other.privateKey)).status).toBe('invalid')
  })

  it('rejects a token minted for another organization', () => {
    expect(verify(mint({ org: 'someone-else' })).status).toBe('invalid')
  })

  it('rejects a payload that was edited after signing', () => {
    const token = mint({ expiresAt: new Date(Date.now() - DAY_MS).toISOString() })
    const [prefix, , sig] = token.split('.')
    const forged = Buffer.from(
      JSON.stringify({
        v: 1,
        lid: 'lic-1',
        org: ORG,
        plan: 'white-label',
        expiresAt: new Date(Date.now() + 999 * DAY_MS).toISOString(),
        issuedAt: new Date().toISOString(),
      })
    ).toString('base64url')
    expect(verify(`${prefix}.${forged}.${sig}`).status).toBe('invalid')
  })

  it('rejects garbage and wrong prefixes', () => {
    expect(verify('not-a-token').status).toBe('invalid')
    expect(verify('a.b.c').status).toBe('invalid')
    expect(verify(mint({}, privateKey, 'tvl9')).status).toBe('invalid')
  })

  it('rejects a well-signed payload with the wrong shape', () => {
    expect(verify(mint({ v: 2 })).status).toBe('invalid')
    expect(verify(mint({ plan: '' })).status).toBe('invalid')
    expect(verify(mint({ issuedAt: 'yesterday' })).status).toBe('invalid')
  })

  it('reports expired once the licence term is over, keeping the payload', () => {
    const v = verify(mint({ expiresAt: new Date(Date.now() - DAY_MS).toISOString() }))
    expect(v.status).toBe('expired')
    expect(v.payload).not.toBeNull()
    expect(v.daysUntilExpiry).toBeLessThanOrEqual(0)
  })

  it('reports stale when the token has not been refreshed within the ceiling', () => {
    const issuedAt = new Date(Date.now() - (LICENSE_TOKEN_MAX_AGE_DAYS + 1) * DAY_MS)
    const v = verify(mint({ issuedAt: issuedAt.toISOString() }))
    expect(v.status).toBe('stale')
    expect(v.ageDays).toBe(LICENSE_TOKEN_MAX_AGE_DAYS + 1)
  })

  it('is still valid on the last day inside the ceiling', () => {
    const issuedAt = new Date(Date.now() - (LICENSE_TOKEN_MAX_AGE_DAYS * DAY_MS - 60_000))
    expect(verify(mint({ issuedAt: issuedAt.toISOString() })).status).toBe('valid')
  })

  it('treats a token from the future as fresh rather than forged', () => {
    const issuedAt = new Date(Date.now() + 2 * DAY_MS)
    expect(verify(mint({ issuedAt: issuedAt.toISOString() })).status).toBe('valid')
  })

  it('expiry wins over staleness', () => {
    const v = verify(
      mint({
        issuedAt: new Date(Date.now() - 30 * DAY_MS).toISOString(),
        expiresAt: new Date(Date.now() - DAY_MS).toISOString(),
      })
    )
    expect(v.status).toBe('expired')
  })

  it('honours an explicit clock', () => {
    const token = mint()
    const later = new Date(Date.now() + (LICENSE_TOKEN_MAX_AGE_DAYS + 5) * DAY_MS)
    expect(verify(token, later).status).toBe('stale')
  })

  it('the production verifier does not accept a token from a key it does not embed', () => {
    expect(verifyLicenseToken(mint(), ORG).status).toBe('invalid')
  })
})
