import { timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import {
  hashLoginCode,
  MAX_ATTEMPTS,
  normalizeLoginCode,
} from '@/features/technician-auth/Lib/loginCode'
import { logAudit } from '@/lib/audit'
import { rateLimit } from '@/lib/rate-limit'
import { normalizeOrgPhone } from '@/lib/sms'

/**
 * Turns a code into a session.
 *
 * Scoped to the organisation in the path throughout, so a code issued by one
 * workshop cannot be presented to another even if the same person works at
 * both. The technician is re-read at this moment rather than trusted from
 * when the code was sent: somebody deactivated in between must not get in.
 */

export async function POST(request: Request, { params }: { params: Promise<{ orgId: string }> }) {
  const limited = rateLimit(request, { limit: 10, windowMs: 60_000, anonymous: true })
  if (limited) return limited

  const { orgId } = await params

  let code = ''
  let identifier = ''
  let channel: 'sms' | 'email' = 'sms'
  try {
    const body = (await request.json()) as { code?: unknown; phone?: unknown; email?: unknown }
    code = normalizeLoginCode(typeof body.code === 'string' ? body.code : '')
    if (typeof body.email === 'string' && body.email.trim()) {
      identifier = body.email.trim().toLowerCase()
      channel = 'email'
    } else if (typeof body.phone === 'string' && body.phone.trim()) {
      identifier = body.phone.trim()
    }
  } catch {
    return bad('invalid_code')
  }
  if (code.length !== 6 || !identifier) return bad('invalid_code')

  /**
   * Whose code this is meant to be, before looking at the code at all.
   *
   * The identifier is what makes a wrong guess cost the guesser rather than
   * everybody. Matching on the hash alone meant a miss belonged to nobody, so
   * a wrong guess had to age every live code in the workshop to cost anything,
   * and five wrong guesses from anyone who knew the workshop id locked out
   * every technician in the building. Now an attempt lands on one code: the
   * one belonging to the person the caller claims to be.
   */
  const technicianId = await resolveTechnician(orgId, channel, identifier)
  if (!technicianId) return bad('invalid_code')

  const candidate = await db.technicianLoginCode.findFirst({
    where: { organizationId: orgId, technicianId, usedAt: null },
    select: {
      id: true,
      codeHash: true,
      expiresAt: true,
      attempts: true,
      technician: {
        select: { id: true, isActive: true, userId: true, organizationId: true },
      },
    },
  })

  if (!candidate) return bad('invalid_code')
  if (candidate.expiresAt.getTime() < Date.now()) return bad('code_expired')
  if (candidate.attempts >= MAX_ATTEMPTS) return bad('too_many_attempts')

  if (!timingSafeEqualHex(candidate.codeHash, hashLoginCode(code))) {
    const { attempts } = await db.technicianLoginCode.update({
      where: { id: candidate.id },
      data: { attempts: { increment: 1 } },
      select: { attempts: true },
    })
    // Spent rather than left to expire, so a guesser cannot start again on the
    // same code by waiting out the rate limiter.
    if (attempts >= MAX_ATTEMPTS) {
      await db.technicianLoginCode.delete({ where: { id: candidate.id } }).catch(() => undefined)
    }
    return bad('invalid_code')
  }

  const technician = candidate.technician
  // Belt and braces on the scoping. The query above is already org-scoped;
  // this makes a future refactor that loosens it fail loudly here.
  if (technician.organizationId !== orgId) return bad('invalid_code')
  if (!technician.isActive || !technician.userId) return bad('not_technician')

  const membership = await db.organizationMember.findFirst({
    where: { userId: technician.userId, organizationId: orgId },
    select: { id: true },
  })
  if (!membership) return bad('not_technician')

  // Spent before anything is minted. A failure after this point costs the
  // technician one more text message, which is the safe direction to fail in.
  const burned = await db.technicianLoginCode.updateMany({
    where: { id: candidate.id, usedAt: null },
    data: { usedAt: new Date() },
  })
  if (burned.count === 0) return bad('invalid_code')

  const ctx = await auth.$context
  const session = await ctx.internalAdapter.createSession(technician.userId, false)

  logAudit(
    { userId: technician.userId, organizationId: orgId },
    {
      action: 'auth.technicianCodeSignIn',
      message: 'Signed in to the technician app with a one-time code',
      metadata: { technicianId: technician.id },
    }
  ).catch(() => {
    /* best-effort, as everywhere else */
  })

  return NextResponse.json({
    data: { token: session.token, organizationId: orgId },
  })
}

/**
 * Turns whoever the caller says they are into a technician of this workshop.
 *
 * Org-scoped like everything else here, so an identifier is never a question
 * asked of the whole platform.
 */
async function resolveTechnician(
  organizationId: string,
  channel: 'sms' | 'email',
  identifier: string
): Promise<string | null> {
  if (channel === 'email') {
    const found = await db.technician.findFirst({
      where: { organizationId, isActive: true, userId: { not: null }, user: { email: identifier } },
      select: { id: true },
    })
    return found?.id ?? null
  }

  const e164 = await normalizeOrgPhone(organizationId, identifier)
  if (!e164) return null

  const candidates = await db.technician.findMany({
    where: {
      organizationId,
      isActive: true,
      userId: { not: null },
      user: { phone: { not: null } },
    },
    select: { id: true, user: { select: { phone: true } } },
  })
  const matches = await Promise.all(
    candidates.map(async (t) => ({
      id: t.id,
      e164: t.user?.phone ? await normalizeOrgPhone(organizationId, t.user.phone) : null,
    }))
  )
  return matches.find((m) => m.e164 === e164)?.id ?? null
}

/**
 * Compares two hex digests without giving away where they start to differ.
 *
 * Overkill against a six digit code guessed over a network, and free.
 */
function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  return timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'))
}

function bad(code: string) {
  return NextResponse.json({ error: { code } }, { status: 400 })
}
