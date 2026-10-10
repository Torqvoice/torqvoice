/**
 * What the delete-account and delete-workshop dialogs ask for before the
 * server will go ahead, and the sentences it refuses with. Shared by the
 * server check (reauth.server.ts) and the dialogs, which show the refusal in
 * the person's own language by looking its key up here.
 *
 * - 'password': the account has a password, and must type it.
 * - 'totp': no password, but two-factor is on: a code from the app.
 * - 'none': neither (Google or passkey only), so the session itself must be
 *   fresh, see REAUTH_FRESH_SESSION_MINUTES.
 */
export type ReauthRequirement = 'password' | 'totp' | 'none'

/** How recent a sign-in must be when there is nothing else to ask for. */
export const REAUTH_FRESH_SESSION_MINUTES = 10

export const REAUTH_ERRORS = {
  wrongPassword: 'Wrong password.',
  wrongCode: 'Wrong code.',
  tooManyAttempts: 'Too many attempts. Wait a few minutes and try again.',
  signInAgainAccount: 'Sign in again before deleting your account.',
  signInAgainWorkshop: 'Sign in again before deleting the workshop.',
} as const

export type ReauthError = keyof typeof REAUTH_ERRORS

/** The `settings` message key for a refusal above, or null for any other error. */
export function reauthErrorMessageKey(message: string | undefined): string | null {
  const match = (Object.keys(REAUTH_ERRORS) as ReauthError[]).find(
    (key) => REAUTH_ERRORS[key] === message
  )
  if (!match) return null
  return `account.reauth${match.charAt(0).toUpperCase()}${match.slice(1)}`
}
