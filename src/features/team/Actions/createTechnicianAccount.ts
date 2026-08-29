'use server'

import { randomUUID } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { db } from '@/lib/db'
import { notificationBus } from '@/lib/notification-bus'
import { PermissionAction, PermissionSubject } from '@/lib/permissions'
import { normalizeOrgPhone } from '@/lib/sms'
import { withAuth } from '@/lib/with-auth'

/**
 * Creates a mechanic's account outright, at the counter, in one step.
 *
 * The invite flow was built for the person who buys the product: an email
 * arrives, they choose a password, they accept. Every one of those steps
 * assumes an email address the shop does not have and a wait the desk cannot
 * control. Onboarding five mechanics that way is five emails, an unknown
 * delay, and a second pass through the team page days later.
 *
 * So this makes the account directly. A name and a mobile number, which is
 * everything a workshop actually knows about someone on their first morning.
 * No email, no password, no acceptance step, no waiting.
 *
 * What they get is an ordinary account with an ordinary membership, so
 * promotion later is adding an email and changing a role rather than starting
 * again. Nothing here is a lesser kind of user.
 */

const schema = z.object({
  name: z.string().trim().min(1).max(120),
  phone: z.string().trim().min(3).max(40),
  /** Optional from the start, for a mechanic who does have one. */
  email: z.string().trim().email().optional().or(z.literal('')),
})

export async function createTechnicianAccount(input: unknown) {
  return withAuth(
    async ({ organizationId }) => {
      const { name, phone, email } = schema.parse(input)

      const e164 = await normalizeOrgPhone(organizationId, phone)
      if (!e164) {
        throw new Error('That does not look like a mobile number this workshop can reach.')
      }

      // Already here, under this number? Adding them twice gives one person
      // two accounts and their hours end up split between them.
      const existing = await db.technician.findFirst({
        where: { organizationId, userId: { not: null }, user: { phone: e164 } },
        select: { name: true },
      })
      if (existing) {
        throw new Error(`${existing.name} already uses that number at this workshop.`)
      }

      if (email) {
        const taken = await db.user.findUnique({ where: { email }, select: { id: true } })
        if (taken) {
          throw new Error('Someone already has an account with that email. Invite them instead.')
        }
      }

      const technician = await db.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: {
            name,
            phone: e164,
            // An address is required and unique, and a mechanic set up at the
            // counter has none. This one is unroutable on purpose: it exists
            // so the row is valid and is never shown to anybody. Giving them a
            // real one later is what promotion looks like.
            email: email || `tech-${randomUUID()}@technician.torqvoice.invalid`,
            // Nothing was sent anywhere, so nothing has been verified. The one
            // thing that proves this number is theirs is the first sign-in
            // code arriving on it.
            emailVerified: false,
          },
          select: { id: true },
        })

        await tx.organizationMember.create({
          data: {
            userId: user.id,
            organizationId,
            role: 'member',
            // No custom role, which since the permission fix means no access
            // to anything in the web app. The technician API is gated on the
            // technician record below, not on permissions, so the app works
            // and the office does not open up.
            roleId: null,
          },
        })

        const maxOrder = await tx.technician.aggregate({
          where: { organizationId },
          _max: { sortOrder: true },
        })

        return tx.technician.create({
          data: {
            name,
            userId: user.id,
            organizationId,
            sortOrder: (maxOrder._max.sortOrder ?? -1) + 1,
          },
        })
      })

      notificationBus.emit('workboard', {
        type: 'technician_created',
        organizationId,
        technician,
      })
      revalidatePath('/settings/team')
      revalidatePath('/work-board')

      return { technicianId: technician.id, userId: technician.userId as string, name }
    },
    {
      requiredPermissions: [
        { action: PermissionAction.MANAGE, subject: PermissionSubject.SETTINGS },
      ],
      audit: ({ result }) => ({
        action: 'team.createTechnicianAccount',
        message: 'Created a technician account',
        metadata: { technicianId: result.technicianId, name: result.name },
      }),
    }
  )
}
