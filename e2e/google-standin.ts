import { randomBytes } from 'node:crypto'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'

/**
 * Google, as far as a sign-in needs it, with nobody's real account in it.
 *
 * Google sign-in cannot run from a test: it needs a real Google account, a
 * consent screen that is Google's to change, and a callback Google would only
 * send to an address it knows. So this plays the two parts of Google the app
 * touches in a sign-in. The browser is sent to its account chooser (a spec
 * routes `accounts.google.com` here), and the app's server exchanges the code
 * at its token endpoint (e2e/google-standin-preload.mjs points it here).
 *
 * The accounts it offers are the ones a spec registers, each with its own
 * `email_verified`, because what an account-linking rule does with an address
 * Google has not verified is the question most worth a test. The ID token it
 * returns is unsigned: in the redirect flow better-auth decodes the token it
 * receives straight from the token endpoint and does not check a signature.
 */

const PORT = Number(process.env.E2E_GOOGLE_PORT ?? 8027)

interface Account {
  sub: string
  email: string
  email_verified: boolean
  name: string
}

interface Grant {
  account: Account
  clientId: string
  redirectUri: string
}

const state = {
  accounts: [] as Account[],
  /** The query of every trip to the chooser, oldest first. */
  authorizeRequests: [] as Record<string, string>[],
  /** What the app sent to the token endpoint, oldest first. */
  tokenExchanges: [] as { clientId: string; code: string; hadVerifier: boolean }[],
}
const grants = new Map<string, Grant>()

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json' })
  res.end(JSON.stringify(body))
}

function redirect(res: ServerResponse, to: string): void {
  res.writeHead(303, { location: to })
  res.end()
}

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = []
  for await (const chunk of req) chunks.push(chunk as Buffer)
  return Buffer.concat(chunks).toString('utf8')
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)
}

function base64url(value: string): string {
  return Buffer.from(value).toString('base64url')
}

/** An ID token shaped like Google's. Unsigned; see the note at the top. */
function idToken(account: Account, clientId: string): string {
  const now = Math.floor(Date.now() / 1000)
  const header = base64url(JSON.stringify({ alg: 'RS256', kid: 'e2e-standin', typ: 'JWT' }))
  const payload = base64url(
    JSON.stringify({
      iss: 'https://accounts.google.com',
      azp: clientId,
      aud: clientId,
      sub: account.sub,
      email: account.email,
      email_verified: account.email_verified,
      name: account.name,
      iat: now,
      exp: now + 3600,
    })
  )
  return `${header}.${payload}.${base64url('e2e-standin-signature')}`
}

function chooser(query: URLSearchParams): string {
  const hidden = ['redirect_uri', 'state', 'client_id']
    .map((k) => `<input type="hidden" name="${k}" value="${escapeHtml(query.get(k) ?? '')}">`)
    .join('')
  const accounts = state.accounts
    .map(
      (a) =>
        `<form method="post" action="/o/oauth2/v2/auth/choose">${hidden}` +
        `<input type="hidden" name="sub" value="${escapeHtml(a.sub)}">` +
        `<button type="submit">${escapeHtml(a.email)}</button></form>`
    )
    .join('')
  const cancel = `${query.get('redirect_uri') ?? ''}?error=access_denied&state=${encodeURIComponent(query.get('state') ?? '')}`
  return (
    `<!doctype html><html><head><meta charset="utf-8"><title>Sign in - Google Accounts</title></head><body>` +
    `<h1>Choose an account</h1>${accounts}<a href="${escapeHtml(cancel)}">Cancel</a></body></html>`
  )
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://127.0.0.1:${PORT}`)
  try {
    if (url.pathname === '/health') return json(res, 200, { ok: true })

    if (url.pathname === '/state') {
      if (req.method === 'DELETE') {
        state.accounts.length = 0
        state.authorizeRequests.length = 0
        state.tokenExchanges.length = 0
        grants.clear()
        return json(res, 200, { cleared: true })
      }
      return json(res, 200, state)
    }

    if (req.method === 'POST' && url.pathname === '/accounts') {
      const body = JSON.parse((await readBody(req)) || '{}') as Partial<Account>
      if (!body.email) return json(res, 400, { error: 'email is required' })
      const account: Account = {
        sub: body.sub ?? `e2e-${randomBytes(8).toString('hex')}`,
        email: body.email,
        email_verified: body.email_verified !== false,
        name: body.name ?? body.email,
      }
      state.accounts.push(account)
      return json(res, 200, account)
    }

    if (req.method === 'GET' && url.pathname === '/o/oauth2/v2/auth') {
      state.authorizeRequests.push(Object.fromEntries(url.searchParams))
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
      res.end(chooser(url.searchParams))
      return
    }

    if (req.method === 'POST' && url.pathname === '/o/oauth2/v2/auth/choose') {
      const form = new URLSearchParams(await readBody(req))
      const account = state.accounts.find((a) => a.sub === form.get('sub'))
      const redirectUri = form.get('redirect_uri') ?? ''
      if (!account || !redirectUri) return json(res, 400, { error: 'unknown account' })
      const code = randomBytes(16).toString('hex')
      grants.set(code, { account, clientId: form.get('client_id') ?? '', redirectUri })
      const back = new URL(redirectUri)
      back.searchParams.set('code', code)
      back.searchParams.set('state', form.get('state') ?? '')
      back.searchParams.set('scope', 'email profile openid')
      return redirect(res, back.toString())
    }

    if (req.method === 'POST' && url.pathname === '/token') {
      const form = new URLSearchParams(await readBody(req))
      // The client may authenticate in the body or with Basic, as Google allows.
      const basic = (req.headers.authorization ?? '').replace(/^Basic\s+/i, '')
      const [basicId] = basic ? Buffer.from(basic, 'base64').toString('utf8').split(':') : []
      const clientId = form.get('client_id') ?? decodeURIComponent(basicId ?? '')
      const code = form.get('code') ?? ''
      state.tokenExchanges.push({ clientId, code, hadVerifier: form.has('code_verifier') })

      const grant = grants.get(code)
      if (!grant) return json(res, 400, { error: 'invalid_grant' })
      // A code is good once, as Google's are.
      grants.delete(code)
      return json(res, 200, {
        access_token: `e2e-google-access-${code}`,
        expires_in: 3599,
        scope:
          'openid https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile',
        token_type: 'Bearer',
        id_token: idToken(grant.account, grant.clientId || clientId),
      })
    }

    if (req.method === 'GET' && url.pathname === '/oauth2/v3/certs') {
      return json(res, 200, { keys: [] })
    }

    json(res, 404, { error: `google stand-in has nothing at ${url.pathname}` })
  } catch (error) {
    json(res, 500, { error: error instanceof Error ? error.message : String(error) })
  }
})

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[google-standin] account chooser and token endpoint on http://127.0.0.1:${PORT}`)
})
