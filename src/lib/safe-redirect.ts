/**
 * A redirect target taken from a query string, kept on this site.
 *
 * Sign-in, sign-up and onboarding carry the page a visitor was heading for in
 * a `redirect` parameter and push it once they are through. Anything that is
 * not a plain path on this origin is thrown away: an absolute URL would send
 * the freshly signed-in person to someone else's site, and browsers read a
 * leading `//` or `/\\` as protocol-relative, so those count as absolute too.
 */
export function safeRedirectPath(value: string | null | undefined, fallback = '/'): string {
  if (typeof value !== 'string') return fallback
  const path = value.trim()
  if (!/^\/(?![/\\])/.test(path)) return fallback
  // Control characters have no place in a path and are how header splitting starts.
  // biome-ignore lint/suspicious/noControlCharactersInRegex: that is the point of the check
  if (/[\u0000-\u001f\u007f]/.test(path)) return fallback
  return path
}
