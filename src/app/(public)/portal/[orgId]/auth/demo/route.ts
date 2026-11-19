import { NextResponse } from 'next/server'
import { randomBytes } from 'crypto'
import { db } from '@/lib/db'
import { CUSTOMER_SESSION_COOKIE, CUSTOMER_SESSION_DURATION } from '@/lib/customer-session'
import { isDemoMode } from '@/lib/demo'
import { resolvePortalOrg } from '@/lib/portal-slug'
import { getAppBaseUrl } from '@/lib/app-url'
import { rateLimit } from '@/lib/rate-limit'
import { findDemoPortalCustomer } from '@/features/portal/Lib/demoCustomer'
import { isPortalLive } from '@/features/portal/Lib/portalLive'

/**
 * The "Open the demo portal" button on the login page. The demo sends no
 * mail and no texts, so a visitor could never follow a sign-in link; this
 * signs them in as the seeded sample customer instead.
 *
 * It does not exist outside the demo: with DEMO_MODE off the answer is 404
 * before anything is read.
 */
export async function POST(request: Request, { params }: { params: Promise<{ orgId: string }> }) {
  if (!isDemoMode) return new NextResponse(null, { status: 404 })

  const rateLimitResponse = rateLimit(request, { limit: 10, windowMs: 60_000, anonymous: true })
  if (rateLimitResponse) return rateLimitResponse

  const { orgId: orgParam } = await params
  const baseUrl = getAppBaseUrl(new URL(request.url).origin)
  // 303 throughout: the browser must follow a form post with a GET.
  const toLogin = (error?: string) =>
    NextResponse.redirect(
      `${baseUrl}/portal/${orgParam}/auth/login${error ? `?error=${error}` : ''}`,
      303
    )

  const org = await resolvePortalOrg(orgParam)
  // The login page says why: no such workshop, or its portal is off.
  if (!org || !(await isPortalLive(org.id))) return toLogin()

  const customer = await findDemoPortalCustomer(org.id)
  if (!customer) return toLogin('no-account')

  const sessionToken = randomBytes(32).toString('hex')
  await db.customerSession.create({
    data: {
      token: sessionToken,
      customerId: customer.id,
      organizationId: org.id,
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
  return response
}
