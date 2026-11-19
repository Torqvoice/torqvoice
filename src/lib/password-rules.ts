/**
 * What the server accepts as a new password, in one place for every form
 * that sets one.
 *
 * These are Better Auth's own limits: `src/lib/auth.ts` sets neither
 * `minPasswordLength` nor `maxPasswordLength`, so its defaults of 8 and 128
 * apply to sign-up, reset, change and set password alike. Better Auth
 * measures with `password.length`, and so does this file. There are no
 * other rules (no character classes, no strength score); the forms say
 * exactly this and nothing more.
 */
export const PASSWORD_MIN_LENGTH = 8
export const PASSWORD_MAX_LENGTH = 128

export type PasswordCheck =
  | { status: 'empty' }
  | { status: 'tooShort'; remaining: number }
  | { status: 'tooLong'; over: number }
  | { status: 'ok' }

export function checkPassword(password: string): PasswordCheck {
  if (password.length === 0) return { status: 'empty' }
  if (password.length < PASSWORD_MIN_LENGTH) {
    return { status: 'tooShort', remaining: PASSWORD_MIN_LENGTH - password.length }
  }
  if (password.length > PASSWORD_MAX_LENGTH) {
    return { status: 'tooLong', over: password.length - PASSWORD_MAX_LENGTH }
  }
  return { status: 'ok' }
}
