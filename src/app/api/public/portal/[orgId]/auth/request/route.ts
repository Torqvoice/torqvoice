import { NextResponse } from 'next/server'
import { randomBytes } from 'crypto'
import { db } from '@/lib/db'
import { rateLimit } from '@/lib/rate-limit'
import { SETTING_KEYS } from '@/features/settings/Schema/settingsSchema'
import { MAGIC_LINK_DURATION } from '@/lib/customer-session'
import { resolvePortalOrg } from '@/lib/portal-slug'
import { getAppBaseUrl } from '@/lib/app-url'
import { sendTemplatedMail } from '@/features/email/Lib/sendTemplatedMail'
import { resolveCustomerLocale } from '@/i18n/locale-from-request'

export async function POST(request: Request, { params }: { params: Promise<{ orgId: string }> }) {
  const rateLimitResponse = rateLimit(request, { limit: 5, windowMs: 60_000, anonymous: true })
  if (rateLimitResponse) return rateLimitResponse

  const { orgId: orgParam } = await params

  try {
    const body = await request.json()
    const email = (body.email as string)?.trim().toLowerCase()

    if (!email) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 })
    }

    // Resolve slug or id to real org
    const org = await resolvePortalOrg(orgParam)

    if (!org) {
      // Don't leak org existence - return generic success
      return NextResponse.json({ success: true })
    }

    const orgId = org.id

    // Check portal is enabled
    const portalSetting = await db.appSetting.findUnique({
      where: {
        organizationId_key: {
          organizationId: orgId,
          key: SETTING_KEYS.PORTAL_ENABLED,
        },
      },
    })

    if (portalSetting?.value !== 'true') {
      return NextResponse.json({ success: true })
    }

    // Look up customer
    const customer = await db.customer.findFirst({
      where: {
        email,
        organizationId: orgId,
      },
      select: { id: true, name: true },
    })

    if (!customer) {
      // Don't leak customer existence
      return NextResponse.json({ success: true })
    }

    // Create magic link
    const token = randomBytes(32).toString('hex')
    await db.customerMagicLink.create({
      data: {
        token,
        email,
        organizationId: orgId,
        expiresAt: new Date(Date.now() + MAGIC_LINK_DURATION),
      },
    })

    // Send email - use the URL param (slug) so the verify link matches the user's URL
    const appUrl = getAppBaseUrl()

    const magicLinkUrl = `${appUrl}/portal/${orgParam}/auth/verify?token=${token}`

    // The customer has no workshop cookie to read a language from, so the
    // browser that asked for the link decides, unless the workshop forces one.
    const locale = await resolveCustomerLocale(orgId, request.headers.get('accept-language'))

    await sendTemplatedMail(orgId, {
      kind: 'portal_signin',
      to: email,
      locale,
      context: { customerName: customer.name, signinLink: magicLinkUrl },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[portal-auth-request]', error)
    return NextResponse.json({ success: true })
  }
}
