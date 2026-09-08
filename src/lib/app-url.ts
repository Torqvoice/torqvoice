/**
 * The address this installation answers on, for links built on the server.
 *
 * A link the browser builds can use window.location.origin and is always
 * right. A link an email or a PDF builds has no browser to ask, so it has to
 * be told: NEXT_PUBLIC_APP_URL is that address on a self-hosted install, and
 * VERCEL_URL stands in on a preview deployment, which has no fixed hostname.
 *
 * Written down once because the expression is easy to get wrong: `a || b ? c
 * : d` reads as `(a || b) ? c : d`, which tests one address and then prints
 * the other. That typo sent every emailed share link out as
 * "https://undefined/share/..." on installations that are not on Vercel.
 */
export function getAppBaseUrl(): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim()
  if (configured) return configured.replace(/\/+$/, '')
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`
  return 'http://localhost:3000'
}
