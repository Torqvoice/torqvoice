import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import {
  generateLoginCode,
  hashLoginCode,
  LOGIN_CODE_TTL_MS,
  loginMessage,
} from '@/features/technician-auth/Lib/loginCode'
import { getOrgFromAddress, sendOrgMail } from '@/lib/email'
import { rateLimit } from '@/lib/rate-limit'
import { getOrgSmsProvider, normalizeOrgPhone, sendOrgSms } from '@/lib/sms'

/**
 * Sends a technician a code to sign back in with.
 *
 * The organisation is in the path, not in the body and never inferred from
 * the number, so the lookup is `this phone, in this workshop` and cannot be
 * anything else. A technician's app knows which workshop it belongs to from
 * the day the desk set it up, and keeps knowing through a sign-out.
 *
 * Answers identically whether the number belongs to anybody or not. Otherwise
 * this is a way to ask a workshop whether it employs a given phone number.
 */

/** One shape for both lookups, so the send below does not have to care which
 * of them found the technician. */
const TECHNICIAN_SELECT = { id: true, user: { select: { email: true } } } as const

export async function POST(request: Request, { params }: { params: Promise<{ orgId: string }> }) {
  const limited = rateLimit(request, { limit: 5, windowMs: 60_000 })
  if (limited) return limited

  const { orgId } = await params

  let identifier: string
  let channel: 'sms' | 'email'
  try {
    const body = (await request.json()) as { phone?: unknown; email?: unknown }
    if (typeof body.email === 'string' && body.email.trim()) {
      identifier = body.email.trim().toLowerCase()
      channel = 'email'
    } else if (typeof body.phone === 'string' && body.phone.trim()) {
      identifier = body.phone.trim()
      channel = 'sms'
    } else {
      return ok()
    }
  } catch {
    return ok()
  }

  const org = await db.organization.findUnique({
    where: { id: orgId },
    select: { id: true, name: true },
  })
  if (!org) return ok()

  const technician =
    channel === 'email'
      ? await db.technician.findFirst({
          where: {
            organizationId: org.id,
            isActive: true,
            userId: { not: null },
            user: { email: identifier },
          },
          select: TECHNICIAN_SELECT,
        })
      : await findByPhone(org.id, identifier)

  // Nothing found, or found and unreachable. Same answer either way.
  if (!technician) return ok()

  const code = generateLoginCode()

  // One live code per technician. Asking again should replace, not accumulate:
  // two valid codes for one account is one more than anybody asked for, and a
  // technician who taps resend expects the newest message to be the one that
  // works.
  await db.technicianLoginCode.deleteMany({
    where: { technicianId: technician.id, usedAt: null },
  })
  await db.technicianLoginCode.create({
    data: {
      codeHash: hashLoginCode(code),
      channel,
      expiresAt: new Date(Date.now() + LOGIN_CODE_TTL_MS),
      technicianId: technician.id,
      organizationId: org.id,
    },
  })

  try {
    if (channel === 'email') {
      const email = technician.user?.email
      if (email) {
        await sendOrgMail(org.id, {
          from: await getOrgFromAddress(org.id),
          to: email,
          // The code in the subject, so it is readable from the notification
          // without opening anything.
          subject: `${code} is your Torqvoice Tech sign-in code`,
          html: emailBody(code, org.name),
        })
      }
    } else {
      await sendOrgSms(org.id, {
        to: identifier,
        body: loginMessage(code, org.name),
      })
    }
  } catch (error) {
    // The code is already stored, so a delivery failure leaves the technician
    // able to sign in if the message turns up late. Logged rather than
    // surfaced: telling an anonymous caller that delivery failed tells them
    // the account exists.
    console.error('[tech-auth] could not deliver login code:', error)
  }

  return ok(channel)
}

/**
 * Finds a technician by the number they were given, however it was written.
 *
 * A desk types `912 34 567` and a technician types `+4791234567`, and both
 * mean the same person. The workshop's own default country code is what
 * bridges them, which is why this compares normalised numbers rather than
 * strings.
 *
 * The number lives on the person, next to their name and their email. The
 * scoping is in this query instead: only technicians of this workshop, only
 * active ones, so a number is never asked about on its own.
 */
async function findByPhone(organizationId: string, phone: string) {
  const e164 = await normalizeOrgPhone(organizationId, phone)
  if (!e164) return null

  const candidates = await db.technician.findMany({
    where: {
      organizationId,
      isActive: true,
      userId: { not: null },
      user: { phone: { not: null } },
    },
    select: { ...TECHNICIAN_SELECT, user: { select: { email: true, phone: true } } },
  })

  const matches = await Promise.all(
    candidates.map(async (t) => ({
      technician: t,
      e164: t.user?.phone ? await normalizeOrgPhone(organizationId, t.user.phone) : null,
    }))
  )
  return matches.find((m) => m.e164 === e164)?.technician ?? null
}

/**
 * The same answer for every outcome.
 *
 * `channel` is echoed back only so the app can say "check your messages"
 * rather than "check something". It reflects what was asked for, never what
 * was found.
 */
/** Plain and short. A sign-in code that arrives dressed as marketing is a
 * sign-in code somebody hesitates over. */
function emailBody(code: string, workshop: string): string {
  return [
    '<div style="font-family:system-ui,-apple-system,sans-serif;font-size:15px;line-height:1.5">',
    `<p>Your Torqvoice Tech sign-in code for <strong>${escapeHtml(workshop)}</strong>:</p>`,
    `<p style="font-size:30px;font-weight:600;letter-spacing:6px;margin:20px 0">${code}</p>`,
    '<p>It expires in five minutes and can be used once.</p>',
    '<p style="color:#666;font-size:13px">If you did not ask for this, you can ignore it.</p>',
    '</div>',
  ].join('')
}

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string
  )
}

function ok(channel?: 'sms' | 'email') {
  return NextResponse.json({ data: { sent: true, channel: channel ?? null } })
}

/** Whether this workshop can send a code at all, so the app can offer the
 * choice honestly instead of a button that quietly does nothing. */
export async function GET(request: Request, { params }: { params: Promise<{ orgId: string }> }) {
  const limited = rateLimit(request, { limit: 20, windowMs: 60_000 })
  if (limited) return limited

  const { orgId } = await params
  const sms = await getOrgSmsProvider(orgId).catch(() => null)

  return NextResponse.json({ data: { sms: sms !== null, email: true } })
}
