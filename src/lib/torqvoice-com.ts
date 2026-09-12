import { createHmac, randomBytes } from 'node:crypto'
import { NextResponse } from 'next/server'
import { isCloudMode } from './features'

/**
 * The cloud app's side of billing on torqvoice.com.
 *
 * Plans are sold on torqvoice.com, not here: the checkout page, the Stripe
 * keys, the webhook and the invoices all live there, and this app only
 * reads its own `subscriptions` row to know what a workshop is entitled to.
 * Two things cross over, both keyed by `TORQVOICE_SERVICE_SECRET`, which
 * is the same value on both sides:
 *
 * - The purchase goes through the customer's browser, so the app mints a
 *   signed, short-lived handoff naming the organization, the plan and the
 *   buyer, and sends the browser to torqvoice.com with it.
 * - Everything else (billing portal, cancel, resume, upgrade, the daily
 *   sync) is a server-to-server call with the secret as a bearer token.
 *
 * A self-hosted install has no secret and never reaches any of this: the
 * subscription page is cloud-only.
 */

/**
 * Where torqvoice.com is. Read at call time from a server variable: a
 * NEXT_PUBLIC_ value is inlined into the server bundle when the image is
 * built, so a container or a test harness could never point it elsewhere.
 * The public name is still honoured for a development .env.
 */
export function torqvoiceComUrl(): string {
  return (
    process.env.TORQVOICE_COM_URL ||
    process.env.NEXT_PUBLIC_TORQVOICE_COM_URL ||
    'https://torqvoice.com'
  ).replace(/\/+$/, '')
}

export const HANDOFF_PREFIX = 'tvh1'
/** How long a checkout link stays valid; torqvoice.com refuses older ones. */
export const HANDOFF_TTL_SECONDS = 15 * 60

export type HandoffPayload = {
  v: 1
  /** one-time id: the site starts one checkout per handoff */
  jti: string
  org: string
  plan: 'pro' | 'enterprise'
  email: string
  name: string
  appUrl: string
  iat: number
  exp: number
}

function serviceSecret(): string | null {
  const value = process.env.TORQVOICE_SERVICE_SECRET
  return value && value.length >= 16 ? value : null
}

/** Cloud mode with the shared secret set: the only state in which plans can be bought. */
export function isTorqvoiceComBillingConfigured(): boolean {
  return isCloudMode() && serviceSecret() !== null
}

/** This app's public origin, which torqvoice.com matches against its allowlist. */
export function appOrigin(): string {
  const raw = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  try {
    return new URL(raw).origin
  } catch {
    return raw
  }
}

export function createHandoffToken(
  input: { organizationId: string; plan: 'pro' | 'enterprise'; email: string; name: string },
  now = Date.now()
): string {
  const secret = serviceSecret()
  if (!secret) throw new Error('TORQVOICE_SERVICE_SECRET is not set')

  const iat = Math.floor(now / 1000)
  const payload: HandoffPayload = {
    v: 1,
    jti: randomBytes(16).toString('base64url'),
    org: input.organizationId,
    plan: input.plan,
    email: input.email,
    name: input.name.slice(0, 200),
    appUrl: appOrigin(),
    iat,
    exp: iat + HANDOFF_TTL_SECONDS,
  }
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const signature = createHmac('sha256', secret)
    .update(`${HANDOFF_PREFIX}.${encoded}`)
    .digest('base64url')
  return `${HANDOFF_PREFIX}.${encoded}.${signature}`
}

export function checkoutUrl(token: string): string {
  const url = new URL('/checkout', torqvoiceComUrl())
  url.searchParams.set('token', token)
  return url.toString()
}

export const ACCOUNT_LINK_PREFIX = 'tva1'
/** Long enough for one redirect; the site refuses anything older. */
export const ACCOUNT_LINK_TTL_SECONDS = 2 * 60

export type AccountLinkPayload = {
  v: 1
  /** one-time id, so a link cannot be replayed */
  jti: string
  sub: string
  email: string
  name: string
  /** whether this app has verified the address; the site will not join an unverified arrival to an existing account */
  emailVerified: boolean
  appUrl: string
  iat: number
  exp: number
}

/**
 * "Open your account on torqvoice.com": a signed statement of who is signed
 * in here, good for two minutes, that the site turns into a session of its
 * own. The same secret and format as the checkout handoff, under a
 * different prefix so one can never be mistaken for the other.
 */
export function createAccountLinkToken(
  input: { userId: string; email: string; name: string; emailVerified: boolean },
  now = Date.now()
): string {
  const secret = serviceSecret()
  if (!secret) throw new Error('TORQVOICE_SERVICE_SECRET is not set')

  const iat = Math.floor(now / 1000)
  const payload: AccountLinkPayload = {
    v: 1,
    jti: randomBytes(16).toString('base64url'),
    sub: input.userId,
    email: input.email,
    name: input.name.slice(0, 200),
    emailVerified: input.emailVerified,
    appUrl: appOrigin(),
    iat,
    exp: iat + ACCOUNT_LINK_TTL_SECONDS,
  }
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const signature = createHmac('sha256', secret)
    .update(`${ACCOUNT_LINK_PREFIX}.${encoded}`)
    .digest('base64url')
  return `${ACCOUNT_LINK_PREFIX}.${encoded}.${signature}`
}

export function accountLinkUrl(token: string): string {
  const url = new URL('/api/auth/sso/app-link', torqvoiceComUrl())
  url.searchParams.set('token', token)
  return url.toString()
}

/** torqvoice.com answered, but with an error: its message is safe to show. */
export class TorqvoiceComError extends Error {
  /** What the app answers its own caller with. */
  status: number
  /** What torqvoice.com actually answered, when that differs. */
  upstreamStatus: number
  constructor(message: string, status: number, upstreamStatus = status) {
    super(message)
    this.name = 'TorqvoiceComError'
    this.status = status
    this.upstreamStatus = upstreamStatus
  }
}

/**
 * One billing call. The body always carries this app's origin, which is how
 * torqvoice.com knows which deployment, and so which database and Stripe
 * account, the organization belongs to.
 */
export async function billingRequest<T>(
  path: 'portal' | 'cancel' | 'resume' | 'end' | 'upgrade-preview' | 'upgrade' | 'sync' | 'ping',
  body: Record<string, unknown>,
  timeoutMs = 20_000
): Promise<T> {
  const secret = serviceSecret()
  if (!secret) throw new TorqvoiceComError('Billing is not configured', 500)

  let response: Response
  try {
    response = await fetch(`${torqvoiceComUrl()}/api/app/subscription/${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${secret}`,
      },
      body: JSON.stringify({ appUrl: appOrigin(), ...body }),
      signal: AbortSignal.timeout(timeoutMs),
    })
  } catch {
    throw new TorqvoiceComError('Could not reach torqvoice.com. Please try again.', 502)
  }

  const data = (await response.json().catch(() => null)) as
    | (Record<string, unknown> & { error?: unknown; code?: unknown })
    | null
  if (!response.ok) {
    const upstream = data && typeof data.error === 'string' ? data.error : ''
    // Only a refusal the site marks as meant for the customer is shown as
    // it is. Anything else, a wrong secret, an origin not listed, a body
    // the site did not understand, is an operator's problem: it is logged
    // with its real status and the caller sees a temporary failure, never
    // an "Unauthorized" from a page they are signed in to.
    if (data?.code === 'billing' && upstream && response.status < 500) {
      throw new TorqvoiceComError(upstream, response.status)
    }
    console.error(`[torqvoice.com] ${path} failed (${response.status}): ${upstream}`)
    throw new TorqvoiceComError('Billing is temporarily unavailable', 502, response.status)
  }
  return (data ?? {}) as T
}

/** The JSON a route answers with when a billing call fails. */
export function billingErrorResponse(error: unknown, fallback: string) {
  if (error instanceof TorqvoiceComError) {
    return NextResponse.json({ error: error.message }, { status: error.status })
  }
  console.error('[subscription]', error)
  return NextResponse.json({ error: fallback }, { status: 500 })
}
