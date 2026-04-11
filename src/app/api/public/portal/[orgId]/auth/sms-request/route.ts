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

    // Fetch the relevant org settings in one query.
    const settings = await db.appSetting.findMany({
      where: {
        organizationId: orgId,
        key: {
          in: [SETTING_KEYS.PORTAL_ENABLED, SETTING_KEYS.WORKSHOP_DEFAULT_COUNTRY_CODE],
        },
      },
      select: { key: true, value: true },
    })
    const settingMap = new Map(settings.map((s) => [s.key, s.value]))

    if (settingMap.get(SETTING_KEYS.PORTAL_ENABLED) !== 'true') {
      return NextResponse.json({ success: true })
    }

    // Check SMS is configured for this org - don't leak that it isn't
    const smsProvider = await getOrgSmsProvider(orgId)
    if (!smsProvider) {
      return NextResponse.json({ success: true })
    }

    // Normalize the phone using the workshop's default country code as a
    // fallback. Customers don't always type the country code, and existing
    // customer records may not have it stored either.
    const defaultCountryCode = settingMap.get(SETTING_KEYS.WORKSHOP_DEFAULT_COUNTRY_CODE) ?? null
    const e164 = normalizePortalPhone(phone, defaultCountryCode)
    if (!e164) {
      return NextResponse.json({ success: true })
    }

    // Look up customer trying multiple variants of the phone — covers
    // legacy records stored without a country code or with a trunk prefix.
    const phoneVariants = getPhoneLookupVariants(e164, defaultCountryCode)
    const customer = await db.customer.findFirst({
      where: {
        organizationId: orgId,
        phone: { in: phoneVariants },
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
        phone: e164,
        organizationId: orgId,
        expiresAt: new Date(Date.now() + 15 * 60 * 1000),
      },
    })

    // Send the SMS. If it fails, log but still return generic success so we
    // don't leak provider errors to the caller.
    try {
      await sendOrgSms(orgId, {
        to: e164,
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
