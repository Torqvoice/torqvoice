import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  openCredentials,
  resetVaultKeyForTests,
  sealCredentials,
} from '@/features/integrations/Lib/vault'

/**
 * Third-party tokens never sit in the database in the clear. The vault seals
 * them with a dedicated key, or, on an install that has not set one, a key
 * derived from the auth secret so nothing breaks silently.
 */
describe('integration vault', () => {
  const env = { ...process.env }
  beforeEach(() => {
    resetVaultKeyForTests()
    process.env.INTEGRATIONS_ENCRYPTION_KEY = 'a'.repeat(64)
    process.env.BETTER_AUTH_SECRET = 'auth-secret'
  })
  afterEach(() => {
    process.env = { ...env }
    resetVaultKeyForTests()
  })

  it('round-trips credentials and leaves nothing readable in the sealed string', () => {
    const sealed = sealCredentials({ accessToken: 'ya29.secret', refreshToken: '1//refresh' })
    expect(sealed.startsWith('v1.')).toBe(true)
    expect(sealed).not.toContain('secret')
    expect(sealed).not.toContain('refresh')
    expect(openCredentials(sealed)).toEqual({
      accessToken: 'ya29.secret',
      refreshToken: '1//refresh',
    })
  })

  it('produces a different ciphertext every time', () => {
    const a = sealCredentials({ token: 'x' })
    const b = sealCredentials({ token: 'x' })
    expect(a).not.toBe(b)
    expect(openCredentials(a)).toEqual(openCredentials(b))
  })

  it('refuses tampered data and a different key', () => {
    const sealed = sealCredentials({ token: 'x' })
    // One character in the middle, always to a different one: the tail can be
    // padding, or already read "AA", and then nothing was tampered with.
    const middle = Math.floor(sealed.length / 2)
    const swapped = sealed[middle] === 'A' ? 'B' : 'A'
    const tampered = `${sealed.slice(0, middle)}${swapped}${sealed.slice(middle + 1)}`
    expect(() => openCredentials(tampered)).toThrow()
    resetVaultKeyForTests()
    process.env.INTEGRATIONS_ENCRYPTION_KEY = 'b'.repeat(64)
    expect(() => openCredentials(sealed)).toThrow()
  })

  it('treats an empty value as no credentials', () => {
    expect(openCredentials(null)).toEqual({})
    expect(openCredentials('')).toEqual({})
  })

  it('rejects a malformed key rather than silently using it', () => {
    resetVaultKeyForTests()
    process.env.INTEGRATIONS_ENCRYPTION_KEY = 'not-hex'
    expect(() => sealCredentials({ token: 'x' })).toThrow(/64 hex/)
  })

  it('falls back to a key derived from the auth secret', () => {
    resetVaultKeyForTests()
    process.env.INTEGRATIONS_ENCRYPTION_KEY = ''
    const sealed = sealCredentials({ token: 'x' })
    expect(openCredentials(sealed)).toEqual({ token: 'x' })
    // A different auth secret cannot open it.
    resetVaultKeyForTests()
    process.env.BETTER_AUTH_SECRET = 'other'
    expect(() => openCredentials(sealed)).toThrow()
  })
})
