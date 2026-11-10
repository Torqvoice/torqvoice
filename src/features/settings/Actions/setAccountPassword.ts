'use server'

import { headers } from 'next/headers'
import { isPlaceholderEmail } from '@/features/team/Lib/technicianRole'
import { logAudit } from '@/lib/audit'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { demoGuard } from '@/lib/demo'
import { REAUTH_ERRORS } from '@/lib/reauth'
import { assertRecentSignIn, hasPassword } from '@/lib/reauth.server'
import { withAuth } from '@/lib/with-auth'
import { ACCOUNT_HAS_PASSWORD, setAccountPasswordSchema } from '../Schema/accountPassword'

/**
 * Gives an account that has no password its first one.
 *
 * Someone who signed up with Google has no password, so "change password"
 * has no current one to check and answered "Credential account not found".
 * This is the other door, and it is deliberately narrow:
 *
 * - Only for an account with no password. One that has a password changes it
 *   by proving the current one, which nothing here asks for.
 * - Only straight after signing in. A password is a way into the account that
 *   outlives the session, so a laptop left open at the counter, or a cookie
 *   somebody else got hold of, must not be enough to mint one.
 * - Never from a session a workshop minted for a phone (`accountLevel`).
 * - The account's address is told, the way it is told about a new email.
 */
export async function setAccountPassword(input: { newPassword: string }) {
  return withAuth(
    async ({ userId }) => {
      demoGuard()
      const { newPassword } = setAccountPasswordSchema.parse(input)

      if (await hasPassword(userId)) throw new Error(ACCOUNT_HAS_PASSWORD)
      await assertRecentSignIn(userId, REAUTH_ERRORS.signInAgainPassword)

      await auth.api.setPassword({ body: { newPassword }, headers: await headers() })

      logAudit(
        { userId, organizationId: '' },
        { action: 'auth.passwordSet', message: 'Set a password on the account' }
      ).catch(() => undefined)

      const user = await db.user.findUnique({
        where: { id: userId },
        select: { name: true, email: true },
      })
      if (user?.email && !isPlaceholderEmail(user.email)) {
        const { sendAccountMail } = await import('@/lib/account-mail')
        await sendAccountMail({
          to: user.email,
          subject: 'A password was added to your Torqvoice account',
          name: user.name,
          paragraphs: [
            'A password was just set on your Torqvoice account. You can now sign in with this email address and that password, as well as the way you signed in before.',
          ],
          notes: [
            'If this was you, there is nothing to do.',
            'If it was not, reset your password from the sign-in page now, and sign out of the devices you do not recognise from Settings.',
          ],
        }).catch(() => undefined)
      }

      return { set: true }
    },
    { accountLevel: true }
  )
}
