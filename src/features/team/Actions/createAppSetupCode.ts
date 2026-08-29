'use server'

import { z } from 'zod'
import { db } from '@/lib/db'
import { PermissionAction, PermissionSubject } from '@/lib/permissions'
import { withAuth } from '@/lib/with-auth'
import {
  formatSetupCode,
  generateSetupCode,
  hashSetupCode,
  SETUP_CODE_TTL_MS,
} from '../Lib/appSetupCode'

/**
 * Issues the one-time code that puts a technician's phone onto this workshop.
 *
 * The desk operator and the technician are standing next to each other with
 * the car outside, which is the whole design: the desk shows a QR, the phone
 * reads it, and nobody types a URL or a password.
 *
 * Returns the code in the clear exactly once. Only its hash is stored, so
 * this response is the only chance to show it and there is no way to look it
 * up again afterwards.
 */

const schema = z.object({
  userId: z.string().min(1),
})

export async function createAppSetupCode(input: unknown) {
  return withAuth(
    async ({ organizationId, userId: issuerId }) => {
      const { userId } = schema.parse(input)

      // Only for people already in this workshop, and only for people who can
      // actually use the app. Without the first check this would mint a
      // session for any user id sent to it, which is the whole ballgame.
      const member = await db.organizationMember.findFirst({
        where: { userId, organizationId },
        select: { user: { select: { id: true, name: true, email: true } } },
      })
      if (!member?.user) throw new Error('That person is not a member of this workshop.')

      const technician = await db.technician.findFirst({
        where: { userId, organizationId, isActive: true },
        select: { id: true },
      })
      if (!technician) {
        throw new Error('Mark this person as a technician first, then set up their app.')
      }

      // Any code already outstanding for this person stops working. Issuing a
      // second one usually means the first went astray, and two live codes for
      // one account is one more than anybody intended.
      await db.technicianSetupCode.deleteMany({ where: { userId, organizationId, usedAt: null } })

      const code = generateSetupCode()
      await db.technicianSetupCode.create({
        data: {
          codeHash: hashSetupCode(code),
          expiresAt: new Date(Date.now() + SETUP_CODE_TTL_MS),
          userId,
          organizationId,
          issuedByUserId: issuerId,
        },
      })

      return {
        code,
        display: formatSetupCode(code),
        expiresAt: new Date(Date.now() + SETUP_CODE_TTL_MS).toISOString(),
        name: member.user.name || member.user.email,
      }
    },
    {
      // The same gate as marking somebody a technician: this hands out a way
      // to sign in as them, so it can never be a lesser permission than the
      // one that decides they exist.
      requiredPermissions: [
        { action: PermissionAction.MANAGE, subject: PermissionSubject.SETTINGS },
      ],
      audit: ({ result }) => ({
        action: 'team.createAppSetupCode',
        message: 'Issued an app setup code',
        // Never the code itself. An audit log that records a live credential
        // is a second place to steal it from.
        metadata: { name: result.name, expiresAt: result.expiresAt },
      }),
    }
  )
}

/**
 * Invalidates whatever is outstanding for this person.
 *
 * Closing the dialog calls this, so a code left up on a screen in an empty
 * office stops working when the person who made it walks away.
 */
export async function revokeAppSetupCode(input: unknown) {
  return withAuth(
    async ({ organizationId }) => {
      const { userId } = schema.parse(input)
      const { count } = await db.technicianSetupCode.deleteMany({
        where: { userId, organizationId, usedAt: null },
      })
      return { revoked: count }
    },
    {
      requiredPermissions: [
        { action: PermissionAction.MANAGE, subject: PermissionSubject.SETTINGS },
      ],
    }
  )
}
