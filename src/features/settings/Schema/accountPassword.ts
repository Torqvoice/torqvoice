import { z } from 'zod'
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from '@/lib/password-rules'

export { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH }

export const setAccountPasswordSchema = z.object({
  newPassword: z.string().min(PASSWORD_MIN_LENGTH).max(PASSWORD_MAX_LENGTH),
})

/**
 * What `setAccountPassword` refuses with when the account turns out to have a
 * password after all (set in another tab, say). The account page reads it to
 * switch to the change form instead of showing an error.
 */
export const ACCOUNT_HAS_PASSWORD = 'This account already has a password.'
