/**
 * Sessions bound to one workshop.
 *
 * A technician's phone can be signed in without a password: the desk issues
 * an app setup code, or the workshop texts a one-time code. Either way it is
 * the workshop vouching for the person, and a workshop can only vouch for
 * itself. So those sessions carry the workshop that minted them
 * (`sessions.organizationId`), and everything that decides which workshop a
 * request acts in reads it before anything the caller says.
 *
 * Without it the token was the person's whole account. An admin who issued a
 * setup code and scanned it themselves could send another workshop's id in
 * `x-org-id` and act there with the technician's role, or change the
 * technician's email and take the account.
 *
 * Ordinary sign-ins carry nothing here and behave exactly as before.
 */

/** What a bound session is told when it reaches for the account. */
export const SCOPED_SESSION_MESSAGE =
  'This sign-in only works in the technician app. Sign in with your password to change your account.'

/** Paths under the auth handler a workshop-bound session may still call. */
const SCOPED_SESSION_AUTH_PATHS = new Set(['/get-session', '/sign-out'])

/**
 * The workshop a session is bound to, or null for an ordinary sign-in.
 *
 * Takes what `auth.api.getSession` returns, which includes the column because
 * it is declared under `session.additionalFields` in `./auth`.
 */
export function sessionOrganizationScope(
  session: { session?: { organizationId?: string | null } | null } | null | undefined
): string | null {
  const scope = session?.session?.organizationId
  return typeof scope === 'string' && scope ? scope : null
}

/**
 * Whether a workshop-bound session may call this auth endpoint.
 *
 * Everything the auth handler offers beyond reading the session and signing
 * out is about the account rather than a workshop: listing the account's
 * other sessions (which hands back their tokens), adding a passkey, changing
 * the password or the name. Any of those turns a session one workshop vouched
 * for into a hold on the whole account, so none of them is open to it.
 */
export function scopedSessionMayCall(path: string | undefined): boolean {
  return path !== undefined && SCOPED_SESSION_AUTH_PATHS.has(path)
}

/**
 * Every session token a request to the auth handler carries, signed or not.
 *
 * Read from both the bearer header and the session cookie, because the bearer
 * plugin turns one into the other only after hooks like ours have run. Used to
 * refuse, never to grant, so the signature is not checked: a forged value can
 * only ever get its sender refused.
 */
export function sessionTokensInHeaders(
  headers: Headers | undefined | null,
  cookieName: string
): string[] {
  if (!headers) return []
  const tokens = new Set<string>()

  const authorization = headers.get('authorization')
  if (authorization?.slice(0, 7).toLowerCase() === 'bearer ') {
    const token = tokenPart(authorization.slice(7).trim())
    if (token) tokens.add(token)
  }

  for (const pair of (headers.get('cookie') ?? '').split(';')) {
    const eq = pair.indexOf('=')
    if (eq < 0) continue
    if (pair.slice(0, eq).trim() !== cookieName) continue
    const token = tokenPart(pair.slice(eq + 1).trim())
    if (token) tokens.add(token)
  }

  return [...tokens]
}

/** A stored token is the part before the signature. */
function tokenPart(value: string): string {
  let decoded = value
  try {
    decoded = decodeURIComponent(value)
  } catch {
    // Not encoded, or badly: either way the raw value is what there is.
  }
  return decoded.split('.')[0] ?? ''
}
