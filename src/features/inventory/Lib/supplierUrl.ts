import { z } from 'zod'

/** What the server accepts as a supplier link. The part form checks with the same rule. */
export const supplierUrlSchema = z.string().url()

// A host with at least one dot (letters in any script), an optional port, then
// anything after a slash, question mark or hash. Plain words never match.
const BARE_HOST = /^[\p{L}\p{N}-]+(\.[\p{L}\p{N}-]+)+(:\d+)?([/?#].*)?$/u

// A scheme at the very start, such as `https://`. A link inside the query string does not count.
const HAS_SCHEME = /^[a-z][a-z\d+.-]*:\/\//i

/**
 * A supplier link as a person types it. People type `www.supplier.com/part/1`
 * the way they would into a browser's address bar, so a link that starts with
 * a host gets `https://` in front. Anything with a scheme already, and anything
 * that is not a host, is only trimmed.
 */
export function normalizeSupplierUrl(value: string): string {
  const trimmed = value.trim()
  if (!trimmed || HAS_SCHEME.test(trimmed)) return trimmed
  return BARE_HOST.test(trimmed) ? `https://${trimmed}` : trimmed
}

/** Whether the server will take this (already normalised) supplier link. */
export function isSupplierUrl(value: string): boolean {
  return supplierUrlSchema.safeParse(value).success
}
