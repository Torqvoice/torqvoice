'use server'

import { db } from '@/lib/db'
import { withAuth } from '@/lib/with-auth'
import { PermissionAction, PermissionSubject } from '@/lib/permissions'
import { z } from 'zod'
import crypto from 'crypto'
import { demoGuard } from '@/lib/demo'
import { emailVerificationRequired } from '@/lib/email-verification-policy'

const updateEmailSchema = z.object({
  email: z.string().email('Invalid email address'),
})

/**
 * Changes the account's email. The only action that does.
 *
 * Where the install requires verification, this sends a confirmation link
 * to the NEW address and nothing changes until it is opened. Where it does
 * not, the address changes at once. There used to be a second action for
 * the second case, and the page chose between them: the choice lived in the
 * page, so the instant action answered anybody on any install, and an
 * address nobody had proved could be claimed ahead of the person it belongs
 * to and then invited into their workshop. Now the server reads the setting.
 *
 * Security:
 * - Random opaque token in URL (no user data leaked)
 * - Token hash stored in DB (DB compromise doesn't expose valid tokens)
 * - Timing-safe comparison on verification
 * - Upsert by userId ensures only one pending change per user
 */
export async function requestEmailChange(data: { email: string }) {
  return withAuth(
    async ({ userId }) => {
      demoGuard()
      const parsed = updateEmailSchema.parse(data)

      const existing = await db.user.findFirst({
        where: { email: parsed.email, NOT: { id: userId } },
      })

      if (existing) {
        throw new Error('Email is already in use')
      }

      const user = await db.user.findUnique({
        where: { id: userId },
        select: { name: true, email: true },
      })

      if (!user) throw new Error('User not found')

      const { sendAccountMail } = await import('@/lib/account-mail')

      // An install that does not require verification changes the address
      // at once, as the admin chose; there may be no mail server to send a
      // link through. The current address is still told, when mail works.
      if (!(await emailVerificationRequired())) {
        await db.user.update({
          where: { id: userId },
          data: { email: parsed.email, emailVerified: false },
        })
        if (user.email && user.email !== parsed.email) {
          await sendAccountMail({
            to: user.email,
            subject: 'Your Torqvoice email was changed',
            name: user.name,
            paragraphs: [
              'Your Torqvoice account has moved to a different email address. This address no longer signs in to it.',
            ],
            notes: [
              'If this was you, there is nothing to do.',
              'If it was not, contact your workshop owner or support straight away.',
            ],
          }).catch(() => undefined)
        }
        return { sent: false, email: parsed.email }
      }

      // Generate a cryptographically random token
      const token = crypto.randomBytes(32).toString('hex')

      // Store hash of token (so DB leak doesn't expose valid tokens)
      const tokenHash = crypto.createHash('sha256').update(token).digest('hex')

      // Store: identifier for upsert (one pending change per user), value contains hash + email
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours
      await db.verification.upsert({
        where: { identifier: `email-change:${userId}` },
        create: {
          identifier: `email-change:${userId}`,
          value: JSON.stringify({ tokenHash, email: parsed.email }),
          expiresAt,
        },
        update: {
          value: JSON.stringify({ tokenHash, email: parsed.email }),
          expiresAt,
        },
      })

      // URL contains only the opaque token and userId (no email leaked)
      const baseURL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
      const confirmUrl = `${baseURL}/api/public/confirm-email-change?token=${token}&uid=${userId}`

      await sendAccountMail({
        to: parsed.email,
        subject: 'Confirm your new Torqvoice email',
        name: user.name,
        paragraphs: [
          'You asked to move your Torqvoice account to this email address. Open the link below to confirm it.',
        ],
        link: { text: 'Confirm your new email', url: confirmUrl },
        notes: [
          "If you didn't ask for this, you can ignore this mail and nothing changes.",
          'The link expires in 24 hours.',
        ],
      })

      // The current address hears about it too. Somebody at an unattended
      // screen can ask for the move; the person it belongs to is the one who
      // should find out, before the link is clicked rather than after.
      if (user.email && user.email !== parsed.email) {
        await sendAccountMail({
          to: user.email,
          subject: 'A change to your Torqvoice email was requested',
          name: user.name,
          paragraphs: [
            'Somebody signed in to your Torqvoice account asked to move it to a different email address. Nothing changes until the link sent to that address is opened.',
          ],
          notes: [
            'If this was you, there is nothing to do here.',
            'If it was not, change your password now, and sign out of the devices you do not recognise from Settings.',
          ],
        }).catch(() => undefined)
      }

      return { sent: true, email: parsed.email }
    },
    {
      // The email is the account's, and whoever holds it can reset the
      // password: never from a session a workshop minted for a phone.
      accountLevel: true,
      requiredPermissions: [
        { action: PermissionAction.UPDATE, subject: PermissionSubject.SETTINGS },
      ],
    }
  )
}
