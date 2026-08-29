import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { hashSetupCode, normalizeSetupCode } from '@/features/team/Lib/appSetupCode'
import { logAudit } from '@/lib/audit'
import { rateLimit } from '@/lib/rate-limit'

/**
 * Exchanges a one-time setup code for a session, so a technician's phone can
 * join a workshop without typing a URL or a password.
 *
 * Unauthenticated by necessity: the phone has nothing to authenticate with
 * yet, which is the entire problem being solved. That makes this the one
 * endpoint on the tech API that anybody on the internet can reach with a
 * guess, so it is rate limited harder than anything else and says as little
 * as it can get away with.
 */

/** Deliberately tight. Nobody types a code five times in a minute by hand, and
 * an attacker guessing at 6.5e11 possibilities needs rather more than that. */
const LIMIT = { limit: 5, windowMs: 60_000 }

export async function POST(request: Request) {
  const limited = rateLimit(request, LIMIT)
  if (limited) return limited

  let code: string
  try {
    const body = (await request.json()) as { code?: unknown }
    code = normalizeSetupCode(typeof body.code === 'string' ? body.code : '')
  } catch {
    return bad('invalid_code')
  }

  if (!code) return bad('invalid_code')

  const record = await db.technicianSetupCode.findUnique({
    where: { codeHash: hashSetupCode(code) },
    select: {
      id: true,
      userId: true,
      organizationId: true,
      expiresAt: true,
      usedAt: true,
      organization: { select: { name: true } },
    },
  })

  // Three different answers, because they need three different actions from
  // the person holding the phone: ask for a new one, ask for a new one, or
  // check what they typed. None of them says whether a code exists for
  // somebody else, which is the only thing worth hiding here.
  if (!record) return bad('invalid_code')
  if (record.usedAt) return bad('code_used')
  if (record.expiresAt.getTime() < Date.now()) return bad('code_expired')

  // Still a technician, still in the workshop. A code issued this morning
  // should not sign somebody in this afternoon if they were removed in
  // between, and checking at redemption is the only moment that can catch it.
  const technician = await db.technician.findFirst({
    where: { userId: record.userId, organizationId: record.organizationId, isActive: true },
    select: { id: true },
  })
  if (!technician) return bad('not_technician')

  // Burn it first. If the session mint below fails, the code is still spent,
  // which is the safe direction to fail in: the desk issues another one.
  const burned = await db.technicianSetupCode.updateMany({
    where: { id: record.id, usedAt: null },
    data: { usedAt: new Date() },
  })
  // Two phones scanning the same screen at once. Exactly one of them wins.
  if (burned.count === 0) return bad('code_used')

  const ctx = await auth.$context
  const session = await ctx.internalAdapter.createSession(record.userId, false)

  logAudit(
    { userId: record.userId, organizationId: record.organizationId },
    {
      action: 'auth.appSetupRedeemed',
      message: 'Signed in to the technician app with a setup code',
      metadata: { technicianId: technician.id },
    }
  ).catch(() => {
    /* best-effort, as everywhere else */
  })

  return NextResponse.json({
    data: {
      token: session.token,
      organizationId: record.organizationId,
      workshop: record.organization.name,
    },
  })
}

function bad(code: string) {
  // 400 rather than 401 throughout: there is no credential to re-present, so
  // nothing here is a challenge to authenticate.
  return NextResponse.json({ error: { code } }, { status: 400 })
}
