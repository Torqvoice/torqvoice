'use server'

import { randomUUID } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { db } from '@/lib/db'
import { notificationBus } from '@/lib/notification-bus'
import { normalizeCountryCode } from '@/lib/portal-phone'
import { PermissionAction, PermissionSubject } from '@/lib/permissions'
import { normalizeOrgPhone } from '@/lib/sms'
import { withAuth } from '@/lib/with-auth'
import { ensureTechnicianRole, PLACEHOLDER_EMAIL_DOMAIN } from '../Lib/technicianRole'

/**
 * Turns a name on the board into somebody who can use the app.
 *
 * The board-only technician exists for people who never sign in: an
 * apprentice, a contractor, or a mechanic whose phone the app does not support
 * yet. That last one is temporary by nature, so the way out of it has to
 * exist, and it has to keep everything they have already done.
 *
 * Which is why this attaches an account to the row rather than making a new
 * technician beside it. Every job, inspection, status report and clocked hour
 * points at that row. Starting a second one would split one person in half.
 */

const schema = z.object({
  technicianId: z.string().min(1),
  phone: z.string().trim().min(3).max(40),
  dialCode: z.string().trim().max(6).optional(),
  email: z.string().trim().email().optional().or(z.literal('')),
})

export async function giveTechnicianTheApp(input: unknown) {
  return withAuth(
    async ({ organizationId }) => {
      const { technicianId, phone, dialCode, email } = schema.parse(input)

      const technician = await db.technician.findFirst({
        where: { id: technicianId, organizationId },
        select: { id: true, name: true, userId: true },
      })
      if (!technician) throw new Error('That technician is not part of this workshop.')
      if (technician.userId) {
        throw new Error(`${technician.name} already has an account.`)
      }

      const dial = normalizeCountryCode(dialCode)
      const typedInternational = /^(\+|00)/.test(phone.replace(/[\s()-]/g, ''))
      const e164 = await normalizeOrgPhone(
        organizationId,
        typedInternational || !dial ? phone : `${dial}${phone.replace(/^0+/, '')}`
      )
      if (!e164) {
        throw new Error('That does not look like a mobile number this workshop can reach.')
      }

      // The same number twice in one workshop makes the sign-in lookup
      // ambiguous, so it is refused here as it is everywhere else.
      const taken = await db.technician.findFirst({
        where: {
          organizationId,
          isActive: true,
          userId: { not: null },
          user: { phone: e164 },
        },
        select: { name: true },
      })
      if (taken) throw new Error(`${taken.name} already uses that number at this workshop.`)

      const updated = await db.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: {
            name: technician.name,
            phone: e164,
            // Unroutable by construction. See createTechnicianAccount.
            email: email || `tech-${randomUUID()}@${PLACEHOLDER_EMAIL_DOMAIN}`,
            emailVerified: false,
          },
          select: { id: true },
        })

        await tx.organizationMember.create({
          data: {
            userId: user.id,
            organizationId,
            role: 'member',
            roleId: await ensureTechnicianRole(tx, organizationId),
          },
        })

        // The row they already had, now with somebody behind it.
        return tx.technician.update({
          where: { id: technician.id },
          data: { userId: user.id },
        })
      })

      notificationBus.emit('workboard', {
        type: 'technician_updated',
        organizationId,
        technician: updated,
      })
      revalidatePath('/settings/team')
      revalidatePath('/work-board')

      return {
        technicianId: updated.id,
        userId: updated.userId as string,
        name: technician.name,
      }
    },
    {
      requiredPermissions: [
        { action: PermissionAction.MANAGE, subject: PermissionSubject.SETTINGS },
      ],
      audit: ({ result }) => ({
        action: 'team.giveTechnicianTheApp',
        message: 'Gave a board-only technician an account',
        metadata: { technicianId: result.technicianId, name: result.name },
      }),
    }
  )
}

/** Technicians on the board with nobody behind them, for the team page. */
export async function getStandaloneTechnicians() {
  return withAuth(
    async ({ organizationId }) => {
      return db.technician.findMany({
        where: { organizationId, isActive: true, userId: null },
        select: { id: true, name: true, color: true },
        orderBy: { sortOrder: 'asc' },
      })
    },
    {
      requiredPermissions: [{ action: PermissionAction.READ, subject: PermissionSubject.SETTINGS }],
    }
  )
}
