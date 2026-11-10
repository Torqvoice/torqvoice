/**
 * Giving a Google-only account its first password, on a real PostgreSQL and
 * the real Better Auth (`npm run test:db` with E2E_DATABASE_URL set).
 *
 * The unit tests mock Better Auth, so they cannot say whether the password
 * that was "set" is one the sign-in page accepts: that depends on the row
 * Better Auth writes and the row its sign-in looks for, and a credential row
 * that sign-in cannot find reads as "Invalid email or password" with a
 * perfectly good hash in the database. This runs the action as the account
 * page calls it and then signs in with the result.
 *
 * It makes one person and one workshop of its own and removes them again; it
 * empties nothing.
 */
import { createHmac, randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

const url = process.env.E2E_DATABASE_URL ?? ''
const databaseName = url.split('/').pop()?.split('?')[0]?.toLowerCase() ?? ''
if (url && !/test|e2e/.test(databaseName)) {
  throw new Error(
    `Refusing to use database "${databaseName}": its name must say test or e2e, like the rest of this suite.`
  )
}

// Set before the app's modules load, so the client connects to the test database.
process.env.DATABASE_URL = url
process.env.BETTER_AUTH_SECRET ||= 'db-test-secret-that-is-long-enough-to-sign-with'

/** The request the action believes it is answering. */
const request = vi.hoisted(() => ({ headers: new Headers() }))
const sendAccountMail = vi.hoisted(() => vi.fn(async () => undefined))

vi.mock('next/headers', () => ({
  headers: async () => request.headers,
  cookies: async () => ({ get: () => undefined, delete: () => undefined }),
}))
// No mail server here, and the notice is asserted on instead.
vi.mock('@/lib/account-mail', () => ({ sendAccountMail }))

const stamp = randomUUID().slice(0, 8)
const EMAIL = `google-only-${stamp}@example.com`
const FIRST_PASSWORD = `First-pass-${stamp}`
const SECOND_PASSWORD = `Second-pass-${stamp}`

let db: typeof import('@/lib/db')['db']
let auth: typeof import('@/lib/auth')['auth']
let setAccountPassword: typeof import('@/features/settings/Actions/setAccountPassword')['setAccountPassword']
let REAUTH_ERRORS: typeof import('@/lib/reauth')['REAUTH_ERRORS']
let ACCOUNT_HAS_PASSWORD: string

let userId = ''
let organizationId = ''
let sessionId = ''

/** Moves the sign-in back in time, the way a tab left open ages. */
async function signedInMinutesAgo(minutes: number) {
  await db.session.update({
    where: { id: sessionId },
    data: { createdAt: new Date(Date.now() - minutes * 60_000) },
  })
}

async function providers(): Promise<string[]> {
  const rows = await db.account.findMany({ where: { userId }, select: { providerId: true } })
  return rows.map((r) => r.providerId).sort()
}

async function canSignInWith(password: string): Promise<boolean> {
  return auth.api
    .signInEmail({ body: { email: EMAIL, password } })
    .then((result) => result.user.id === userId)
    .catch(() => false)
}

beforeAll(async () => {
  if (!url) throw new Error('E2E_DATABASE_URL is not set')
  ;({ db } = await import('@/lib/db'))
  ;({ auth } = await import('@/lib/auth'))
  ;({ setAccountPassword } = await import('@/features/settings/Actions/setAccountPassword'))
  ;({ REAUTH_ERRORS } = await import('@/lib/reauth'))
  ;({ ACCOUNT_HAS_PASSWORD } = await import('@/features/settings/Schema/accountPassword'))

  // What a first "Continue with Google" leaves behind: a person, and one
  // account row that says Google vouches for them. No credential row.
  const ctx = await auth.$context
  const user = await db.user.create({
    data: { email: EMAIL, name: 'Google Only', emailVerified: true },
  })
  userId = user.id
  await ctx.internalAdapter.linkAccount({
    userId,
    providerId: 'google',
    accountId: `google-sub-${stamp}`,
  })

  const organization = await db.organization.create({
    data: { name: `Set Password Garage ${stamp}` },
  })
  organizationId = organization.id
  await db.organizationMember.create({ data: { userId, organizationId, role: 'owner' } })

  // Signed in, as the browser would be after Google sent them back.
  const session = await ctx.internalAdapter.createSession(userId)
  sessionId = session.id
  const signature = createHmac('sha256', ctx.secret).update(session.token).digest('base64')
  const cookie = `${ctx.authCookies.sessionToken.name}=${encodeURIComponent(`${session.token}.${signature}`)}`
  request.headers = new Headers({ cookie })
})

afterAll(async () => {
  if (!db) return
  if (organizationId) await db.organization.deleteMany({ where: { id: organizationId } })
  if (userId) await db.user.deleteMany({ where: { id: userId } })
})

describe('an account that signed up with Google', () => {
  it('is signed in, and has no password to change', async () => {
    const session = await auth.api.getSession({ headers: request.headers })
    expect(session?.user.id).toBe(userId)
    expect(await providers()).toEqual(['google'])

    // What the Change password card ran into
    await expect(
      auth.api.changePassword({
        body: { currentPassword: 'anything-at-all', newPassword: FIRST_PASSWORD },
        headers: request.headers,
      })
    ).rejects.toThrow('Credential account not found')
  })

  it('is not given a password on a sign-in from earlier in the day', async () => {
    await signedInMinutesAgo(11)

    const result = await setAccountPassword({ newPassword: FIRST_PASSWORD })

    expect(result).toMatchObject({ success: false, error: REAUTH_ERRORS.signInAgainPassword })
    expect(await providers()).toEqual(['google'])
    expect(await canSignInWith(FIRST_PASSWORD)).toBe(false)
    expect(sendAccountMail).not.toHaveBeenCalled()
  })

  it('sets a password straight after signing in, and can sign in with it', async () => {
    await signedInMinutesAgo(1)

    const result = await setAccountPassword({ newPassword: FIRST_PASSWORD })

    expect(result).toMatchObject({ success: true })
    expect(await providers()).toEqual(['credential', 'google'])
    expect(await canSignInWith(FIRST_PASSWORD)).toBe(true)
    expect(await canSignInWith('Not-the-password-1')).toBe(false)

    // The address is told, and the workshop's audit log is not where it goes
    expect(sendAccountMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: EMAIL,
        subject: 'A password was added to your Torqvoice account',
      })
    )
    const audit = await db.auditLog.findFirst({ where: { userId, action: 'auth.passwordSet' } })
    expect(audit?.organizationId ?? null).toBeNull()
  })

  it('cannot set it a second time, only change it by proving the first', async () => {
    const again = await setAccountPassword({ newPassword: SECOND_PASSWORD })
    expect(again).toMatchObject({ success: false, error: ACCOUNT_HAS_PASSWORD })
    expect(await canSignInWith(SECOND_PASSWORD)).toBe(false)

    await auth.api.changePassword({
      body: { currentPassword: FIRST_PASSWORD, newPassword: SECOND_PASSWORD },
      headers: request.headers,
    })
    expect(await canSignInWith(SECOND_PASSWORD)).toBe(true)
    expect(await canSignInWith(FIRST_PASSWORD)).toBe(false)
  })

  it('can turn two-factor on now that there is a password to confirm with', async () => {
    const enrolment = await auth.api.enableTwoFactor({
      body: { password: SECOND_PASSWORD, method: 'totp' },
      headers: request.headers,
    })
    expect(enrolment).toMatchObject({ totpURI: expect.stringContaining('otpauth://') })
  })
})
