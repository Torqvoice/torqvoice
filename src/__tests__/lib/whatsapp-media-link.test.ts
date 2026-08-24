/**
 * Tests for the signed links that let a WhatsApp provider fetch our uploads.
 *
 * This is the one route into the uploads directory that is not behind auth,
 * so the token is the entire access control: it must name exactly one file,
 * stop working after an hour, and survive nothing that has been edited.
 */

import { describe, it, expect, beforeAll } from 'vitest'

beforeAll(() => {
  process.env.BETTER_AUTH_SECRET = 'test-secret-for-signing'
})

const { signWhatsappMediaToken, verifyWhatsappMediaToken } = await import(
  '@/lib/whatsapp/media-link'
)

const claim = {
  fileUrl: '/api/protected/files/org_1/vehicles/brake.jpg',
  organizationId: 'org_1',
}

describe('whatsapp media links', () => {
  it('round-trips the file it was minted for', () => {
    const token = signWhatsappMediaToken(claim)
    expect(verifyWhatsappMediaToken(token)).toEqual(claim)
  })

  it('rejects a token whose payload was swapped for another file', () => {
    const token = signWhatsappMediaToken(claim)
    const forgedPayload = Buffer.from(
      JSON.stringify({
        u: '/api/protected/files/org_2/vehicles/secret.jpg',
        o: 'org_2',
        e: Math.floor(Date.now() / 1000) + 600,
      })
    ).toString('base64url')
    const forged = `${forgedPayload}.${token.split('.').pop()}`
    expect(verifyWhatsappMediaToken(forged)).toBeNull()
  })

  it('rejects a token with a tampered signature', () => {
    const token = signWhatsappMediaToken(claim)
    const [payload] = token.split('.')
    expect(verifyWhatsappMediaToken(`${payload}.notasignature`)).toBeNull()
  })

  it('refuses a token that has expired', () => {
    const token = signWhatsappMediaToken(claim, -1)
    expect(verifyWhatsappMediaToken(token)).toBeNull()
  })

  it('refuses malformed input rather than throwing', () => {
    expect(verifyWhatsappMediaToken('')).toBeNull()
    expect(verifyWhatsappMediaToken('nodot')).toBeNull()
    expect(verifyWhatsappMediaToken('.')).toBeNull()
  })
})
