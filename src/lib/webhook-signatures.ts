/**
 * Proof that an inbound webhook came from the vendor it claims to.
 *
 * The secret in a webhook URL says which workshop a call is for; it does not
 * say who made the call, since anyone who has seen the URL can replay it.
 * Each vendor signs its deliveries in its own way, and these are those
 * schemes written once, with no I/O, so a route can check a delivery before
 * it reads anything out of it.
 */

import {
  createHash,
  createHmac,
  createPublicKey,
  timingSafeEqual,
  verify as verifySignature,
} from 'node:crypto'
import { getAppBaseUrl } from './app-url'

/**
 * Equality that takes the same time whether the strings differ in the first
 * byte or the last. Both sides are hashed first so lengths never leak either.
 */
export function safeEqual(a: string, b: string): boolean {
  const left = createHash('sha256').update(a, 'utf8').digest()
  const right = createHash('sha256').update(b, 'utf8').digest()
  return timingSafeEqual(left, right)
}

/**
 * The URL a vendor was given for this request.
 *
 * Twilio signs the URL as registered in its console. Behind a proxy the host
 * that reaches Next is the container's, so the configured public address
 * stands in for the origin while path and query are taken from the request.
 */
export function publicRequestUrl(requestUrl: string): string {
  const url = new URL(requestUrl)
  return `${getAppBaseUrl(url.origin)}${url.pathname}${url.search}`
}

export interface TwilioSignatureInput {
  authToken: string
  /** The full public URL, query string included. */
  url: string
  /** The POST form fields. Twilio signs the URL plus every field, sorted by name. */
  params: URLSearchParams | Record<string, string | string[]>
  /** The X-Twilio-Signature header, or null when it was not sent. */
  signature: string | null | undefined
}

function paramEntries(params: TwilioSignatureInput['params']): Array<[string, string[]]> {
  const grouped = new Map<string, string[]>()
  if (params instanceof URLSearchParams) {
    for (const [key, value] of params) {
      grouped.set(key, [...(grouped.get(key) ?? []), value])
    }
  } else {
    for (const [key, value] of Object.entries(params)) {
      grouped.set(key, Array.isArray(value) ? [...value] : [value])
    }
  }
  return [...grouped.entries()]
    .map(([key, values]) => [key, values.sort()] as [string, string[]])
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
}

/** The HMAC-SHA1 Twilio puts in X-Twilio-Signature, for tests and for checking. */
export function twilioSignature(
  authToken: string,
  url: string,
  params: TwilioSignatureInput['params']
): string {
  let data = url
  for (const [key, values] of paramEntries(params)) {
    for (const value of values) data += key + value
  }
  return createHmac('sha1', authToken).update(data, 'utf8').digest('base64')
}

export function verifyTwilioSignature(input: TwilioSignatureInput): boolean {
  if (!input.signature || !input.authToken) return false
  return safeEqual(twilioSignature(input.authToken, input.url, input.params), input.signature)
}

export interface TelnyxSignatureInput {
  /** The account's public key as shown in the Telnyx portal: base64 of 32 raw bytes. */
  publicKeyBase64: string
  /** The telnyx-timestamp header: unix seconds. */
  timestamp: string | null | undefined
  rawBody: string
  /** The telnyx-signature-ed25519 header. */
  signatureBase64: string | null | undefined
  maxAgeSeconds?: number
  /** Milliseconds since the epoch, for tests. */
  now?: number
}

/** DER prefix that turns raw ed25519 public key bytes into SubjectPublicKeyInfo. */
const ED25519_SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex')

export function verifyTelnyxSignature(input: TelnyxSignatureInput): boolean {
  const { timestamp, signatureBase64, maxAgeSeconds = 300, now = Date.now() } = input
  if (!timestamp || !signatureBase64 || !input.publicKeyBase64) return false

  const issued = Number(timestamp)
  if (!Number.isFinite(issued)) return false
  if (Math.abs(now / 1000 - issued) > maxAgeSeconds) return false

  try {
    const raw = Buffer.from(input.publicKeyBase64.trim(), 'base64')
    if (raw.length !== 32) return false
    const publicKey = createPublicKey({
      key: Buffer.concat([ED25519_SPKI_PREFIX, raw]),
      format: 'der',
      type: 'spki',
    })
    const signature = Buffer.from(signatureBase64, 'base64')
    if (signature.length !== 64) return false
    const message = Buffer.from(`${timestamp}|${input.rawBody}`, 'utf8')
    return verifySignature(null, message, publicKey, signature)
  } catch {
    return false
  }
}

export interface VonageJwtInput {
  /** The bearer token from the Authorization header. */
  token: string | null | undefined
  /** The account's signature secret. */
  secret: string
  rawBody: string
  /** Milliseconds since the epoch, for tests. */
  now?: number
}

function decodeJwtPart(part: string): unknown {
  return JSON.parse(Buffer.from(part, 'base64url').toString('utf8'))
}

/**
 * Vonage signs webhooks with an HS256 JWT over the account's signature
 * secret. The token binds the body through `payload_hash`, the SHA-256 of the
 * exact bytes delivered, so a valid token cannot be reused on another body.
 */
export function verifyVonageJwt(input: VonageJwtInput): boolean {
  const { token, secret, rawBody, now = Date.now() } = input
  if (!token || !secret) return false

  const parts = token.trim().split('.')
  if (parts.length !== 3) return false
  const [encodedHeader, encodedPayload, encodedSignature] = parts

  try {
    const header = decodeJwtPart(encodedHeader) as { alg?: unknown }
    if (header?.alg !== 'HS256') return false

    const expected = createHmac('sha256', secret)
      .update(`${encodedHeader}.${encodedPayload}`, 'utf8')
      .digest('base64url')
    if (!safeEqual(expected, encodedSignature)) return false

    const payload = decodeJwtPart(encodedPayload) as {
      exp?: unknown
      payload_hash?: unknown
    }
    if (typeof payload.exp === 'number' && payload.exp * 1000 <= now) return false

    if (typeof payload.payload_hash === 'string') {
      const bodyHash = createHash('sha256').update(rawBody, 'utf8').digest('hex')
      if (!safeEqual(bodyHash, payload.payload_hash.toLowerCase())) return false
    }
    return true
  } catch {
    return false
  }
}

const warned = new Set<string>()

/**
 * Logs a message once per key for the life of the process. For a connection
 * that lacks the credential its vendor signs with: worth saying, not worth
 * saying on every delivery.
 */
export function warnOnce(key: string, message: string): void {
  if (warned.has(key)) return
  warned.add(key)
  console.warn(message)
}
