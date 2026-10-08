import 'server-only'
import { headers } from 'next/headers'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { getCachedSession } from '@/lib/cached-session'
import { db } from '@/lib/db'
import { REAUTH_ERRORS, REAUTH_FRESH_SESSION_MINUTES, type ReauthRequirement } from '@/lib/reauth'

/**
 * Proof that the person at the keyboard is the account holder, asked for
 * before the few actions that cannot be undone (deleting the account, deleting
 * a workshop). A session alone is not that proof: it can be a laptop left open
 * at the counter, or a cookie somebody else got hold of, and before this one
 * call from either took the owner, the workshop and every file with it.
 */

export const reauthInputSchema = z.object({
  password: z.string().max(1024).optional(),
  totpCode: z.string().max(32).optional(),
})

export type ReauthInput = z.infer<typeof reauthInputSchema>

/** The account's password hash, or null when it has none (Google or passkey only). */
async function passwordHash(userId: string): Promise<string | null> {
  const account = await db.account.findFirst({
    where: { userId, providerId: 'credential' },
    select: { password: true },
  })
  return account?.password || null
}

/** What this account is asked for; the dialogs read it to show the right field. */
export async function reauthRequirement(userId: string): Promise<ReauthRequirement> {
  if (await passwordHash(userId)) return 'password'
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { twoFactorEnabled: true },
  })
  return user?.twoFactorEnabled ? 'totp' : 'none'
}

/**
 * Wrong answers per account before it has to wait. Without a limit a hijacked
 * session could guess the password, or all million TOTP codes, through these
 * actions, which do not pass the sign-in route's rate limit. In memory and on
 * globalThis like the other per-process state: one server, and a restart
 * giving a guesser a fresh budget of five is not worth a table.
 */
const FAILURE_LIMIT = 5
const FAILURE_WINDOW_MS = 15 * 60_000

const globalForReauth = globalThis as unknown as {
  reauthFailures?: Map<string, { count: number; resetAt: number }>
}
const failures = (globalForReauth.reauthFailures ??= new Map())

function assertNotLocked(userId: string, now: number) {
  const entry = failures.get(userId)
  if (entry && entry.resetAt > now && entry.count >= FAILURE_LIMIT) {
    throw new Error(REAUTH_ERRORS.tooManyAttempts)
  }
}

function fail(userId: string, now: number, message: string): never {
  const entry = failures.get(userId)
  if (!entry || entry.resetAt <= now) {
    failures.set(userId, { count: 1, resetAt: now + FAILURE_WINDOW_MS })
  } else {
    entry.count += 1
  }
  throw new Error(message)
}

/** Forgets the failures counted against an account; for tests. */
export function resetReauthFailures() {
  failures.clear()
}

/**
 * Throws unless the caller proved who they are just now:
 *
 * - an account with a password must give it;
 * - one without a password but with two-factor on must give a current code
 *   from the authenticator app;
 * - one with neither (Google or passkey only) has nothing to type, so the
 *   session itself must have been created in the last
 *   REAUTH_FRESH_SESSION_MINUTES: signing in again is the proof.
 *
 * `purpose` only picks the sentence for a stale session.
 */
export async function verifyReauth(
  userId: string,
  input: unknown,
  purpose: 'account' | 'workshop',
  now: number = Date.now()
): Promise<void> {
  const { password, totpCode } = reauthInputSchema.parse(input ?? {})
  assertNotLocked(userId, now)

  const hash = await passwordHash(userId)
  if (hash) {
    if (!password) throw new Error(REAUTH_ERRORS.wrongPassword)
    const ctx = await auth.$context
    const valid = await ctx.password.verify({ hash, password }).catch(() => false)
    if (!valid) fail(userId, now, REAUTH_ERRORS.wrongPassword)
    failures.delete(userId)
    return
  }

  const user = await db.user.findUnique({
    where: { id: userId },
    select: { twoFactorEnabled: true },
  })
  if (user?.twoFactorEnabled) {
    const code = totpCode?.replace(/\s+/g, '')
    if (!code) throw new Error(REAUTH_ERRORS.wrongCode)
    // Better Auth's own check, against the caller's session: it decrypts the
    // stored secret and allows the usual one-step clock drift.
    const ok = await auth.api
      .verifyTOTP({ body: { code }, headers: await headers() })
      .then(() => true)
      .catch(() => false)
    if (!ok) fail(userId, now, REAUTH_ERRORS.wrongCode)
    failures.delete(userId)
    return
  }

  const session = await getCachedSession()
  const createdAt = session?.user?.id === userId ? session.session.createdAt : null
  const age = createdAt ? now - new Date(createdAt).getTime() : Number.POSITIVE_INFINITY
  if (!(age <= REAUTH_FRESH_SESSION_MINUTES * 60_000)) {
    throw new Error(
      purpose === 'account' ? REAUTH_ERRORS.signInAgainAccount : REAUTH_ERRORS.signInAgainWorkshop
    )
  }
}
