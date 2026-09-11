import { createCipheriv, createHash, createHmac, hkdfSync, randomBytes } from 'node:crypto'

/**
 * Standing in for a messaging vendor.
 *
 * A connection's keys are sealed before they reach the database, and the
 * vault derives its key from `BETTER_AUTH_SECRET` when no dedicated one is
 * set, which is how the suite's server runs. Sealing here, the same way,
 * lets a spec plant a connection without a vendor to test the keys against;
 * `src/features/integrations/Lib/vault.ts` is the original.
 */

/** The secret the app server signs sessions with; the config's fallback when unset. */
const AUTH_SECRET = process.env.BETTER_AUTH_SECRET ?? 'k3Qb8vZ1hN7pXtR2yJm5Ls9CwD4gFa6UeH0iOoT+PbY='

export function sealCredentials(value: Record<string, unknown>): string {
  const key = Buffer.from(hkdfSync('sha256', AUTH_SECRET, 'torqvoice', 'integrations-vault', 32))
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const encrypted = Buffer.concat([
    cipher.update(Buffer.from(JSON.stringify(value), 'utf8')),
    cipher.final(),
  ])
  return [
    'v1',
    iv.toString('base64url'),
    cipher.getAuthTag().toString('base64url'),
    encrypted.toString('base64url'),
  ].join('.')
}

/** How the app files a connection's inbound URL secret, so the route can find the workshop. */
export function webhookSecretHash(secret: string): string {
  return createHash('sha256').update(secret).digest('hex')
}

/**
 * What Twilio puts in `X-Twilio-Signature`: HMAC-SHA1 over the URL as
 * registered in its console followed by every form field, sorted by name,
 * keyed with the account's auth token.
 */
export function twilioSignature(
  authToken: string,
  url: string,
  params: Record<string, string>
): string {
  let data = url
  for (const key of Object.keys(params).sort()) data += key + params[key]
  return createHmac('sha1', authToken).update(data, 'utf8').digest('base64')
}
