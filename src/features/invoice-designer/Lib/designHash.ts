import { createHash } from 'node:crypto'

/**
 * JSON with object keys in a fixed order at every depth, so two values that
 * mean the same thing hash the same whatever order their keys were written
 * in. Undefined members are dropped the way JSON.stringify drops them.
 */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeys(value))
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys)
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      const member = (value as Record<string, unknown>)[key]
      if (member !== undefined) out[key] = sortKeys(member)
    }
    return out
  }
  return value
}

/** SHA-256 of the canonical JSON, hex. The identity of a snapshot. */
export function contentHash(value: unknown): string {
  return createHash('sha256').update(canonicalJson(value)).digest('hex')
}

/** SHA-256 of raw bytes, hex. The identity of a stored file. */
export function bytesHash(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex')
}
