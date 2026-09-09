import { createHash, createHmac, generateKeyPairSync, sign } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  publicRequestUrl,
  safeEqual,
  verifyTelnyxSignature,
  verifyTwilioSignature,
  verifyVonageJwt,
} from '@/lib/webhook-signatures'

describe('safeEqual', () => {
  it('compares strings of any length without throwing', () => {
    expect(safeEqual('abc', 'abc')).toBe(true)
    expect(safeEqual('abc', 'abd')).toBe(false)
    expect(safeEqual('abc', 'abcd')).toBe(false)
    expect(safeEqual('', '')).toBe(true)
  })
})

describe('publicRequestUrl', () => {
  it('keeps path and query while taking the origin from the request when nothing is configured', () => {
    const before = process.env.NEXT_PUBLIC_APP_URL
    delete process.env.NEXT_PUBLIC_APP_URL
    try {
      expect(publicRequestUrl('http://container:3000/api/webhooks/sms/twilio?org_secret=s')).toBe(
        'http://container:3000/api/webhooks/sms/twilio?org_secret=s'
      )
    } finally {
      if (before !== undefined) process.env.NEXT_PUBLIC_APP_URL = before
    }
  })

  it('replaces the origin with the configured public address', () => {
    const before = process.env.NEXT_PUBLIC_APP_URL
    process.env.NEXT_PUBLIC_APP_URL = 'https://app.example.com/'
    try {
      expect(publicRequestUrl('http://container:3000/api/webhooks/sms/twilio?org_secret=s')).toBe(
        'https://app.example.com/api/webhooks/sms/twilio?org_secret=s'
      )
    } finally {
      if (before === undefined) delete process.env.NEXT_PUBLIC_APP_URL
      else process.env.NEXT_PUBLIC_APP_URL = before
    }
  })
})

describe('verifyTwilioSignature', () => {
  const authToken = '12345'
  const url = 'https://app.example.com/api/webhooks/sms/twilio?org_secret=abc'
  const params = { To: '+15551234567', From: '+15557654321', Body: 'Hello there' }

  function expectedSignature(u: string, p: Record<string, string>, token = authToken) {
    const data = Object.keys(p)
      .sort()
      .reduce((acc, key) => acc + key + p[key], u)
    return createHmac('sha1', token).update(data).digest('base64')
  }

  it('accepts the signature Twilio would compute', () => {
    expect(
      verifyTwilioSignature({
        authToken,
        url,
        params,
        signature: expectedSignature(url, params),
      })
    ).toBe(true)
  })

  it('accepts the same form given as URLSearchParams', () => {
    expect(
      verifyTwilioSignature({
        authToken,
        url,
        params: new URLSearchParams(params),
        signature: expectedSignature(url, params),
      })
    ).toBe(true)
  })

  it('rejects a changed body, a changed URL, a wrong token and a missing header', () => {
    const good = expectedSignature(url, params)
    expect(
      verifyTwilioSignature({ authToken, url, params: { ...params, Body: 'Bye' }, signature: good })
    ).toBe(false)
    expect(verifyTwilioSignature({ authToken, url: `${url}&x=1`, params, signature: good })).toBe(
      false
    )
    expect(verifyTwilioSignature({ authToken: 'other', url, params, signature: good })).toBe(false)
    expect(verifyTwilioSignature({ authToken, url, params, signature: null })).toBe(false)
  })
})

describe('verifyTelnyxSignature', () => {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519')
  // Telnyx shows the key as base64 of the raw 32 bytes, not as PEM.
  const publicKeyBase64 = Buffer.from(
    (publicKey.export({ format: 'der', type: 'spki' }) as Buffer).subarray(-32)
  ).toString('base64')
  const rawBody = JSON.stringify({ data: { event_type: 'message.received' } })
  const now = 1_700_000_000_000
  const timestamp = String(Math.floor(now / 1000))

  function signed(ts: string, body: string): string {
    return sign(null, Buffer.from(`${ts}|${body}`), privateKey).toString('base64')
  }

  it('accepts a fresh delivery signed with the account key', () => {
    expect(
      verifyTelnyxSignature({
        publicKeyBase64,
        timestamp,
        rawBody,
        signatureBase64: signed(timestamp, rawBody),
        now,
      })
    ).toBe(true)
  })

  it('rejects a tampered body', () => {
    expect(
      verifyTelnyxSignature({
        publicKeyBase64,
        timestamp,
        rawBody: `${rawBody} `,
        signatureBase64: signed(timestamp, rawBody),
        now,
      })
    ).toBe(false)
  })

  it('rejects a stale timestamp even when the signature is genuine', () => {
    const old = String(Math.floor(now / 1000) - 600)
    expect(
      verifyTelnyxSignature({
        publicKeyBase64,
        timestamp: old,
        rawBody,
        signatureBase64: signed(old, rawBody),
        now,
      })
    ).toBe(false)
  })

  it('rejects another key, a missing header and a malformed key', () => {
    const other = generateKeyPairSync('ed25519')
    const otherBase64 = Buffer.from(
      (other.publicKey.export({ format: 'der', type: 'spki' }) as Buffer).subarray(-32)
    ).toString('base64')
    const signature = signed(timestamp, rawBody)
    expect(
      verifyTelnyxSignature({
        publicKeyBase64: otherBase64,
        timestamp,
        rawBody,
        signatureBase64: signature,
        now,
      })
    ).toBe(false)
    expect(
      verifyTelnyxSignature({ publicKeyBase64, timestamp, rawBody, signatureBase64: null, now })
    ).toBe(false)
    expect(
      verifyTelnyxSignature({
        publicKeyBase64: 'not-a-key',
        timestamp,
        rawBody,
        signatureBase64: signature,
        now,
      })
    ).toBe(false)
  })
})

describe('verifyVonageJwt', () => {
  const secret = 'signature-secret'
  const rawBody = JSON.stringify({ msisdn: '4790000000', text: 'hi' })
  const now = 1_700_000_000_000

  function jwt(payload: Record<string, unknown>, key = secret, alg = 'HS256'): string {
    const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url')
    const head = encode({ alg, typ: 'JWT' })
    const body = encode(payload)
    const signature = createHmac('sha256', key).update(`${head}.${body}`).digest('base64url')
    return `${head}.${body}.${signature}`
  }

  const bodyHash = createHash('sha256').update(rawBody).digest('hex')

  it('accepts a token signed with the secret whose hash matches the body', () => {
    const token = jwt({ iat: now / 1000, iss: 'Vonage', payload_hash: bodyHash })
    expect(verifyVonageJwt({ token, secret, rawBody, now })).toBe(true)
  })

  it('rejects a token signed with another secret', () => {
    const token = jwt({ iat: now / 1000, payload_hash: bodyHash }, 'wrong')
    expect(verifyVonageJwt({ token, secret, rawBody, now })).toBe(false)
  })

  it('rejects a body that does not match payload_hash', () => {
    const token = jwt({ iat: now / 1000, payload_hash: bodyHash })
    expect(verifyVonageJwt({ token, secret, rawBody: `${rawBody} `, now })).toBe(false)
  })

  it('rejects an expired token, a non-HS256 header and a missing token', () => {
    const expired = jwt({ exp: now / 1000 - 1, payload_hash: bodyHash })
    expect(verifyVonageJwt({ token: expired, secret, rawBody, now })).toBe(false)
    const none = jwt({ payload_hash: bodyHash }, secret, 'none')
    expect(verifyVonageJwt({ token: none, secret, rawBody, now })).toBe(false)
    expect(verifyVonageJwt({ token: null, secret, rawBody, now })).toBe(false)
    expect(verifyVonageJwt({ token: 'a.b', secret, rawBody, now })).toBe(false)
  })
})
