/**
 * The proof asked for before deleting an account or a workshop: a password
 * when the account has one, a two-factor code when it has no password but
 * two-factor is on, and otherwise a sign-in from the last few minutes. And
 * that the two delete actions really stop on it, before anything is deleted.
 */
import path from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  passwordHash: null as string | null,
  twoFactorEnabled: false,
  sessionCreatedAt: new Date(),
  validCode: '123456',
}))

vi.mock('next/headers', () => ({
  headers: vi.fn(async () => new Headers()),
  cookies: vi.fn(async () => ({ get: vi.fn(), delete: vi.fn() })),
}))
vi.mock('@/lib/cached-session', () => ({
  getCachedSession: vi.fn(async () => ({
    user: { id: 'user-a', email: 'a@x.test', name: 'A' },
    session: { createdAt: state.sessionCreatedAt },
  })),
  getCachedMembership: vi.fn(async () => ({
    organizationId: 'org-a',
    role: 'owner',
    roleId: null,
    customRole: null,
  })),
}))
vi.mock('@/lib/auth', () => ({
  auth: {
    $context: Promise.resolve({
      password: {
        verify: vi.fn(
          async ({ hash, password }: { hash: string; password: string }) =>
            hash === `hashed:${password}`
        ),
      },
    }),
    api: {
      verifyTOTP: vi.fn(async ({ body }: { body: { code: string } }) => {
        if (body.code !== state.validCode) throw new Error('INVALID_CODE')
        return { token: 't' }
      }),
    },
  },
}))
vi.mock('@/lib/db', () => ({
  db: {
    account: {
      findFirst: vi.fn(async () => (state.passwordHash ? { password: state.passwordHash } : null)),
    },
    user: {
      findUnique: vi.fn(async () => ({
        twoFactorEnabled: state.twoFactorEnabled,
        isSuperAdmin: false,
        email: 'a@x.test',
      })),
      delete: vi.fn(),
    },
    organizationMember: { findFirst: vi.fn(async () => ({ role: 'owner' })) },
    organization: { findUnique: vi.fn(async () => ({ name: 'Garage A' })) },
    teamInvitation: { deleteMany: vi.fn() },
  },
}))
vi.mock('@/lib/delete-user-data', () => ({
  deleteUserOrganizations: vi.fn(),
  deleteOrganizationWithData: vi.fn(),
}))
vi.mock('@/lib/demo', () => ({ demoGuard: vi.fn(), isDemoMode: vi.fn(() => false) }))
vi.mock('@/lib/audit', () => ({ logAudit: vi.fn(), auditDetails: vi.fn(() => undefined) }))

import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { deleteOrganizationWithData, deleteUserOrganizations } from '@/lib/delete-user-data'
import { REAUTH_ERRORS, reauthErrorMessageKey } from '@/lib/reauth'
import { reauthRequirement, resetReauthFailures, verifyReauth } from '@/lib/reauth.server'
import { deleteAccount } from '@/features/settings/Actions/deleteAccount'
import { deleteWorkshop } from '@/features/team/Actions/deleteWorkshop'

const USER = 'user-a'
const NOW = Date.UTC(2026, 9, 8, 12)
const minutesAgo = (minutes: number) => new Date(NOW - minutes * 60_000)

beforeEach(() => {
  vi.clearAllMocks()
  resetReauthFailures()
  state.passwordHash = null
  state.twoFactorEnabled = false
  state.sessionCreatedAt = minutesAgo(60)
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
})

describe('an account with a password', () => {
  beforeEach(() => {
    state.passwordHash = 'hashed:hunter22'
  })

  it('asks for the password', async () => {
    expect(await reauthRequirement(USER)).toBe('password')
  })

  it('passes with the right password, however old the session', async () => {
    await expect(verifyReauth(USER, { password: 'hunter22' }, 'account', NOW)).resolves.toBe(
      undefined
    )
  })

  it('refuses a wrong password', async () => {
    await expect(verifyReauth(USER, { password: 'nope' }, 'account', NOW)).rejects.toThrow(
      REAUTH_ERRORS.wrongPassword
    )
  })

  it('refuses a missing password, even on a fresh session', async () => {
    state.sessionCreatedAt = minutesAgo(1)
    await expect(verifyReauth(USER, {}, 'account', NOW)).rejects.toThrow(
      REAUTH_ERRORS.wrongPassword
    )
    await expect(verifyReauth(USER, undefined, 'account', NOW)).rejects.toThrow(
      REAUTH_ERRORS.wrongPassword
    )
  })

  it('does not take a two-factor code in place of the password', async () => {
    state.twoFactorEnabled = true
    await expect(verifyReauth(USER, { totpCode: '123456' }, 'account', NOW)).rejects.toThrow(
      REAUTH_ERRORS.wrongPassword
    )
  })

  it('stops guessing after five wrong answers, even the right one', async () => {
    for (let i = 0; i < 5; i++) {
      await expect(verifyReauth(USER, { password: `guess${i}` }, 'account', NOW)).rejects.toThrow(
        REAUTH_ERRORS.wrongPassword
      )
    }
    await expect(verifyReauth(USER, { password: 'hunter22' }, 'account', NOW)).rejects.toThrow(
      REAUTH_ERRORS.tooManyAttempts
    )
    // A quarter of an hour later it is open again.
    await expect(
      verifyReauth(USER, { password: 'hunter22' }, 'account', NOW + 16 * 60_000)
    ).resolves.toBe(undefined)
  })
})

describe('no password, two-factor on', () => {
  beforeEach(() => {
    state.twoFactorEnabled = true
  })

  it('asks for a code', async () => {
    expect(await reauthRequirement(USER)).toBe('totp')
  })

  it('passes with a valid code, checked by Better Auth against the session', async () => {
    await expect(verifyReauth(USER, { totpCode: '123 456' }, 'account', NOW)).resolves.toBe(
      undefined
    )
    expect(auth.api.verifyTOTP).toHaveBeenCalledWith(
      expect.objectContaining({ body: { code: '123456' } })
    )
  })

  it('refuses a wrong or missing code, even on a fresh session', async () => {
    state.sessionCreatedAt = minutesAgo(1)
    await expect(verifyReauth(USER, { totpCode: '000000' }, 'account', NOW)).rejects.toThrow(
      REAUTH_ERRORS.wrongCode
    )
    await expect(verifyReauth(USER, {}, 'account', NOW)).rejects.toThrow(REAUTH_ERRORS.wrongCode)
  })
})

describe('no password, no two-factor (Google or passkey only)', () => {
  it('asks for nothing to type', async () => {
    expect(await reauthRequirement(USER)).toBe('none')
  })

  it('passes on a session made in the last ten minutes', async () => {
    state.sessionCreatedAt = minutesAgo(9)
    await expect(verifyReauth(USER, {}, 'account', NOW)).resolves.toBe(undefined)
  })

  it('refuses an older session, and says what to do for each action', async () => {
    state.sessionCreatedAt = minutesAgo(11)
    await expect(verifyReauth(USER, {}, 'account', NOW)).rejects.toThrow(
      REAUTH_ERRORS.signInAgainAccount
    )
    await expect(verifyReauth(USER, {}, 'workshop', NOW)).rejects.toThrow(
      REAUTH_ERRORS.signInAgainWorkshop
    )
  })

  it('ignores a password sent anyway', async () => {
    state.sessionCreatedAt = minutesAgo(30)
    await expect(verifyReauth(USER, { password: 'anything' }, 'account', NOW)).rejects.toThrow(
      REAUTH_ERRORS.signInAgainAccount
    )
  })
})

describe('the delete actions', () => {
  beforeEach(() => {
    state.passwordHash = 'hashed:hunter22'
  })

  it('deleteAccount deletes nothing without the password', async () => {
    const result = await deleteAccount()
    expect(result).toMatchObject({ success: false, error: REAUTH_ERRORS.wrongPassword })
    expect(deleteUserOrganizations).not.toHaveBeenCalled()
    expect(db.user.delete).not.toHaveBeenCalled()
  })

  it('deleteAccount goes ahead with it', async () => {
    const result = await deleteAccount({ password: 'hunter22' })
    expect(result).toMatchObject({ success: true })
    expect(deleteUserOrganizations).toHaveBeenCalledWith(USER)
    expect(db.user.delete).toHaveBeenCalledWith({ where: { id: USER } })
  })

  it('deleteWorkshop deletes nothing without the password, even with the right name', async () => {
    const result = await deleteWorkshop({ confirmName: 'Garage A', password: 'nope' })
    expect(result).toMatchObject({ success: false, error: REAUTH_ERRORS.wrongPassword })
    expect(deleteOrganizationWithData).not.toHaveBeenCalled()
  })

  it('deleteWorkshop goes ahead with the name and the password', async () => {
    const result = await deleteWorkshop({ confirmName: 'Garage A', password: 'hunter22' })
    expect(result).toMatchObject({ success: true })
    expect(deleteOrganizationWithData).toHaveBeenCalledWith('org-a', USER)
  })
})

describe('reauthErrorMessageKey', () => {
  it('maps each refusal to its settings key, and anything else to null', () => {
    expect(reauthErrorMessageKey(REAUTH_ERRORS.wrongPassword)).toBe('account.reauthWrongPassword')
    expect(reauthErrorMessageKey(REAUTH_ERRORS.signInAgainWorkshop)).toBe(
      'account.reauthSignInAgainWorkshop'
    )
    expect(reauthErrorMessageKey('Workshop not found')).toBeNull()
    expect(reauthErrorMessageKey(undefined)).toBeNull()
  })

  it('names a key every locale has', async () => {
    const { readdirSync, readFileSync } = await import('node:fs')
    const dir = path.join(process.cwd(), 'messages')
    for (const locale of readdirSync(dir)) {
      const account = JSON.parse(readFileSync(path.join(dir, locale, 'settings.json'), 'utf8'))
        .account as Record<string, string>
      for (const message of Object.values(REAUTH_ERRORS)) {
        const key = reauthErrorMessageKey(message)?.replace('account.', '') ?? ''
        expect(account[key], `${locale} ${key}`).toBeTruthy()
      }
    }
  })
})
