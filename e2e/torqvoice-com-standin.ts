import { createHmac, timingSafeEqual } from 'node:crypto'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'

/**
 * torqvoice.com as far as the app can tell.
 *
 * Plans are sold on the real site, which cannot be part of a test run: it
 * has its own database, Stripe keys and deploy. This stands in for the
 * three things the app asks of it, with the same shapes the site answers
 * with: the bearer-secret API under /api/app/subscription/*, the checkout
 * page a handoff lands on, and the account link that signs a person in.
 * The app is pointed here by NEXT_PUBLIC_TORQVOICE_COM_URL and shares
 * E2E_SERVICE_SECRET with it as TORQVOICE_SERVICE_SECRET.
 *
 * Tokens are verified exactly as the site verifies them, so a spec that
 * lands on the checkout page has proved the signature, the prefix and the
 * expiry, not just that a redirect happened. Everything the app sent is
 * kept and handed back over /state; POST /state with {linked:false} makes
 * the stand-in refuse the app, the way the site refuses a wrong secret.
 * Run on its own with `npx tsx e2e/torqvoice-com-standin.ts`.
 */

const PORT = Number(process.env.E2E_TORQVOICE_COM_PORT ?? 8028)
const SECRET = process.env.E2E_SERVICE_SECRET ?? 'e2e-service-secret-0123456789abcdef'

interface Call {
  path: string
  body: Record<string, unknown>
  authorized: boolean
  /** ms since the epoch, for reading a spec's timeline afterwards */
  at: number
}

const state = {
  linked: true,
  calls: [] as Call[],
}

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json' })
  res.end(JSON.stringify(body))
}

function html(
  res: ServerResponse,
  status: number,
  title: string,
  rows: Record<string, string>
): void {
  const items = Object.entries(rows)
    .map(
      ([key, value]) => `<li>${key}: <code data-testid="${key}">${escapeHtml(value)}</code></li>`
    )
    .join('')
  res.writeHead(status, { 'content-type': 'text/html; charset=utf-8' })
  res.end(
    `<!doctype html><title>${escapeHtml(title)}</title><h1>${escapeHtml(title)}</h1><ul>${items}</ul>`
  )
}

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"]/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c
  )
}

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = []
  for await (const chunk of req) chunks.push(chunk as Buffer)
  return Buffer.concat(chunks).toString('utf8')
}

/** The site's verification, byte for byte: HMAC-SHA256 over `${prefix}.${payload}`. */
function verify(prefix: string, token: string): Record<string, unknown> | { error: string } {
  const parts = token.split('.')
  if (parts.length !== 3 || parts[0] !== prefix) return { error: 'malformed' }
  const expected = createHmac('sha256', SECRET).update(`${prefix}.${parts[1]}`).digest('base64url')
  const a = Buffer.from(expected)
  const b = Buffer.from(parts[2])
  if (a.length !== b.length || !timingSafeEqual(a, b)) return { error: 'signature' }
  let payload: Record<string, unknown>
  try {
    payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'))
  } catch {
    return { error: 'payload' }
  }
  const now = Math.floor(Date.now() / 1000)
  if (typeof payload.exp !== 'number' || payload.exp <= now) return { error: 'expired' }
  return payload
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://127.0.0.1:${PORT}`)

  if (url.pathname === '/health') return json(res, 200, { ok: true })

  if (url.pathname === '/state') {
    if (req.method === 'POST') {
      const body = JSON.parse((await readBody(req)) || '{}')
      if (typeof body.linked === 'boolean') {
        state.linked = body.linked
        console.log(`[torqvoice-com-standin] ${Date.now()} linked=${state.linked}`)
      }
      if (body.reset) state.calls = []
      return json(res, 200, state)
    }
    return json(res, 200, state)
  }

  // The checkout page a handoff lands on.
  if (req.method === 'GET' && url.pathname === '/checkout') {
    const result = verify('tvh1', url.searchParams.get('token') ?? '')
    if ('error' in result)
      return html(res, 400, 'Stand-in checkout refused', { reason: String(result.error) })
    return html(res, 200, 'Stand-in checkout', {
      org: String(result.org),
      plan: String(result.plan),
      email: String(result.email),
      appUrl: String(result.appUrl),
    })
  }

  // The account link that signs a person in on the site.
  if (req.method === 'GET' && url.pathname === '/api/auth/sso/app-link') {
    const result = verify('tva1', url.searchParams.get('token') ?? '')
    if ('error' in result)
      return html(res, 400, 'Stand-in account refused', { reason: String(result.error) })
    return html(res, 200, 'Stand-in account', {
      sub: String(result.sub),
      email: String(result.email),
      emailVerified: String(result.emailVerified),
    })
  }

  // Where "Manage billing" lands.
  if (req.method === 'GET' && url.pathname.startsWith('/portal/')) {
    return html(res, 200, 'Stand-in billing portal', { org: url.pathname.slice('/portal/'.length) })
  }

  // The app-facing API.
  const api = url.pathname.match(/^\/api\/app\/subscription\/([a-z-]+)$/)
  if (req.method === 'POST' && api) {
    const path = api[1]
    const body = JSON.parse((await readBody(req)) || '{}') as Record<string, unknown>
    const authorized = req.headers.authorization === `Bearer ${SECRET}` && state.linked
    state.calls.push({ path, body, authorized, at: Date.now() })
    if (!authorized) return json(res, 401, { error: 'Unauthorized' })
    if (typeof body.appUrl !== 'string') return json(res, 400, { error: 'Invalid request body' })

    switch (path) {
      case 'ping':
        return json(res, 200, { linked: true, source: 'app' })
      case 'portal':
        return json(res, 200, { url: `http://127.0.0.1:${PORT}/portal/${body.organizationId}` })
      case 'cancel':
        return json(res, 200, { cancelAtPeriodEnd: true })
      case 'resume':
        return json(res, 200, { cancelAtPeriodEnd: false })
      case 'end':
        return json(res, 200, { ended: true })
      case 'upgrade-preview':
        return json(res, 200, {
          amountDue: 41,
          currency: 'usd',
          prorationDate: Math.floor(Date.now() / 1000),
        })
      case 'upgrade':
        return json(res, 200, { success: true })
      case 'sync':
        return json(res, 200, { checked: 1, synced: 0, errors: 0 })
      default:
        return json(res, 404, { error: 'Not found' })
    }
  }

  json(res, 404, { error: 'Not found' })
})

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[torqvoice-com-standin] listening on http://127.0.0.1:${PORT}`)
})
