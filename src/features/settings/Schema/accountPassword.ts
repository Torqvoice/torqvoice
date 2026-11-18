import { z } from 'zod'

/** Better Auth's own limits (its defaults; `src/lib/auth.ts` sets neither). */
export const PASSWORD_MIN_LENGTH = 8
export const PASSWORD_MAX_LENGTH = 128

export const setAccountPasswordSchema = z.object({
  newPassword: z.string().min(PASSWORD_MIN_LENGTH).max(PASSWORD_MAX_LENGTH),
})

/**
 * What `setAccountPassword` refuses with when the account turns out to have a
 * password after all (set in another tab, say). The account page reads it to
 * switch to the change form instead of showing an error.
 */
export const ACCOUNT_HAS_PASSWORD = 'This account already has a password.'
