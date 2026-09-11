import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'

/**
 * A payment vendor that moves no money.
 *
 * Stripe and PayPal are reached over the network with a workshop's own keys,
 * and neither can be used from a test run: no account to charge, and a hosted
 * checkout page that is theirs to change. So this stands in for both, speaking
 * just the calls the app makes, with the same shapes the vendors answer with,
 * and a checkout page of its own where a spec clicks "Pay" the way a customer
 * would. The app is pointed here by STRIPE_API_BASE_URL and
 * PAYPAL_API_BASE_URL, which only the environment can set.
 *
 * It keeps what it is given in memory and hands it back over /state, so a spec
 * can check that the amount a customer was charged is the amount the invoice
 * showed. A key or secret containing "wrong" is refused, the way a vendor
 * refuses one it does not know. Run on its own with `npx tsx e2e/payment-sink.ts`.
 */

const PORT = Number(process.env.E2E_PAYMENT_PORT ?? 8026)
const SELF = `http://127.0.0.1:${PORT}`

interface StripeSession {
  id: string
  object: 'checkout.session'
  mode: 'payment'
  status: 'open' | 'complete' | 'expired'
  payment_status: 'unpaid' | 'paid'
  amount_total: number
  currency: string
  metadata: Record<string, string>
  success_url: string
  cancel_url: string
  url: string
}

interface PayPalOrder {
  id: string
  intent: 'CAPTURE'
  status: 'PAYER_ACTION_REQUIRED' | 'APPROVED' | 'COMPLETED'
  amount: { currency_code: string; value: string }
  custom_id: string
  invoice_id: string
  return_url: string
  cancel_url: string
}

const state = {
  stripe: [] as StripeSession[],
  paypal: [] as PayPalOrder[],
  /** Every request the app made, oldest first: "POST /v1/checkout/sessions". */
  calls: [] as string[],
}
let counter = 0
/**
 * Stamped into every id, because the counter starts again with each run and
 * the database does not. A session called `cs_test_e2e_5` in this run is not
 * the one of that name an earlier run paid, and the app keys payments on
 * these ids exactly as it keys them on Stripe's and PayPal's.
 */
const RUN = Date.now().toString(36)

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json' })
  res.end(JSON.stringify(body))
}

function html(res: ServerResponse, body: string): void {
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
  res.end(
    `<!doctype html><html><head><meta charset="utf-8"><title>E2E checkout</title></head><body>${body}</body></html>`
  )
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

/**
 * Stripe's form encoding, `metadata[orgId]=…&line_items[0][price_data][unit_amount]=…`,
 * as the nested object it describes.
 */
function parseStripeForm(body: string): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [key, value] of new URLSearchParams(body)) {
    const path = key.split(/[[\]]+/).filter(Boolean)
    let node = out
    path.forEach((segment, i) => {
      if (i === path.length - 1) {
        node[segment] = value
      } else {
        node[segment] = (node[segment] as Record<string, unknown>) ?? {}
        node = node[segment] as Record<string, unknown>
      }
    })
  }
  return out
}

function stripeRefuses(req: IncomingMessage): boolean {
  const key = (req.headers.authorization ?? '').replace(/^Bearer\s+/i, '')
  return !key || key.includes('wrong')
}

function money(cents: number, currency: string): string {
  return `${(cents / 100).toFixed(2)} ${currency.toUpperCase()}`
}

async function handleStripe(req: IncomingMessage, res: ServerResponse, url: URL): Promise<boolean> {
  if (!url.pathname.startsWith('/v1/') || url.pathname.startsWith('/v1/oauth2')) return false

  if (stripeRefuses(req)) {
    json(res, 401, {
      error: {
        type: 'invalid_request_error',
        code: 'api_key_invalid',
        message: 'Invalid API Key provided',
      },
    })
    return true
  }

  if (req.method === 'GET' && url.pathname === '/v1/account') {
    json(res, 200, {
      id: 'acct_e2e',
      object: 'account',
      email: 'payments@e2e.test',
      settings: { dashboard: { display_name: 'E2E Stripe account' } },
    })
    return true
  }

  if (req.method === 'POST' && url.pathname === '/v1/checkout/sessions') {
    const form = parseStripeForm(await readBody(req)) as {
      line_items?: Record<string, { price_data?: { currency?: string; unit_amount?: string } }>
      metadata?: Record<string, string>
      success_url?: string
      cancel_url?: string
    }
    const line = form.line_items?.['0']?.price_data
    const id = `cs_test_e2e_${RUN}_${++counter}`
    const session: StripeSession = {
      id,
      object: 'checkout.session',
      mode: 'payment',
      status: 'open',
      payment_status: 'unpaid',
      amount_total: Number(line?.unit_amount ?? 0),
      currency: line?.currency ?? 'usd',
      metadata: form.metadata ?? {},
      success_url: form.success_url ?? '',
      cancel_url: form.cancel_url ?? '',
      url: `${SELF}/pay/stripe/${id}`,
    }
    state.stripe.push(session)
    json(res, 200, session)
    return true
  }

  const retrieve = url.pathname.match(/^\/v1\/checkout\/sessions\/([^/]+)$/)
  if (req.method === 'GET' && retrieve) {
    const session = state.stripe.find((s) => s.id === retrieve[1])
    if (!session) {
      json(res, 404, {
        error: {
          type: 'invalid_request_error',
          message: `No such checkout.session: '${retrieve[1]}'`,
        },
      })
    } else {
      json(res, 200, session)
    }
    return true
  }

  json(res, 404, { error: { type: 'invalid_request_error', message: `Unknown ${url.pathname}` } })
  return true
}

function paypalOrderBody(order: PayPalOrder) {
  const captures =
    order.status === 'COMPLETED'
      ? [
          {
            id: `CAP-${order.id}`,
            status: 'COMPLETED',
            amount: order.amount,
            custom_id: order.custom_id,
          },
        ]
      : undefined
  return {
    id: order.id,
    intent: order.intent,
    status: order.status,
    purchase_units: [
      {
        reference_id: 'default',
        custom_id: order.custom_id,
        invoice_id: order.invoice_id,
        amount: order.amount,
        ...(captures ? { payments: { captures } } : {}),
      },
    ],
  }
}

async function handlePayPal(req: IncomingMessage, res: ServerResponse, url: URL): Promise<boolean> {
  if (req.method === 'POST' && url.pathname === '/v1/oauth2/token') {
    const basic = (req.headers.authorization ?? '').replace(/^Basic\s+/i, '')
    const [clientId, secret] = Buffer.from(basic, 'base64').toString('utf8').split(':')
    if (!clientId || !secret || secret.includes('wrong')) {
      json(res, 401, { error: 'invalid_client', error_description: 'Client Authentication failed' })
    } else {
      json(res, 200, { access_token: 'E2E-ACCESS-TOKEN', token_type: 'Bearer', expires_in: 32400 })
    }
    return true
  }

  if (!url.pathname.startsWith('/v2/checkout/orders')) return false

  if (req.headers.authorization !== 'Bearer E2E-ACCESS-TOKEN') {
    json(res, 401, { name: 'AUTHENTICATION_FAILURE', message: 'Authentication failed' })
    return true
  }

  if (req.method === 'POST' && url.pathname === '/v2/checkout/orders') {
    const body = JSON.parse((await readBody(req)) || '{}')
    const unit = body.purchase_units?.[0] ?? {}
    const context = body.payment_source?.paypal?.experience_context ?? {}
    const id = `E2EORDER${RUN.toUpperCase()}${++counter}`
    const order: PayPalOrder = {
      id,
      intent: 'CAPTURE',
      status: 'PAYER_ACTION_REQUIRED',
      amount: unit.amount ?? { currency_code: 'USD', value: '0.00' },
      custom_id: unit.custom_id ?? '',
      invoice_id: unit.invoice_id ?? '',
      return_url: context.return_url ?? '',
      cancel_url: context.cancel_url ?? '',
    }
    state.paypal.push(order)
    json(res, 200, {
      id,
      status: order.status,
      links: [
        { rel: 'self', href: `${SELF}/v2/checkout/orders/${id}`, method: 'GET' },
        { rel: 'payer-action', href: `${SELF}/pay/paypal/${id}`, method: 'GET' },
      ],
    })
    return true
  }

  const capture = url.pathname.match(/^\/v2\/checkout\/orders\/([^/]+)\/capture$/)
  if (req.method === 'POST' && capture) {
    const order = state.paypal.find((o) => o.id === capture[1])
    if (!order) {
      json(res, 404, { name: 'RESOURCE_NOT_FOUND' })
    } else if (order.status === 'COMPLETED') {
      json(res, 422, {
        name: 'UNPROCESSABLE_ENTITY',
        details: [{ issue: 'ORDER_ALREADY_CAPTURED' }],
      })
    } else if (order.status !== 'APPROVED') {
      json(res, 422, { name: 'UNPROCESSABLE_ENTITY', details: [{ issue: 'ORDER_NOT_APPROVED' }] })
    } else {
      order.status = 'COMPLETED'
      const body = paypalOrderBody(order)
      // A capture answer carries the capture, not the unit's own custom_id.
      json(res, 201, {
        id: body.id,
        status: body.status,
        purchase_units: [{ reference_id: 'default', payments: body.purchase_units[0].payments }],
      })
    }
    return true
  }

  const show = url.pathname.match(/^\/v2\/checkout\/orders\/([^/]+)$/)
  if (req.method === 'GET' && show) {
    const order = state.paypal.find((o) => o.id === show[1])
    if (!order) json(res, 404, { name: 'RESOURCE_NOT_FOUND' })
    else json(res, 200, paypalOrderBody(order))
    return true
  }

  json(res, 404, { name: 'RESOURCE_NOT_FOUND', message: `Unknown ${url.pathname}` })
  return true
}

/** The page a customer lands on at the vendor, with the one decision a customer makes there. */
async function handleCheckoutPage(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL
): Promise<boolean> {
  const stripe = url.pathname.match(/^\/pay\/stripe\/([^/]+)$/)
  if (stripe) {
    const session = state.stripe.find((s) => s.id === stripe[1])
    if (!session) return json(res, 404, { error: 'no such session' }), true
    if (req.method === 'POST') {
      session.status = 'complete'
      session.payment_status = 'paid'
      redirect(res, session.success_url.replace('{CHECKOUT_SESSION_ID}', session.id))
      return true
    }
    html(
      res,
      `<h1>Stripe checkout</h1><p id="amount">${money(session.amount_total, session.currency)}</p>` +
        `<form method="post"><button type="submit">Pay</button></form>` +
        `<a href="${session.cancel_url}">Cancel</a>`
    )
    return true
  }

  const paypal = url.pathname.match(/^\/pay\/paypal\/([^/]+)$/)
  if (paypal) {
    const order = state.paypal.find((o) => o.id === paypal[1])
    if (!order) return json(res, 404, { error: 'no such order' }), true
    if (req.method === 'POST') {
      order.status = 'APPROVED'
      // PayPal appends its own token and PayerID to whatever return URL it was given.
      const joiner = order.return_url.includes('?') ? '&' : '?'
      redirect(res, `${order.return_url}${joiner}token=${order.id}&PayerID=E2EPAYER`)
      return true
    }
    html(
      res,
      `<h1>PayPal checkout</h1><p id="amount">${order.amount.value} ${order.amount.currency_code}</p>` +
        `<form method="post"><button type="submit">Pay</button></form>` +
        `<a href="${order.cancel_url}">Cancel</a>`
    )
    return true
  }
  return false
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', SELF)
  try {
    if (url.pathname === '/health') return json(res, 200, { ok: true })
    if (url.pathname === '/state') {
      if (req.method === 'DELETE') {
        state.stripe.length = 0
        state.paypal.length = 0
        state.calls.length = 0
        return json(res, 200, { cleared: true })
      }
      return json(res, 200, state)
    }

    state.calls.push(`${req.method} ${url.pathname}`)
    if (await handleCheckoutPage(req, res, url)) return
    if (await handlePayPal(req, res, url)) return
    if (await handleStripe(req, res, url)) return
    json(res, 404, { error: `payment sink has nothing at ${url.pathname}` })
  } catch (error) {
    json(res, 500, { error: error instanceof Error ? error.message : String(error) })
  }
})

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[payment-sink] Stripe and PayPal stand-in on ${SELF}`)
})
