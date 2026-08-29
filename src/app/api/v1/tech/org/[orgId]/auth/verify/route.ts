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

/**
 * Turns a code into a session.
 *
 * Scoped to the organisation in the path throughout, so a code issued by one
 * workshop cannot be presented to another even if the same person works at
 * both. The technician is re-read at this moment rather than trusted from
 * when the code was sent: somebody deactivated in between must not get in.
 */

export async function POST(request: Request, { params }: { params: Promise<{ orgId: string }> }) {
  const limited = rateLimit(request, { limit: 10, windowMs: 60_000 })
  if (limited) return limited

  const { orgId } = await params

  let code: string
  try {
    const body = (await request.json()) as { code?: unknown }
    code = normalizeLoginCode(typeof body.code === 'string' ? body.code : '')
  } catch {
    return bad('invalid_code')
  }
  if (code.length !== 6) return bad('invalid_code')

  // Every live code in this workshop, matched by hash. Small by construction:
  // one per technician, and only for the few minutes each lasts.
  const candidate = await db.technicianLoginCode.findFirst({
    where: {
      organizationId: orgId,
      usedAt: null,
      codeHash: hashLoginCode(code),
    },
    select: {
      id: true,
      expiresAt: true,
      attempts: true,
      technician: {
        select: { id: true, isActive: true, userId: true, organizationId: true },
      },
    },
  })

  if (!candidate) {
    // A wrong guess has to cost something, or the attempt limit protects only
    // the code somebody happened to hit. Every live code in the workshop ages
    // by one.
    await db.technicianLoginCode.updateMany({
      where: { organizationId: orgId, usedAt: null, expiresAt: { gt: new Date() } },
      data: { attempts: { increment: 1 } },
    })
    await db.technicianLoginCode.deleteMany({
      where: { organizationId: orgId, attempts: { gte: MAX_ATTEMPTS } },
    })
    return bad('invalid_code')
  }

  if (candidate.expiresAt.getTime() < Date.now()) return bad('code_expired')
  if (candidate.attempts >= MAX_ATTEMPTS) return bad('too_many_attempts')

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

function bad(code: string) {
  return NextResponse.json({ error: { code } }, { status: 400 })
}
