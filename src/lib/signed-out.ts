import { safeRedirectPath } from './safe-redirect'

/**
 * How long after the last keystroke a tab that has lost its session still
 * waits for the person instead of leaving for the sign-in page. Someone typing
 * a note would lose it to a page change, so they are told and choose; an idle
 * tab goes straight to sign-in.
 */
export const RECENT_INPUT_MS = 60 * 1000

/** The sign-in page, set to come back to the page this tab is on. */
export function signInUrlFor(pathname: string, search = ''): string {
  const target = safeRedirectPath(`${pathname}${search}`)
  return target === '/' ? '/auth/sign-in' : `/auth/sign-in?redirect=${encodeURIComponent(target)}`
}

/** Whether a tab that has lost its session should leave for sign-in right away. */
export function leaveForSignInNow(lastInputAt: number, now: number): boolean {
  return now - lastInputAt > RECENT_INPUT_MS
}

/**
 * The two-factor page, carrying on the sign-in page's `redirect` so that a
 * person who signs in with a code still lands where they were heading.
 */
export function twoFactorUrlFor(signInSearch: string): string {
  const target = safeRedirectPath(new URLSearchParams(signInSearch).get('redirect'))
  return target === '/'
    ? '/auth/verify-2fa'
    : `/auth/verify-2fa?redirect=${encodeURIComponent(target)}`
}
