import { describe, it, expect } from 'vitest'
import { generateKeyPairSync, sign } from 'node:crypto'
import {
  LICENSE_TOKEN_MAX_AGE_DAYS,
  isPerpetualLicenseToken,
  normalizeRegistrationNumber,
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
  verifyLicenseTokenWith([publicKey], token, ORG, { now })

const REG = 'NO 123 456 789 MVA'

function mintPerpetual(
  overrides: Partial<Record<string, unknown>> = {},
  key = privateKey,
  prefix = 'tvp1'
): string {
  const payload = {
    v: 1,
    lid: 'lic-p1',
    org: ORG,
    plan: 'white-label',
    maxOrganizations: 1,
    licensee: { name: 'Example Workshop AS', registrationNumber: REG, country: 'NO' },
    issuedAt: new Date().toISOString(),
    ...overrides,
  }
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const sig = sign(null, Buffer.from(encoded), key).toString('base64url')
  return `${prefix}.${encoded}.${sig}`
}

const verifyPerpetual = (
  token: string | null | undefined,
  registrationNumber: string | null | undefined = REG,
  now?: Date
) => verifyLicenseTokenWith([publicKey], token, ORG, { registrationNumber, now })

describe('verifyLicenseToken', () => {
  it('accepts a fresh token signed for this org', () => {
    const v = verify(mint())
    expect(v.status).toBe('valid')
    expect(v.kind).toBe('subscription')
    expect(v.payload?.plan).toBe('white-label')
    expect(v.expiresAt).toBe(v.payload && 'expiresAt' in v.payload ? v.payload.expiresAt : null)
    expect(v.maxOrganizations).toBeNull()
    expect(v.licensee).toBeNull()
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

  it('a subscription token ignores the registration number', () => {
    expect(
      verifyLicenseTokenWith([publicKey], mint(), ORG, { registrationNumber: 'x' }).status
    ).toBe('valid')
  })

  it('the production verifier does not accept a token from a key it does not embed', () => {
    expect(verifyLicenseToken(mint(), ORG).status).toBe('invalid')
    expect(verifyLicenseToken(mintPerpetual(), ORG, { registrationNumber: REG }).status).toBe(
      'invalid'
    )
  })
})

describe('perpetual (tvp1) tokens', () => {
  it('is recognised by its prefix', () => {
    expect(isPerpetualLicenseToken(mintPerpetual())).toBe(true)
    expect(isPerpetualLicenseToken(`  ${mintPerpetual()}`)).toBe(true)
    expect(isPerpetualLicenseToken(mint())).toBe(false)
    expect(isPerpetualLicenseToken('TQV-ABCD-1234')).toBe(false)
    expect(isPerpetualLicenseToken(null)).toBe(false)
  })

  it('verifies with no clock at all when the registration number matches', () => {
    const v = verifyPerpetual(mintPerpetual())
    expect(v.status).toBe('valid')
    expect(v.kind).toBe('perpetual')
    expect(v.expiresAt).toBeNull()
    expect(v.daysUntilExpiry).toBeNull()
    expect(v.maxOrganizations).toBe(1)
    expect(v.licensee?.name).toBe('Example Workshop AS')
    expect(v.licensee?.registrationNumber).toBe(REG)
  })

  it('never goes stale or expires', () => {
    const old = mintPerpetual({ issuedAt: new Date(Date.now() - 4000 * DAY_MS).toISOString() })
    const farFuture = new Date(Date.now() + 20000 * DAY_MS)
    const v = verifyPerpetual(old, REG, farFuture)
    expect(v.status).toBe('valid')
    expect(v.ageDays).toBeGreaterThan(LICENSE_TOKEN_MAX_AGE_DAYS)
  })

  it('matches registration numbers on letters and digits only', () => {
    expect(verifyPerpetual(mintPerpetual(), 'no123456789mva').status).toBe('valid')
    expect(verifyPerpetual(mintPerpetual(), 'NO-123.456.789 MVA').status).toBe('valid')
    expect(normalizeRegistrationNumber(' sc 123/456 ')).toBe('SC123456')
    expect(normalizeRegistrationNumber(null)).toBe('')
  })

  it('reports mismatch, keeping the licensee, when the workshop number differs or is empty', () => {
    const cases = [
      verifyPerpetual(mintPerpetual(), 'NO 123 456 780 MVA'),
      verifyPerpetual(mintPerpetual(), ''),
      verifyPerpetual(mintPerpetual(), null),
      verifyLicenseTokenWith([publicKey], mintPerpetual(), ORG, {}),
    ]
    for (const v of cases) {
      expect(v.status).toBe('mismatch')
      expect(v.kind).toBe('perpetual')
      expect(v.licensee?.registrationNumber).toBe(REG)
      expect(v.maxOrganizations).toBe(1)
    }
  })

  it('is bound to the organization it was minted for', () => {
    expect(verifyPerpetual(mintPerpetual({ org: 'someone-else' })).status).toBe('invalid')
  })

  it('rejects a perpetual payload signed with the subscription prefix and vice versa', () => {
    expect(verifyPerpetual(mintPerpetual({}, privateKey, 'tvl1')).status).toBe('invalid')
    const subscriptionShapeUnderPerpetualPrefix = mint({}, privateKey, 'tvp1')
    expect(verifyPerpetual(subscriptionShapeUnderPerpetualPrefix).status).toBe('invalid')
  })

  it('rejects other keys, edits and malformed payloads', () => {
    expect(verifyPerpetual(mintPerpetual({}, other.privateKey)).status).toBe('invalid')
    expect(verifyPerpetual(mintPerpetual({ maxOrganizations: 0 })).status).toBe('invalid')
    expect(verifyPerpetual(mintPerpetual({ maxOrganizations: '5' })).status).toBe('invalid')
    expect(verifyPerpetual(mintPerpetual({ maxOrganizations: 1.5 })).status).toBe('invalid')
    expect(verifyPerpetual(mintPerpetual({ licensee: undefined })).status).toBe('invalid')
    expect(
      verifyPerpetual(
        mintPerpetual({ licensee: { name: 'X', registrationNumber: '', country: 'NO' } })
      ).status
    ).toBe('invalid')
    expect(
      verifyPerpetual(
        mintPerpetual({ licensee: { name: 'X', registrationNumber: ' - ', country: 'NO' } }),
        ' - '
      ).status
    ).toBe('invalid')
    const token = mintPerpetual()
    const [prefix, , sig] = token.split('.')
    const forged = Buffer.from(
      JSON.stringify({
        v: 1,
        lid: 'lic-p1',
        org: ORG,
        plan: 'white-label',
        maxOrganizations: 999,
        licensee: { name: 'Example Workshop AS', registrationNumber: REG, country: 'NO' },
        issuedAt: new Date().toISOString(),
      })
    ).toString('base64url')
    expect(verifyPerpetual(`${prefix}.${forged}.${sig}`).status).toBe('invalid')
  })

  it('carries the workshop allowance the token names', () => {
    expect(verifyPerpetual(mintPerpetual({ maxOrganizations: 3 })).maxOrganizations).toBe(3)
  })
})
