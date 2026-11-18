import { createVerify } from 'node:crypto'

/**
 * Proof that an HTTP delivery came from Amazon SNS.
 *
 * SNS signs every delivery with a key whose certificate it publishes at a URL
 * named in the message. The check is three parts, all here with no I/O: the
 * certificate URL must be SNS's own (anyone can host a certificate), the
 * canonical string is rebuilt from the message's fields in the order SNS
 * signs them, and the signature is verified against the certificate. The
 * caller fetches the certificate, since that is the only network step.
 */

export interface SnsEnvelope {
  Type: string
  MessageId: string
  TopicArn: string
  Message: string
  Timestamp: string
  SignatureVersion: string
  Signature: string
  SigningCertURL: string
  Subject?: string
  Token?: string
  SubscribeURL?: string
  UnsubscribeURL?: string
}

const STRING = (value: unknown): value is string => typeof value === 'string' && value.length > 0

/** The envelope, when the body is one; null for anything else. */
export function parseSnsEnvelope(body: unknown): SnsEnvelope | null {
  if (!body || typeof body !== 'object') return null
  const raw = body as Record<string, unknown>
  const required = [
    'Type',
    'MessageId',
    'TopicArn',
    'Timestamp',
    'SignatureVersion',
    'Signature',
    'SigningCertURL',
  ] as const
  for (const key of required) if (!STRING(raw[key])) return null
  if (typeof raw.Message !== 'string') return null
  for (const key of ['Subject', 'Token', 'SubscribeURL', 'UnsubscribeURL'] as const) {
    if (raw[key] !== undefined && typeof raw[key] !== 'string') return null
  }
  return raw as unknown as SnsEnvelope
}

/**
 * Whether the certificate URL is one SNS would publish: HTTPS, on the SNS
 * host of the given region, naming a `.pem` file. Pinned to the region the
 * topic lives in rather than any AWS region, so a certificate from a topic
 * elsewhere does not pass either.
 */
export function isTrustedSigningCertUrl(url: string, region: string): boolean {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return false
  }
  if (parsed.protocol !== 'https:') return false
  if (parsed.username || parsed.password || parsed.port) return false
  const host = parsed.hostname.toLowerCase()
  if (host !== `sns.${region}.amazonaws.com`) return false
  return /^\/[A-Za-z0-9._-]+\.pem$/.test(parsed.pathname)
}

/**
 * The string SNS signed, rebuilt from the envelope. Notifications sign
 * Message, MessageId, Subject (when present), Timestamp, TopicArn and Type;
 * subscription messages sign Message, MessageId, SubscribeURL, Timestamp,
 * Token, TopicArn and Type. Each field is its name, a newline, its value and
 * a newline, in that order.
 */
export function snsStringToSign(envelope: SnsEnvelope): string | null {
  const fields: Array<[string, string | undefined]> =
    envelope.Type === 'Notification'
      ? [
          ['Message', envelope.Message],
          ['MessageId', envelope.MessageId],
          ...(envelope.Subject !== undefined
            ? ([['Subject', envelope.Subject]] as Array<[string, string]>)
            : []),
          ['Timestamp', envelope.Timestamp],
          ['TopicArn', envelope.TopicArn],
          ['Type', envelope.Type],
        ]
      : envelope.Type === 'SubscriptionConfirmation' || envelope.Type === 'UnsubscribeConfirmation'
        ? [
            ['Message', envelope.Message],
            ['MessageId', envelope.MessageId],
            ['SubscribeURL', envelope.SubscribeURL],
            ['Timestamp', envelope.Timestamp],
            ['Token', envelope.Token],
            ['TopicArn', envelope.TopicArn],
            ['Type', envelope.Type],
          ]
        : []
  if (fields.length === 0) return null

  let out = ''
  for (const [name, value] of fields) {
    if (value === undefined) return null
    out += `${name}\n${value}\n`
  }
  return out
}

/**
 * Whether the signature is the certificate's over the canonical string.
 * Signature version 1 is SHA1 with RSA, version 2 SHA256 with RSA; anything
 * else is refused rather than guessed at.
 */
export function verifySnsSignature(envelope: SnsEnvelope, certificatePem: string): boolean {
  const algorithm =
    envelope.SignatureVersion === '1'
      ? 'RSA-SHA1'
      : envelope.SignatureVersion === '2'
        ? 'RSA-SHA256'
        : null
  if (!algorithm) return false

  const signed = snsStringToSign(envelope)
  if (!signed) return false

  let signature: Buffer
  try {
    signature = Buffer.from(envelope.Signature, 'base64')
  } catch {
    return false
  }
  if (signature.length === 0) return false

  try {
    const verifier = createVerify(algorithm)
    verifier.update(signed, 'utf8')
    verifier.end()
    return verifier.verify(certificatePem, signature)
  } catch {
    return false
  }
}
