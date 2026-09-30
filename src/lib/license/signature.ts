import { createPublicKey, verify, type KeyObject } from 'node:crypto'
import { LICENSE_PUBLIC_KEYS } from './public-keys'

/**
 * The signature check shared by every token torqvoice.com signs.
 *
 * Format: `<prefix>.<base64url payload JSON>.<base64url Ed25519 signature>`.
 * The prefix names the kind of token, so one kind can never be read as
 * another: a white-label licence (`tvl1`) is not a cloud instance token
 * (`tvc1`), even though the same key signs both.
 */

let cachedKeys: KeyObject[] | null = null

export function embeddedKeys(): KeyObject[] {
  if (!cachedKeys) {
    cachedKeys = LICENSE_PUBLIC_KEYS.map((k) =>
      createPublicKey({ key: Buffer.from(k, 'base64'), format: 'der', type: 'spki' })
    )
  }
  return cachedKeys
}

/**
 * The decoded payload object when `token` carries `prefix` and one of `keys`
 * signed it; null otherwise. The caller still checks the payload's fields.
 */
export function signedPayload(
  keys: readonly KeyObject[],
  token: string,
  prefix: string
): Record<string, unknown> | null {
  const parts = token.trim().split('.')
  if (parts.length !== 3 || parts[0] !== prefix) return null
  const [, encoded, sig] = parts

  const signature = Buffer.from(sig, 'base64url')
  if (signature.length !== 64) return null

  const data = Buffer.from(encoded, 'utf8')
  const signed = keys.some((key) => {
    try {
      return verify(null, data, key, signature)
    } catch {
      return false
    }
  })
  if (!signed) return null

  try {
    const parsed: unknown = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'))
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null
  } catch {
    return null
  }
}
