/**
 * Credentials at rest.
 *
 * Third-party tokens are sealed with AES-256-GCM before they touch the
 * database. The key comes from INTEGRATIONS_ENCRYPTION_KEY (32 bytes, hex).
 * When that is unset the key is derived from BETTER_AUTH_SECRET so an
 * existing self-hosted install keeps working, with a warning once, since
 * the two secrets then share a fate.
 */

import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto'

const VERSION = 'v1'
let cachedKey: Buffer | null = null
let warned = false

function loadKey(): Buffer {
  if (cachedKey) return cachedKey
  const explicit = process.env.INTEGRATIONS_ENCRYPTION_KEY?.trim()
  if (explicit) {
    if (!/^[0-9a-f]{64}$/i.test(explicit)) {
      throw new Error(
        'INTEGRATIONS_ENCRYPTION_KEY must be 32 bytes as 64 hex characters (openssl rand -hex 32)'
      )
    }
    cachedKey = Buffer.from(explicit, 'hex')
    return cachedKey
  }
  const authSecret = process.env.BETTER_AUTH_SECRET
  if (!authSecret) {
    throw new Error(
      'Set INTEGRATIONS_ENCRYPTION_KEY (openssl rand -hex 32) before connecting integrations'
    )
  }
  if (!warned) {
    warned = true
    console.warn(
      '[integrations] INTEGRATIONS_ENCRYPTION_KEY is not set; deriving the vault key from BETTER_AUTH_SECRET. Set a dedicated key in production.'
    )
  }
  cachedKey = Buffer.from(hkdfSync('sha256', authSecret, 'torqvoice', 'integrations-vault', 32))
  return cachedKey
}

/** Only for tests: forget the cached key so a changed environment is picked up. */
export function resetVaultKeyForTests(): void {
  cachedKey = null
  warned = false
}

export function sealCredentials(value: Record<string, unknown>): string {
  const key = loadKey()
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const plaintext = Buffer.from(JSON.stringify(value), 'utf8')
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()])
  const tag = cipher.getAuthTag()
  return [
    VERSION,
    iv.toString('base64url'),
    tag.toString('base64url'),
    encrypted.toString('base64url'),
  ].join('.')
}

export function openCredentials(sealed: string | null | undefined): Record<string, unknown> {
  if (!sealed) return {}
  const [version, ivB64, tagB64, dataB64] = sealed.split('.')
  if (version !== VERSION || !ivB64 || !tagB64 || !dataB64) {
    throw new Error('Unrecognised credential format')
  }
  const key = loadKey()
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivB64, 'base64url'))
  decipher.setAuthTag(Buffer.from(tagB64, 'base64url'))
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(dataB64, 'base64url')),
    decipher.final(),
  ])
  return JSON.parse(plaintext.toString('utf8')) as Record<string, unknown>
}
