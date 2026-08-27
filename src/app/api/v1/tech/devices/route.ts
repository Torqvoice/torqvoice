import { z } from 'zod'
import { db } from '@/lib/db'
import { apiOk, withApiAuth } from '@/lib/with-api-auth'

/**
 * Registers this phone to receive push, or forgets it.
 *
 * Called on every launch, not just the first: Expo reissues tokens after a
 * reinstall, an OS update, or a restore onto a new handset, and a workshop
 * whose notifications silently stopped is worse off than one that never had
 * them, because nobody goes looking for a thing they believe is working.
 *
 * Registration is an upsert keyed on the token. If the same phone is later
 * signed into by a different technician, the row moves to them: the device is
 * the thing being addressed, and the previous user must stop receiving another
 * person's jobs on a handset they no longer hold.
 */

const registerSchema = z.object({
  token: z.string().min(1).max(256),
  platform: z.enum(['ios', 'android']),
})

export async function POST(request: Request) {
  return withApiAuth(
    request,
    async (ctx) => {
      const { token, platform } = registerSchema.parse(await request.json())

      await db.pushDevice.upsert({
        where: { token },
        create: {
          token,
          platform,
          userId: ctx.userId,
          organizationId: ctx.organizationId,
        },
        update: {
          // Reassigns the device wholesale on a change of hands.
          userId: ctx.userId,
          organizationId: ctx.organizationId,
          platform,
          isActive: true,
          lastSeenAt: new Date(),
        },
      })

      return apiOk({ registered: true })
    },
    { requireTechnician: true, rateLimit: { limit: 30, windowMs: 60_000 } }
  )
}

const forgetSchema = z.object({ token: z.string().min(1).max(256) })

/**
 * Signing out has to stop the notifications too.
 *
 * Scoped to the caller's own rows, so a token cannot be used to unregister
 * somebody else's device by guessing it.
 */
export async function DELETE(request: Request) {
  return withApiAuth(
    request,
    async (ctx) => {
      const { token } = forgetSchema.parse(await request.json())
      await db.pushDevice.deleteMany({ where: { token, userId: ctx.userId } })
      return apiOk({ forgotten: true })
    },
    { rateLimit: { limit: 30, windowMs: 60_000 } }
  )
}
