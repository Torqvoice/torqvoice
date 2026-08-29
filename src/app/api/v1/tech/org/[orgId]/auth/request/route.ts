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
import { normalizeOrgPhone, sendOrgSms } from '@/lib/sms'

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
  const limited = rateLimit(request, { limit: 5, windowMs: 60_000, anonymous: true })
  if (limited) return limited

  const { orgId } = await params

  let identifier = ''
  let channel: 'sms' | 'email' = 'sms'
  try {
    const body = (await request.json()) as { phone?: unknown; email?: unknown }
    if (typeof body.email === 'string' && body.email.trim()) {
      identifier = body.email.trim().toLowerCase()
      channel = 'email'
    } else if (typeof body.phone === 'string' && body.phone.trim()) {
      identifier = body.phone.trim()
    }
  } catch {
    /* nothing usable in the body, answered exactly like anything else */
  }
  if (!identifier) return ok(channel)

  const org = await db.organization.findUnique({
    where: { id: orgId },
    select: { id: true, name: true },
  })
  if (!org) return ok(channel)

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
  if (!technician) return ok(channel)

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

  // Deliberately not awaited.
  //
  // Reaching a provider takes a few hundred milliseconds and not reaching one
  // takes none, so awaiting it makes a match measurably slower than a miss,
  // and hands back on the clock exactly what the response body refuses to say.
  // Nothing after this needs the result: the code is stored, so a message that
  // arrives late still works.
  void deliver(channel, org.id, org.name, identifier, technician.user?.email ?? null, code)

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

async function deliver(
  channel: 'sms' | 'email',
  organizationId: string,
  workshop: string,
  phone: string,
  email: string | null,
  code: string
) {
  try {
    if (channel === 'email') {
      if (!email) return
      await sendOrgMail(organizationId, {
        from: await getOrgFromAddress(organizationId),
        to: email,
        // The code in the subject, so it is readable from the notification
        // without opening anything.
        subject: `${code} is your Torqvoice Tech sign-in code`,
        html: emailBody(code, workshop),
      })
    } else {
      await sendOrgSms(organizationId, { to: phone, body: loginMessage(code, workshop) })
    }
  } catch (error) {
    // Never the error object itself. Providers quote the request back in their
    // failure messages, and the request contains a live code.
    console.error(
      `[tech-auth] could not deliver a ${channel} login code:`,
      error instanceof Error ? error.name : 'unknown error'
    )
  }
}

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

/**
 * The same answer for every outcome, byte for byte.
 *
 * `channel` echoes what was asked for and never what was found. It used to be
 * null when nothing matched, which made this endpoint a way of asking a
 * workshop whether it employs a given phone number.
 */
function ok(channel: 'sms' | 'email') {
  return NextResponse.json({ data: { sent: true, channel } })
}
