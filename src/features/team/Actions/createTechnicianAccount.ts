'use server'

import { randomUUID } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { db } from '@/lib/db'
import { notificationBus } from '@/lib/notification-bus'
import { PermissionAction, PermissionSubject } from '@/lib/permissions'
import { normalizeOrgPhone } from '@/lib/sms'
import { withAuth } from '@/lib/with-auth'
import { ensureTechnicianRole, PLACEHOLDER_EMAIL_DOMAIN } from '../Lib/technicianRole'
import { revokeTechnicianCredentials } from '../Lib/revokeTechnicianCredentials'

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
  /**
   * What to do when somebody here already holds that number.
   *
   * Absent, this reports the clash and does nothing, so the desk can decide.
   * Refusing outright was a dead end: a workshop with a recycled number or a
   * mechanic whose name was typed differently had no way forward at all, and
   * an onboarding screen that can trap somebody is worse than one that asks a
   * question.
   */
  resolve: z.enum(['reuse', 'takeover']).optional(),
})

export async function createTechnicianAccount(input: unknown) {
  return withAuth(
    async ({ organizationId }) => {
      const { name, phone, email, resolve } = schema.parse(input)

      const e164 = await normalizeOrgPhone(organizationId, phone)
      if (!e164) {
        throw new Error('That does not look like a mobile number this workshop can reach.')
      }

      /**
       * Somebody who has been here before, under this number.
       *
       * Removing a technician deactivates the row rather than deleting it,
       * because past jobs, inspections and clocked hours all point at it. So a
       * mechanic who leaves and comes back is a row that already exists, and
       * refusing them was the same as saying they could never return.
       *
       * Adding a second account instead would be worse: two technicians with
       * one phone number makes the sign-in lookup ambiguous, and splits their
       * hours across two people who are the same person.
       */
      const existing = await db.technician.findFirst({
        where: { organizationId, userId: { not: null }, user: { phone: e164 } },
        select: { id: true, name: true, isActive: true, userId: true },
      })

      // Standing on the board is not the same as belonging to the workshop.
      // A row can be left active with no membership behind it, and somebody
      // who is not a member is not somebody this can refuse on behalf of.
      const stillHere =
        existing?.isActive &&
        (await db.organizationMember.count({
          where: { userId: existing.userId ?? '', organizationId },
        })) > 0

      if (stillHere && existing?.userId) {
        // Reported, not thrown. The desk gets to choose, and the two answers
        // below are the only two that make sense.
        if (!resolve) {
          return {
            conflict: { name: existing.name, userId: existing.userId },
            technicianId: null,
            userId: null,
            name,
            reinstated: false,
          }
        }

        if (resolve === 'reuse') {
          return reinstate(existing.id, existing.userId, organizationId, name, email || null)
        }

        // Takeover. The number moves to the new person and the old record keeps
        // everything it ever did, minus the ability to sign in. Nobody's work
        // is rewritten; somebody's way in is closed.
        await db.user.update({ where: { id: existing.userId }, data: { phone: null } })
        await revokeTechnicianCredentials(organizationId, existing.userId)
        // Falls through to a fresh account below, deliberately. This is a
        // different human, so reusing the row would hang somebody else's jobs
        // and hours off their name.
      } else if (existing?.userId) {
        // Not here any more: deactivated, or left with no membership behind
        // them. Either way this is a homecoming and the row already exists.
        return reinstate(existing.id, existing.userId, organizationId, name, email || null)
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
            email: email || `tech-${randomUUID()}@${PLACEHOLDER_EMAIL_DOMAIN}`,
            // Nothing was sent anywhere, so nothing has been verified. The one
            // thing that proves this number is theirs is the first sign-in
            // code arriving on it.
            emailVerified: false,
          },
          select: { id: true },
        })

        // The role the app actually needs, which is not "none".
        //
        // withApiAuth enforces requiredPermissions exactly as withAuth does, so
        // an account with no role is refused by every screen in the technician
        // app and not merely by the office. See Lib/technicianRole.
        const roleId = await ensureTechnicianRole(tx, organizationId)

        await tx.organizationMember.create({
          data: {
            userId: user.id,
            organizationId,
            role: 'member',
            roleId,
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

      return {
        conflict: null,
        technicianId: technician.id,
        userId: technician.userId as string,
        name,
        reinstated: false,
      }
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

/**
 * Brings a former technician back, rather than making a second of them.
 *
 * Everything they did is still attached to the row being reactivated, so this
 * is a homecoming and not a new hire. Their membership may or may not still
 * exist: deactivating leaves it, removing them from the team page deletes it,
 * and both roads lead here.
 */
async function reinstate(
  technicianId: string,
  userId: string,
  organizationId: string,
  name: string,
  email: string | null
) {
  const technician = await db.$transaction(async (tx) => {
    // A married name, a corrected spelling. Whatever the desk typed now is
    // more current than whatever was typed before.
    await tx.user.update({
      where: { id: userId },
      data: { name, ...(email ? { email } : {}) },
    })

    const roleId = await ensureTechnicianRole(tx, organizationId)
    const membership = await tx.organizationMember.findFirst({
      where: { userId, organizationId },
      select: { id: true, roleId: true },
    })

    if (!membership) {
      await tx.organizationMember.create({
        data: { userId, organizationId, role: 'member', roleId },
      })
    } else if (!membership.roleId) {
      // Left with no role, which since the permission fix means the app would
      // refuse them on every screen.
      await tx.organizationMember.update({ where: { id: membership.id }, data: { roleId } })
    }

    return tx.technician.update({
      where: { id: technicianId },
      data: { isActive: true, name },
    })
  })

  notificationBus.emit('workboard', {
    type: 'technician_updated',
    organizationId,
    technician,
  })
  revalidatePath('/settings/team')
  revalidatePath('/work-board')

  return { conflict: null, technicianId: technician.id, userId, name, reinstated: true }
}
