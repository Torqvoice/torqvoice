import { NextResponse } from 'next/server'
import { randomInt } from 'crypto'
import { db } from '@/lib/db'
import { rateLimit } from '@/lib/rate-limit'
import { SETTING_KEYS } from '@/features/settings/Schema/settingsSchema'
import { resolvePortalOrg } from '@/lib/portal-slug'
import { getOrgSmsProvider, sendOrgSms } from '@/lib/sms'
import { getPhoneLookupVariants, normalizePortalPhone } from '@/lib/portal-phone'

export async function POST(request: Request, { params }: { params: Promise<{ orgId: string }> }) {
  const rateLimitResponse = rateLimit(request, { limit: 5, windowMs: 60_000 })
  if (rateLimitResponse) return rateLimitResponse

  const { orgId: orgParam } = await params

  try {
    const body = await request.json()
    const phone = (body.phone as string)?.trim()

    if (!phone) {
      return NextResponse.json({ error: 'Phone is required' }, { status: 400 })
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

    // Check SMS is configured for this org - don't leak that it isn't
    const smsProvider = await getOrgSmsProvider(orgId)
    if (!smsProvider) {
      return NextResponse.json({ success: true })
    }

    // Validate phone format - don't leak validation errors
    if (!isValidE164(phone)) {
      return NextResponse.json({ success: true })
    }

    // Look up customer
    const customer = await db.customer.findFirst({
      where: {
        phone,
        organizationId: orgId,
      },
      select: { id: true, name: true },
    })

    if (!customer) {
      // Don't leak customer existence
      return NextResponse.json({ success: true })
    }

    // Generate a 6-digit code
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0')

    await db.customerSmsCode.create({
      data: {
        code,
        phone,
        organizationId: orgId,
        expiresAt: new Date(Date.now() + 15 * 60 * 1000),
      },
    })

    // Send the SMS. If it fails, log but still return generic success so we
    // don't leak provider errors to the caller.
    try {
      await sendOrgSms(orgId, {
        to: phone,
        body: `${code} is your sign-in code for ${org.name}. Expires in 15 minutes.`,
      })
    } catch (smsError) {
      console.error('[portal-auth-sms-request] sms send failed', smsError)
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[portal-auth-sms-request]', error)
    return NextResponse.json({ success: true })
  }
}
