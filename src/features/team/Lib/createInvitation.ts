import { randomUUID } from 'crypto'
import { sendTemplatedMail } from '@/features/email/Lib/sendTemplatedMail'
import { db } from '@/lib/db'
import type { InvitableRole } from './invitationRules'

export type CreateInvitationInput = {
  organizationId: string
  organizationName: string
  invitedById: string
  email: string
  role: InvitableRole
  roleId?: string
}

/**
 * Records a pending invitation and mails the sign-up link to the invitee.
 *
 * Shared by `sendInvitation` and `inviteMember` so that adding a person who
 * has no account yet behaves the same whichever action the client reached
 * for. Throws with a message fit for the caller's screen; the invitation row
 * is removed again if the mail cannot go out, so a retry is not blocked by
 * the unique constraint.
 */
export async function createAndSendInvitation(input: CreateInvitationInput) {
  const { organizationId, organizationName, invitedById, email, role, roleId } = input

  const existing = await db.teamInvitation.findFirst({
    where: { email, organizationId, status: 'pending' },
  })
  if (existing) throw new Error('An invitation has already been sent to this email')

  // Remove any stale (cancelled/accepted/expired) invitations so the unique
  // constraint doesn't block re-invites.
  await db.teamInvitation.deleteMany({
    where: { email, organizationId, status: { not: 'pending' } },
  })

  // Validate and look up the custom role name if roleId is provided.
  let customRoleName: string | undefined
  if (roleId) {
    const customRole = await db.role.findFirst({
      where: { id: roleId, organizationId },
      select: { name: true },
    })
    if (!customRole) throw new Error('Role not found')
    customRoleName = customRole.name
  }

  const token = randomUUID()
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)

  const invitation = await db.teamInvitation.create({
    data: {
      email,
      role,
      token,
      expiresAt,
      organizationId,
      invitedById,
      roleId,
    },
  })

  try {
    await sendInvitationMail({
      organizationId,
      organizationName,
      email,
      roleLabel: customRoleName || role,
      token,
      invitedById,
      expiresAt,
    })
  } catch {
    // Roll back the invitation record so the admin can retry.
    await db.teamInvitation.delete({ where: { id: invitation.id } })
    throw new Error('Failed to send invitation email. Please try again.')
  }

  return invitation
}

export type InvitationMailInput = {
  organizationId: string
  organizationName: string
  email: string
  roleLabel: string
  token: string
  /** Whoever is inviting; the template can sign off with their name. */
  invitedById?: string | null
  expiresAt?: Date | null
}

/**
 * The sign-up link, mailed from the workshop's own provider through the
 * workshop's template for invitations, so the wording and look are the
 * workshop's to change like every other mail it sends.
 */
export async function sendInvitationMail(input: InvitationMailInput): Promise<void> {
  const { organizationId, email, roleLabel, token, invitedById, expiresAt } = input
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  const inviter = invitedById
    ? await db.user.findUnique({ where: { id: invitedById }, select: { name: true } })
    : null

  await sendTemplatedMail(organizationId, {
    kind: 'team_invitation',
    to: email,
    context: {
      inviteLink: `${baseUrl}/auth/sign-up?invite=${token}`,
      role: roleLabel,
      expiresAt: expiresAt ?? null,
      currentUser: inviter?.name ?? null,
    },
  })
}
