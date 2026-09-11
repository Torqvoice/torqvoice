/**
 * Points the app server's calls to Google at the stand-in, and nothing else.
 *
 * Loaded into the app under test through NODE_OPTIONS=--import, and only in
 * the cloud-mode run: better-auth's Google provider has its endpoints written
 * into it, so there is no setting to change, and the app's own code is left
 * exactly as it ships. Every other request goes where it was going.
 *
 * Inert unless E2E_GOOGLE_STANDIN_URL is set.
 */

const standin = process.env.E2E_GOOGLE_STANDIN_URL?.replace(/\/+$/, '')

if (standin) {
  const rewrites = [
    ['https://oauth2.googleapis.com/token', `${standin}/token`],
    ['https://www.googleapis.com/oauth2/v3/certs', `${standin}/oauth2/v3/certs`],
  ]
  const original = globalThis.fetch

  globalThis.fetch = function fetchThroughStandin(input, init) {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input?.url
    for (const [from, to] of rewrites) {
      if (url?.startsWith(from)) {
        const target = to + url.slice(from.length)
        if (typeof input === 'string' || input instanceof URL) {
          return original.call(this, target, init)
        }
        return original.call(this, new Request(target, input), init)
      }
    }
    return original.call(this, input, init)
  }

  console.log(`[google-standin] Google token calls from this server go to ${standin}`)
}
