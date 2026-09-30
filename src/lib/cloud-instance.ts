import type { KeyObject } from 'node:crypto'
import { embeddedKeys, signedPayload } from './license/signature'

/**
 * Whether this app is the Torqvoice cloud instance.
 *
 * `TORQVOICE_MODE=cloud` alone is a line anyone can put in an environment
 * file, and cloud mode changes what a workshop gets: branding comes off on
 * every plan, plans follow the `subscription` table (which on a self-hosted
 * install is the operator's to write), and the one-workshop limit no longer
 * counts the install. So cloud mode also needs a token torqvoice.com signed
 * for this app's public URL, in TORQVOICE_CLOUD_TOKEN. Without one the app
 * runs as a self-hosted install, and says so in the log.
 *
 * The token is minted by hand on torqvoice.com (`scripts/mint-cloud-token.mjs`)
 * with the key that signs licence tokens, under its own prefix so a licence
 * can never pass for it. The production token has no expiry: nothing refreshes
 * it, and an expiry would only schedule an outage. Revoking one means rotating
 * the signing key. Throwaway tokens, like the one the e2e run mints for
 * 127.0.0.1, carry `expiresAt` so a copy that escapes the run is soon dead.
 *
 * Checked offline against the embedded public key, so the answer never waits
 * on the network and a torqvoice.com outage changes nothing.
 */

export const CLOUD_TOKEN_PREFIX = 'tvc1'

export type CloudTokenPayload = {
  v: 1
  /** the public origin this token was minted for, e.g. https://app.torqvoice.com */
  origin: string
  /** ISO 8601, when torqvoice.com signed this token */
  issuedAt: string
  /** ISO 8601; only throwaway tokens have one */
  expiresAt?: string
}

export type CloudTokenStatus =
  | 'missing'
  /** malformed, bad signature, or not a cloud token */
  | 'invalid'
  /** signature fine, minted for another URL */
  | 'wrong-origin'
  /** signature fine, past its expiresAt */
  | 'expired'
  | 'valid'

function originOf(url: string | null | undefined): string | null {
  if (!url) return null
  try {
    return new URL(url).origin
  } catch {
    return null
  }
}

/** Verifies with an explicit key set. Tests use this with a throwaway pair. */
export function verifyCloudTokenWith(
  keys: readonly KeyObject[],
  token: string | null | undefined,
  appUrl: string | null | undefined,
  now: Date = new Date()
): CloudTokenStatus {
  if (!token?.trim()) return 'missing'

  const p = signedPayload(keys, token, CLOUD_TOKEN_PREFIX)
  if (!p || p.v !== 1 || typeof p.origin !== 'string' || typeof p.issuedAt !== 'string') {
    return 'invalid'
  }

  if (p.expiresAt !== undefined) {
    if (typeof p.expiresAt !== 'string' || Number.isNaN(Date.parse(p.expiresAt))) return 'invalid'
  }

  const minted = originOf(p.origin)
  if (!minted) return 'invalid'
  if (minted !== originOf(appUrl)) return 'wrong-origin'
  if (p.expiresAt && Date.parse(p.expiresAt) <= now.getTime()) return 'expired'
  return 'valid'
}

let memo: { key: string; cloud: boolean } | null = null

export function isCloudInstance(): boolean {
  if (process.env.TORQVOICE_MODE !== 'cloud') return false

  const token = process.env.TORQVOICE_CLOUD_TOKEN
  const appUrl = process.env.NEXT_PUBLIC_APP_URL
  // Keyed on the inputs rather than computed once, so a test that changes
  // the environment gets a fresh answer.
  const key = `${token}|${appUrl}`
  if (memo?.key === key) return memo.cloud

  const status = verifyCloudTokenWith(embeddedKeys(), token, appUrl)
  if (status !== 'valid') {
    const reason =
      status === 'missing'
        ? 'TORQVOICE_CLOUD_TOKEN is not set'
        : status === 'wrong-origin'
          ? `TORQVOICE_CLOUD_TOKEN was minted for another URL than ${appUrl}`
          : status === 'expired'
            ? 'TORQVOICE_CLOUD_TOKEN has expired'
            : 'TORQVOICE_CLOUD_TOKEN is not a valid cloud token'
    console.error(
      `[cloud] TORQVOICE_MODE=cloud is ignored: ${reason}. Running as a self-hosted install.`
    )
  }
  memo = { key, cloud: status === 'valid' }
  return memo.cloud
}
