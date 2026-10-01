/** Stable hash of a body, so an unchanged record is not pushed twice. */
export function checksumOf(body: unknown): string {
  const input = JSON.stringify(body)
  let h = 2166136261
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i)
    h = Math.imul(h, 16777619) >>> 0
  }
  return h.toString(16)
}
