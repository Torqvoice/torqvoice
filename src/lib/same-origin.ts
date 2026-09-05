/**
 * Whether a state-changing request came from another site.
 *
 * The cookie-authenticated API under /api/protected is called by our own
 * pages, so a write arriving from someone else's origin is never legitimate.
 * SameSite=Lax cookies already keep a cross-site POST from carrying the
 * session, so this is a second wall, and one a security scanner can see.
 *
 * Reads are left alone, as are requests that carry neither header: native
 * clients and server-to-server callers send no Origin, and they are not the
 * problem a cross-site request forgery poses.
 */
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

export function isCrossSiteWrite(input: {
  method: string
  header: (name: string) => string | null
}): boolean {
  if (SAFE_METHODS.has(input.method.toUpperCase())) return false
  const site = input.header('sec-fetch-site')
  if (site === 'cross-site') return true
  const origin = input.header('origin')
  if (!origin || origin === 'null') return origin === 'null'
  const host = input.header('x-forwarded-host') ?? input.header('host')
  if (!host) return false
  try {
    return new URL(origin).host.toLowerCase() !== host.split(',')[0].trim().toLowerCase()
  } catch {
    return true
  }
}
