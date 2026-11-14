import { NextResponse } from 'next/server'
import { randomBytes } from 'crypto'
import { db } from '@/lib/db'
import {
  CUSTOMER_SESSION_COOKIE,
  CUSTOMER_SESSION_DURATION,
  MAGIC_LINK_DURATION,
} from '@/lib/customer-session'
import { resolvePortalOrg } from '@/lib/portal-slug'
import { getAppBaseUrl } from '@/lib/app-url'
import { rateLimit } from '@/lib/rate-limit'
import {
  checkSignInLink,
  redeemSignInLink,
  SIGN_IN_LINK_COOKIE,
  SIGN_IN_LINK_ERRORS,
} from '@/features/portal/Lib/signInLink'

type RouteParams = { params: Promise<{ orgId: string }> }

function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get('cookie') ?? ''
  for (const part of header.split(';')) {
    const [key, ...rest] = part.trim().split('=')
    if (key === name) return decodeURIComponent(rest.join('='))
  }
  return null
}

/** Back to the login page with a reason, and without a token left behind. */
function backToLogin(loginUrl: string, error: string, status = 307) {
  const response = NextResponse.redirect(`${loginUrl}?error=${encodeURIComponent(error)}`, status)
  response.cookies.delete({ name: SIGN_IN_LINK_COOKIE, path: '/portal' })
  return response
}

/**
 * The address in the email. Opening it signs nobody in and spends nothing:
 * see signInLink.ts for why. It checks the link, remembers the token in a
 * cookie and sends the browser to the page with the button.
 */
export async function GET(request: Request, { params }: RouteParams) {
  const { orgId: orgParam } = await params
  const token = new URL(request.url).searchParams.get('token')
  // Nothing configured: the address that reached us is the one to send them back to.
  const baseUrl = getAppBaseUrl(new URL(request.url).origin)
  const loginUrl = `${baseUrl}/portal/${orgParam}/auth/login`

  if (!token) return backToLogin(loginUrl, 'Missing verification token.')

  const org = await resolvePortalOrg(orgParam)
  if (!org) return backToLogin(loginUrl, SIGN_IN_LINK_ERRORS.invalid)

  const link = await checkSignInLink(org.id, token)
  if (!link.ok) return backToLogin(loginUrl, SIGN_IN_LINK_ERRORS[link.problem])

  const response = NextResponse.redirect(`${baseUrl}/portal/${orgParam}/auth/confirm`)
  response.cookies.set(SIGN_IN_LINK_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/portal',
    maxAge: MAGIC_LINK_DURATION / 1000,
  })
  return response
}

/** The button on the confirm page. This is what spends the link and signs in. */
export async function POST(request: Request, { params }: RouteParams) {
  const rateLimitResponse = rateLimit(request, { limit: 10, windowMs: 60_000, anonymous: true })
  if (rateLimitResponse) return rateLimitResponse

  const { orgId: orgParam } = await params
  const baseUrl = getAppBaseUrl(new URL(request.url).origin)
  const loginUrl = `${baseUrl}/portal/${orgParam}/auth/login`
  // 303 throughout: the browser must follow a form post with a GET.
  const fail = (error: string) => backToLogin(loginUrl, error, 303)

  const token = readCookie(request, SIGN_IN_LINK_COOKIE)
  if (!token) return fail(SIGN_IN_LINK_ERRORS.invalid)

  const org = await resolvePortalOrg(orgParam)
  if (!org) return fail(SIGN_IN_LINK_ERRORS.invalid)
  const orgId = org.id

  const link = await checkSignInLink(orgId, token)
  if (!link.ok) return fail(SIGN_IN_LINK_ERRORS[link.problem])

  // The page names who is about to sign in, and the cookie is shared by every
  // tab. If a second link was opened since that page was drawn, the cookie now
  // holds a different link than the one the button was shown for: show the
  // page again, with the right name on it, rather than sign in as someone else.
  const form = await request.formData().catch(() => null)
  if (form?.get('link') !== link.id) {
    return NextResponse.redirect(`${baseUrl}/portal/${orgParam}/auth/confirm`, 303)
  }

  if (!(await redeemSignInLink(link.id))) return fail(SIGN_IN_LINK_ERRORS.used)

  const customer = await db.customer.findFirst({
    where: { email: link.email, organizationId: orgId },
    select: { id: true },
  })
  if (!customer) return fail('Customer account not found.')

  const sessionToken = randomBytes(32).toString('hex')
  await db.customerSession.create({
    data: {
      token: sessionToken,
      customerId: customer.id,
      organizationId: orgId,
      expiresAt: new Date(Date.now() + CUSTOMER_SESSION_DURATION),
    },
  })

  const response = NextResponse.redirect(`${baseUrl}/portal/${orgParam}/dashboard`, 303)
  response.cookies.set(CUSTOMER_SESSION_COOKIE, sessionToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/portal',
    maxAge: CUSTOMER_SESSION_DURATION / 1000,
  })
  response.cookies.delete({ name: SIGN_IN_LINK_COOKIE, path: '/portal' })
  return response
}
