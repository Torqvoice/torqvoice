import { auth } from '@/lib/auth'
import { db } from '@/lib/db'

/**
 * Cutting somebody's phone off, wherever they were removed from.
 *
 * Deactivating the technician row is most of it, because every request through
 * the technician API re-reads it. But the session outlives the row: the token
 * on the phone stays a real session, and reinstating them months later would
 * bring it back to life. A setup code sent to a mistyped number has the same
 * shape.
 *
 * So four things go together, and each is on the list for its own reason:
 *
 *   - their sessions, so the token in a pocket stops being one
 *   - unredeemed setup codes, so nothing outstanding can still be used
 *   - unredeemed sign-in codes, for the same reason
 *   - their push devices, so the wrong phone stops being told about jobs
 *
 * The technician row itself is somebody else's job. See setTechnicianStanding.
 */
export async function revokeTechnicianCredentials(
  organizationId: string,
  userId: string | null,
  options: {
    /**
     * The session doing the revoking, when it belongs to the same person.
     * Somebody signing their own phone out from the team page is not asking
     * to be signed out of the browser they are pressing the button in.
     */
    keepSessionToken?: string | null
  } = {}
): Promise<void> {
  if (!userId) return

  const technicians = await db.technician.findMany({
    where: { userId, organizationId },
    select: { id: true },
  })

  await db.$transaction([
    db.technicianLoginCode.deleteMany({
      where: { technicianId: { in: technicians.map((t) => t.id) } },
    }),
    db.technicianSetupCode.deleteMany({ where: { organizationId, userId } }),
  ])

  // Every session only where this person is a member of nowhere else.
  // Somebody covering two branches of a chain should not be signed out of the
  // other one because this branch let them go. The sessions this workshop
  // minted for a phone (lib/session-scope.ts) are its own, though, and good
  // for nothing anywhere else, so those end either way.
  const elsewhere = await db.organizationMember.count({
    where: { userId, organizationId: { not: organizationId } },
  })

  const ctx = await auth.$context
  const sessions = await db.session.findMany({
    where: elsewhere === 0 ? { userId } : { userId, organizationId },
    select: { token: true, organizationId: true },
  })
  // Through Better Auth rather than a raw delete, so its own caches let go
  // of them too. The one pressing the button is spared, unless it is itself
  // a session this workshop minted for a phone, which is exactly what is
  // being revoked.
  const keep = options.keepSessionToken
  await Promise.all(
    sessions
      .filter((s) => !(keep && s.token === keep && s.organizationId !== organizationId))
      .map((s) => ctx.internalAdapter.deleteSession(s.token).catch(() => undefined))
  )

  await db.pushDevice.updateMany({
    where: { userId, organizationId },
    data: { isActive: false },
  })
}
