/**
 * better-auth endpoints the public demo refuses.
 *
 * They are reached straight from the browser, past every server action, so
 * `demoGuard()` never sees them. The demo has one account that every visitor
 * signs in as; each endpoint here either changes that account for everybody,
 * reaches the other visitors' sessions, or sends mail. Sign-in, sign-out and
 * get-session are not here: without them there is no demo.
 *
 * Paths are better-auth 1.6's, under this app's `/api/public/auth` base. A
 * prefix covers what hangs under it (`/delete-user/callback`,
 * `/reset-password/:token`, every `/two-factor/...` and `/passkey/...`).
 */
const AUTH_BASE = '/api/public/auth'

const DEMO_BLOCKED_AUTH_PATHS = [
  // Locking the account: a new password, a second factor or a passkey on it
  // would keep everybody else out until the next reset.
  '/change-password',
  '/set-password',
  '/request-password-reset',
  '/reset-password',
  '/two-factor',
  '/passkey',
  // The account itself: its name and address are what every visitor sees,
  // and deleting it ends the demo.
  '/update-user',
  '/change-email',
  '/delete-user',
  '/send-verification-email',
  // Accounts linked to it at another provider, and their tokens.
  '/link-social',
  '/unlink-account',
  '/list-accounts',
  '/account-info',
  '/get-access-token',
  '/refresh-token',
  // The other visitors' sessions: listing them hands out their addresses and
  // browsers, and revoking them signs strangers out.
  '/list-sessions',
  '/revoke-session',
  '/revoke-sessions',
  '/revoke-other-sessions',
].map((path) => `${AUTH_BASE}${path}`)

/** Whether the demo refuses this better-auth request path, whatever its method. */
export function isDemoBlockedAuthPath(pathname: string): boolean {
  return DEMO_BLOCKED_AUTH_PATHS.some(
    (blocked) => pathname === blocked || pathname.startsWith(`${blocked}/`)
  )
}
