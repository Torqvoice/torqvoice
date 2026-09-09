import { randomUUID } from 'crypto'
import { db } from '@/lib/db'
import { sendOrgMail, getOrgFromAddress } from '@/lib/email'
import { escapeHtml } from '@/features/email/Render/escape'
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
}

/** The sign-up link, mailed from the workshop's own provider. */
export async function sendInvitationMail(input: InvitationMailInput): Promise<void> {
  const { organizationId, organizationName, email, roleLabel, token } = input
  const from = await getOrgFromAddress(organizationId)
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  const signupUrl = `${baseUrl}/auth/sign-up?invite=${token}`
  const safeOrg = escapeHtml(organizationName)
  const safeRole = escapeHtml(roleLabel)

  await sendOrgMail(organizationId, {
    from,
    to: email,
    subject: `You've been invited to join ${organizationName} on Torqvoice`,
    html: `
          <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
            <h2>Team Invitation</h2>
            <p>You've been invited to join <strong>${safeOrg}</strong> on Torqvoice as a <strong>${safeRole}</strong>.</p>
            <p>Click the button below to create your account and join the team:</p>
            <div style="margin: 24px 0;">
              <a href="${signupUrl}" style="display: inline-block; padding: 12px 24px; background-color: #171717; color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: 500;">
                Accept Invitation
              </a>
            </div>
            <p style="color: #6b7280; font-size: 14px;">This invitation expires in 7 days.</p>
            <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 16px 0;" />
            <p style="color: #6b7280; font-size: 12px;">
              If the button doesn't work, copy and paste this URL into your browser:<br/>
              <a href="${signupUrl}" style="color: #6b7280;">${signupUrl}</a>
            </p>
          </div>
        `,
  })
}
