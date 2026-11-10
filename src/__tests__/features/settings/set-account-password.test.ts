/**
 * Giving an account its first password. Someone who signed up with Google
 * has none, and "change password" answered them "Credential account not
 * found". The action that sets one is a way into the account that outlives
 * the session, so what matters here is everything it refuses.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  passwordHash: null as string | null,
  sessionCreatedAt: new Date(),
  /** Set for a session a workshop minted for a technician's phone. */
  sessionOrganizationId: null as string | null,
  email: 'google-person@x.test',
}))

const setPassword = vi.hoisted(() => vi.fn(async () => ({ status: true })))
const sendAccountMail = vi.hoisted(() => vi.fn(async () => undefined))
const logAudit = vi.hoisted(() => vi.fn(async () => undefined))

vi.mock('next/headers', () => ({
  headers: vi.fn(async () => new Headers()),
  cookies: vi.fn(async () => ({ get: vi.fn(), delete: vi.fn() })),
}))
vi.mock('@/lib/cached-session', () => ({
  getCachedSession: vi.fn(async () => ({
    user: { id: 'user-a', email: state.email, name: 'A' },
    session: { createdAt: state.sessionCreatedAt, organizationId: state.sessionOrganizationId },
  })),
  getCachedMembership: vi.fn(async () => ({
    organizationId: 'org-a',
    role: 'member',
    roleId: null,
    customRole: null,
  })),
}))
vi.mock('@/lib/auth', () => ({
  auth: { api: { setPassword }, $context: Promise.resolve({}) },
}))
vi.mock('@/lib/db', () => ({
  db: {
    account: {
      findFirst: vi.fn(async () => (state.passwordHash ? { password: state.passwordHash } : null)),
    },
    user: {
      findUnique: vi.fn(async () => ({ isSuperAdmin: false, email: state.email, name: 'A' })),
    },
    organizationMember: { findFirst: vi.fn(async () => ({ role: 'member' })) },
  },
}))
vi.mock('@/lib/account-mail', () => ({ sendAccountMail }))
vi.mock('@/lib/audit', () => ({ logAudit, auditDetails: vi.fn(() => undefined) }))

import { setAccountPassword } from '@/features/settings/Actions/setAccountPassword'
import { ACCOUNT_HAS_PASSWORD } from '@/features/settings/Schema/accountPassword'
import { REAUTH_ERRORS } from '@/lib/reauth'
import { SCOPED_SESSION_MESSAGE } from '@/lib/session-scope'

const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000)

beforeEach(() => {
  vi.clearAllMocks()
  state.passwordHash = null
  state.sessionCreatedAt = minutesAgo(1)
  state.sessionOrganizationId = null
  state.email = 'google-person@x.test'
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
})

describe('setting a first password', () => {
  it('sets it for an account with none, straight after signing in', async () => {
    const result = await setAccountPassword({ newPassword: 'correct horse battery' })

    expect(result).toMatchObject({ success: true })
    expect(setPassword).toHaveBeenCalledTimes(1)
    expect(setPassword).toHaveBeenCalledWith(
      expect.objectContaining({ body: { newPassword: 'correct horse battery' } })
    )
  })

  it('tells the account’s own address that a password was added', async () => {
    await setAccountPassword({ newPassword: 'correct horse battery' })

    expect(sendAccountMail).toHaveBeenCalledTimes(1)
    expect(sendAccountMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'google-person@x.test',
        subject: 'A password was added to your Torqvoice account',
      })
    )
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-a' }),
      expect.objectContaining({ action: 'auth.passwordSet' })
    )
  })

  it('still sets the password when the notice cannot be sent', async () => {
    sendAccountMail.mockRejectedValueOnce(new Error('no mail server'))

    const result = await setAccountPassword({ newPassword: 'correct horse battery' })

    expect(result).toMatchObject({ success: true })
    expect(setPassword).toHaveBeenCalledTimes(1)
  })

  it('sends no notice to a placeholder address nobody reads', async () => {
    state.email = 'tech-123@technician.torqvoice.invalid'

    await setAccountPassword({ newPassword: 'correct horse battery' })

    expect(setPassword).toHaveBeenCalledTimes(1)
    expect(sendAccountMail).not.toHaveBeenCalled()
  })
})

describe('what it refuses', () => {
  it('an account that already has a password, which must prove the current one', async () => {
    state.passwordHash = 'hashed:hunter22'

    const result = await setAccountPassword({ newPassword: 'correct horse battery' })

    expect(result).toMatchObject({ success: false, error: ACCOUNT_HAS_PASSWORD })
    expect(setPassword).not.toHaveBeenCalled()
    expect(sendAccountMail).not.toHaveBeenCalled()
  })

  it('a session that was not signed in to just now', async () => {
    // A laptop left open at the counter, or a cookie somebody else has
    state.sessionCreatedAt = minutesAgo(11)

    const result = await setAccountPassword({ newPassword: 'correct horse battery' })

    expect(result).toMatchObject({ success: false, error: REAUTH_ERRORS.signInAgainPassword })
    expect(setPassword).not.toHaveBeenCalled()
  })

  it('a sign-in a workshop made for a technician’s phone', async () => {
    state.sessionOrganizationId = 'org-a'

    const result = await setAccountPassword({ newPassword: 'correct horse battery' })

    expect(result).toMatchObject({ success: false, error: SCOPED_SESSION_MESSAGE })
    expect(setPassword).not.toHaveBeenCalled()
  })

  it('a password shorter than eight characters', async () => {
    const result = await setAccountPassword({ newPassword: 'short' })

    expect(result.success).toBe(false)
    expect(setPassword).not.toHaveBeenCalled()
  })

  it('a password longer than the sign-in page would accept', async () => {
    const result = await setAccountPassword({ newPassword: 'x'.repeat(129) })

    expect(result.success).toBe(false)
    expect(setPassword).not.toHaveBeenCalled()
  })
})
