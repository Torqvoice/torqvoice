/**
 * Public halves of the Ed25519 keys torqvoice.com signs licence tokens with.
 * Single-line base64 SPKI DER. The private halves never leave torqvoice.com.
 *
 * More than one entry is only ever for rotation: add the new key here and
 * ship it, then switch the signer, then drop the old key a release later.
 *
 * This is deliberately a constant and not an environment variable. An env
 * override would let an operator point the app at a key they hold, which is
 * the exact bypass the signature exists to close.
 */
export const LICENSE_PUBLIC_KEYS: readonly string[] = [
  'MCowBQYDK2VwAyEA9hxqMSyYdCUUmqab9WuDBzTSiO1raX97rr6M21Xk/RE=',
]
