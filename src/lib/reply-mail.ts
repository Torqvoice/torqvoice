import { randomBytes } from 'node:crypto'
import { isCloudInstance } from './cloud-instance'

/**
 * The reply address customer mail carries on the cloud instance.
 *
 * A workshop that sends through the platform's address gets its replies back
 * through `reply-<token>@<reply domain>`: the domain's mail is received by
 * the platform and filed into that workshop's inbox. The token is the only
 * thing that says which workshop a mail is for, so it is random and private
 * to the workshop, never its id.
 *
 * None of this exists on a self-hosted install. The reply domain is set only
 * on the cloud deployment, and even there it counts only once the cloud
 * token has been verified, so a copied environment file enables nothing.
 */

const TOKEN_ALPHABET = 'abcdefghijklmnopqrstuvwxyz234567'
/** 128 bits of randomness, as 26 base32 characters: lower case, no padding. */
export const REPLY_TOKEN_LENGTH = 26

/** `reply-<token>`, with an optional `+tag` a mail client may append. */
const LOCAL_PART = /^reply-([a-z2-7]{26})(?:\+[^@]*)?$/

export interface InboundMailConfig {
  /** The domain whose mail is received, e.g. `reply.torqvoice.com`. */
  domain: string
  /** The bucket the receipt rule writes mail into. */
  bucket: string
  /** The region of the receiving endpoint, the bucket and the topic. */
  region: string
  /** The topic whose notifications the webhook accepts, and no other. */
  topicArn: string
}

function env(name: string): string | undefined {
  const value = process.env[name]?.trim()
  return value ? value : undefined
}

/**
 * The reply domain, when customer mail should carry a reply address at all:
 * the cloud instance with `INBOUND_MAIL_DOMAIN` set.
 */
export function replyMailDomain(): string | null {
  if (!isCloudInstance()) return null
  const domain = env('INBOUND_MAIL_DOMAIN')?.toLowerCase()
  return domain && /^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain) ? domain : null
}

export function replyMailEnabled(): boolean {
  return replyMailDomain() !== null
}

/**
 * Everything the receiving webhook needs, or null with what is missing. The
 * webhook refuses to run on half a setup rather than guessing at the rest.
 */
export function inboundMailConfig():
  | { ok: true; config: InboundMailConfig }
  | { ok: false; missing: string[] } {
  const domain = replyMailDomain()
  const bucket = env('INBOUND_MAIL_BUCKET')
  const region = env('INBOUND_MAIL_REGION')
  const topicArn = env('INBOUND_MAIL_TOPIC_ARN')

  const missing: string[] = []
  if (!domain) missing.push('INBOUND_MAIL_DOMAIN')
  if (!bucket) missing.push('INBOUND_MAIL_BUCKET')
  if (!region || !/^[a-z]{2}(-[a-z]+)+-\d$/.test(region)) missing.push('INBOUND_MAIL_REGION')
  if (!topicArn || !topicArn.startsWith('arn:aws:sns:')) missing.push('INBOUND_MAIL_TOPIC_ARN')

  if (missing.length > 0 || !domain || !bucket || !region || !topicArn) {
    return { ok: false, missing }
  }
  return { ok: true, config: { domain, bucket, region, topicArn } }
}

/** A fresh reply token: 26 lower-case base32 characters from 16 random bytes. */
export function newReplyMailToken(): string {
  const bytes = randomBytes(16)
  let bits = 0
  let value = 0
  let out = ''
  for (const byte of bytes) {
    value = (value << 8) | byte
    bits += 8
    while (bits >= 5) {
      out += TOKEN_ALPHABET[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
  }
  if (bits > 0) out += TOKEN_ALPHABET[(value << (5 - bits)) & 31]
  return out.slice(0, REPLY_TOKEN_LENGTH)
}

export function isReplyMailToken(value: unknown): value is string {
  return typeof value === 'string' && /^[a-z2-7]{26}$/.test(value)
}

/** The address a workshop's customers answer to. */
export function replyMailAddress(token: string, domain: string): string {
  return `reply-${token}@${domain}`
}

/**
 * The token in a recipient address of ours, or null for any other address.
 * Case does not matter in either half; a `+tag` after the token is allowed
 * and ignored, since some clients add one when replying.
 */
export function parseReplyMailAddress(address: string, domain: string): string | null {
  const at = address.lastIndexOf('@')
  if (at <= 0) return null
  const local = address.slice(0, at).trim().toLowerCase()
  const host = address
    .slice(at + 1)
    .trim()
    .toLowerCase()
  if (host !== domain.toLowerCase()) return null
  const match = LOCAL_PART.exec(local)
  return match ? match[1] : null
}

/**
 * The first of a mail's recipients that is one of ours. SES lists every
 * envelope recipient on the receiving domain; a mail sent to two workshops at
 * once is filed with the first, which is not something a customer does.
 */
export function replyTokenFromRecipients(recipients: readonly string[], domain: string) {
  for (const recipient of recipients) {
    const token = parseReplyMailAddress(recipient, domain)
    if (token) return token
  }
  return null
}

/**
 * A Message-ID for a mail we send, on the reply domain so a reply's
 * In-Reply-To names something of ours. Returned without angle brackets, as
 * it is stored; the mailer adds them on the wire.
 */
export function newMailMessageId(domain: string): string {
  return `${newReplyMailToken()}.${Date.now().toString(36)}@${domain}`
}

/** A Message-ID header value as stored: trimmed, without its angle brackets. */
export function normalizeMessageId(value: string | null | undefined): string | null {
  if (!value) return null
  const trimmed = value.trim().replace(/^<|>$/g, '').trim()
  return trimmed && trimmed.length <= 998 ? trimmed : null
}

/** Every id in a References header, oldest first, as stored. */
export function parseReferences(value: string | string[] | null | undefined): string[] {
  const raw = Array.isArray(value) ? value.join(' ') : (value ?? '')
  const ids: string[] = []
  for (const match of raw.matchAll(/<([^<>\s]+)>/g)) {
    const id = normalizeMessageId(match[1])
    if (id && !ids.includes(id)) ids.push(id)
  }
  return ids
}
