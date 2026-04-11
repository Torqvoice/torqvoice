import { NextResponse } from 'next/server'
import { randomBytes } from 'crypto'
import { cookies } from 'next/headers'
import { db } from '@/lib/db'
import { rateLimit } from '@/lib/rate-limit'
import { CUSTOMER_SESSION_COOKIE, CUSTOMER_SESSION_DURATION } from '@/lib/customer-session'
import { resolvePortalOrg } from '@/lib/portal-slug'
import { SETTING_KEYS } from '@/features/settings/Schema/settingsSchema'
import { getPhoneLookupVariants, normalizePortalPhone } from '@/lib/portal-phone'

export async function POST(request: Request, { params }: { params: Promise<{ orgId: string }> }) {
  const rateLimitResponse = rateLimit(request, { limit: 5, windowMs: 60_000 })
  if (rateLimitResponse) return rateLimitResponse

  const { orgId: orgParam } = await params

  try {
    const body = await request.json()
    const phone = typeof body.phone === 'string' ? body.phone.trim() : ''
    const code = typeof body.code === 'string' ? body.code.trim() : ''

    if (!phone || !code || code.length !== 6) {
      return NextResponse.json({ success: false, error: 'Invalid request' }, { status: 400 })
    }

    // Resolve slug or id to real org
    const org = await resolvePortalOrg(orgParam)

    if (!org) {
      return NextResponse.json(
        { success: false, error: 'Invalid or expired code' },
        { status: 400 }
      )
    }

    const orgId = org.id

    // Normalize the phone with the workshop's default country code so the
    // lookup matches what sms-request stored (always E.164).
    const countrySetting = await db.appSetting.findUnique({
      where: {
        organizationId_key: {
          organizationId: orgId,
          key: SETTING_KEYS.WORKSHOP_DEFAULT_COUNTRY_CODE,
        },
      },
      select: { value: true },
    })
    const defaultCountryCode = countrySetting?.value ?? null
    const e164 = normalizePortalPhone(phone, defaultCountryCode)
    if (!e164) {
      return NextResponse.json(
        { success: false, error: 'Invalid or expired code' },
        { status: 400 }
      )
    }

    const codeRow = await db.customerSmsCode.findFirst({
      where: {
        phone: e164,
        code,
        organizationId: orgId,
        usedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    })

    if (!codeRow) {
      return NextResponse.json(
        { success: false, error: 'Invalid or expired code' },
        { status: 400 }
      )
    }

    // Mark the code as used
    await db.customerSmsCode.update({
      where: { id: codeRow.id },
      data: { usedAt: new Date() },
    })

    // Find the customer — try the same variants as sms-request so legacy
    // records without country codes still resolve.
    const phoneVariants = getPhoneLookupVariants(e164, defaultCountryCode)
    const customer = await db.customer.findFirst({
      where: {
        organizationId: orgId,
        phone: { in: phoneVariants },
      },
      select: { id: true },
    })

    if (!customer) {
      return NextResponse.json(
        { success: false, error: 'Invalid or expired code' },
        { status: 400 }
      )
    }

    // Create session
    const sessionToken = randomBytes(32).toString('hex')
    const expires = new Date(Date.now() + CUSTOMER_SESSION_DURATION)
    await db.customerSession.create({
      data: {
        token: sessionToken,
        customerId: customer.id,
        organizationId: orgId,
        expiresAt: expires,
      },
    })

    const cookieStore = await cookies()
    cookieStore.set(CUSTOMER_SESSION_COOKIE, sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/portal',
      maxAge: CUSTOMER_SESSION_DURATION / 1000,
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[portal-auth-sms-verify]', error)
    return NextResponse.json({ success: false, error: 'Invalid or expired code' }, { status: 400 })
  }
}
