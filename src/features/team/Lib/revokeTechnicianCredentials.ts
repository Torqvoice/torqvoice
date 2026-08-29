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
  userId: string | null
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

  // Only where this person is a member of nowhere else. Somebody covering two
  // branches of a chain should not be signed out of the other one because this
  // branch let them go.
  const elsewhere = await db.organizationMember.count({
    where: { userId, organizationId: { not: organizationId } },
  })

  if (elsewhere === 0) {
    const ctx = await auth.$context
    const sessions = await db.session.findMany({ where: { userId }, select: { token: true } })
    // Through Better Auth rather than a raw delete, so its own caches let go
    // of them too.
    await Promise.all(
      sessions.map((s) => ctx.internalAdapter.deleteSession(s.token).catch(() => undefined))
    )
  }

  await db.pushDevice.updateMany({
    where: { userId, organizationId },
    data: { isActive: false },
  })
}
