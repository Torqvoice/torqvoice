import { db } from '@/lib/db'
import { apiOk, withApiAuth } from '@/lib/with-api-auth'
import { getOpenEntry, loggedMinutes } from '@/features/time-tracking/Lib/timeEntries'
import { MIN_APP_VERSION } from '@/lib/tech-app-version'

/**
 * Who the app is signed in as, which workshop it is looking at, and whether a
 * clock is already running.
 *
 * Called on every launch, so it deliberately answers the three questions the
 * first screen needs in one round trip rather than three. A technician
 * opening the app in a bay with one bar of signal should reach a usable
 * screen on a single request.
 */
export async function GET(request: Request) {
  return withApiAuth(
    request,
    async (ctx) => {
      const [user, organization, technicians] = await Promise.all([
        db.user.findUnique({
          where: { id: ctx.userId },
          select: { id: true, name: true, email: true, image: true },
        }),
        db.organization.findUnique({
          where: { id: ctx.organizationId },
          select: { id: true, name: true },
        }),
        db.technician.findMany({
          where: { organizationId: ctx.organizationId, userId: ctx.userId, isActive: true },
          select: { id: true, name: true, color: true },
        }),
      ])

      const openEntry = await getOpenEntry(ctx.organizationId, ctx.technicianIds)
      // What the job had banked before this stretch, so the running bar counts
      // from the same place the job screen does.
      const banked = openEntry ? await loggedMinutes(openEntry.serviceRecordId) : 0

      return apiOk({
        // Repeated from /health because that one is only read at setup, and a
        // minimum the app never re-checks is a minimum that cannot be raised.
        minAppVersion: MIN_APP_VERSION,
        user,
        organization,
        technicians,
        isTechnician: technicians.length > 0,
        isAdmin: ctx.isAdmin,
        openEntry: openEntry
          ? {
              id: openEntry.id,
              startedAt: openEntry.startedAt,
              serviceRecordId: openEntry.serviceRecordId,
              jobTitle: openEntry.serviceRecord.title,
              loggedMinutes: banked,
            }
          : null,
      })
    },
    // No permission requirement: this endpoint tells the app what it is
    // allowed to do. Gating it on a permission would make an unprivileged
    // account fail at launch with nothing to explain why.
    { rateLimit: { limit: 60, windowMs: 60_000 } }
  )
}
