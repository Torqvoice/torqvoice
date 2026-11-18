/**
 * Two-factor sign-in and passkeys reach the audit log. They change through
 * better-auth's own routes, so for a long time none of it was written down,
 * although the security docs say every one of these events is there.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { APIError } from 'better-auth/api'

// The audit line is rendered with next-intl's own translator, which the global mock leaves out.
vi.unmock('next-intl')

vi.mock('@/features/webhooks/Lib/dispatcher', () => ({ dispatchWebhookEvent: vi.fn() }))
vi.mock('@/features/integrations/Lib/events', () => ({ notifyIntegrations: vi.fn() }))
vi.mock('@/lib/db', () => ({
  db: {
    auditLog: { create: vi.fn().mockResolvedValue({}) },
    organizationMember: { findFirst: vi.fn() },
    passkey: { findFirst: vi.fn() },
  },
}))

import { db } from '@/lib/db'
import {
  auditAccountSecurityRoute,
  auditTwoFactorChange,
  rememberPasskeyBeforeRemoval,
} from '@/lib/account-security-audit'

const CHROME_ON_LINUX =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36'

function request(path: string) {
  return new Request(`http://localhost:3000/api/public/auth${path}`, {
    method: 'POST',
    headers: { 'user-agent': CHROME_ON_LINUX, 'x-real-ip': '203.0.113.7' },
  })
}

/** What the audit log holds, oldest first. */
function written() {
  return vi.mocked(db.auditLog.create).mock.calls.map(([args]) => args.data)
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(db.organizationMember.findFirst).mockResolvedValue({
    organizationId: 'org-a',
  } as never)
})

describe('two-factor sign-in', () => {
  it('logs turning it on, with the address and browser', async () => {
    await auditTwoFactorChange(
      { id: 'alex', twoFactorEnabled: true },
      { path: '/two-factor/verify-totp', request: request('/two-factor/verify-totp') }
    )
    expect(written()).toEqual([
      expect.objectContaining({
        userId: 'alex',
        organizationId: 'org-a',
        action: 'auth.twoFactorEnabled',
        message: 'Turned on two-factor sign-in',
        ip: '203.0.113.7',
        userAgent: CHROME_ON_LINUX,
      }),
    ])
  })

  it('logs turning it off', async () => {
    await auditTwoFactorChange(
      { id: 'alex', twoFactorEnabled: false },
      { path: '/two-factor/disable', request: request('/two-factor/disable') }
    )
    expect(written().map((row) => row.message)).toEqual(['Turned off two-factor sign-in'])
  })

  it('says nothing about other changes to the account', async () => {
    await auditTwoFactorChange(
      { id: 'alex', twoFactorEnabled: true },
      { path: '/update-user', request: request('/update-user') }
    )
    await auditTwoFactorChange({ id: 'alex', twoFactorEnabled: true }, null)
    expect(written()).toEqual([])
  })

  it('logs a sign-in with a backup code', async () => {
    await auditAccountSecurityRoute({
      path: '/two-factor/verify-backup-code',
      request: request('/two-factor/verify-backup-code'),
      context: { returned: { token: 't' }, newSession: { user: { id: 'alex' } } },
    })
    expect(written().map((row) => row.message)).toEqual(['Signed in with a backup code'])
  })

  it('says nothing when the backup code was wrong', async () => {
    await auditAccountSecurityRoute({
      path: '/two-factor/verify-backup-code',
      request: request('/two-factor/verify-backup-code'),
      context: { returned: new APIError('UNAUTHORIZED'), newSession: null },
    })
    expect(written()).toEqual([])
  })
})

describe('passkeys', () => {
  it('logs a passkey added, by its name', async () => {
    await auditAccountSecurityRoute({
      path: '/passkey/verify-registration',
      request: request('/passkey/verify-registration'),
      context: { returned: { id: 'pk-1', userId: 'alex', name: 'Safari on iPhone' } },
    })
    expect(written()).toEqual([
      expect.objectContaining({
        userId: 'alex',
        action: 'auth.passkeyAdded',
        message: 'Added the passkey "Safari on iPhone"',
      }),
    ])
  })

  it('names an unnamed passkey after the device it was made on', async () => {
    await auditAccountSecurityRoute({
      path: '/passkey/verify-registration',
      request: request('/passkey/verify-registration'),
      context: { returned: { id: 'pk-1', userId: 'alex', name: null } },
    })
    expect(written().map((row) => row.message)).toEqual(['Added the passkey "Chrome on Linux"'])
  })

  it('logs a passkey removed, by the name it had', async () => {
    vi.mocked(db.passkey.findFirst).mockResolvedValue({
      userId: 'alex',
      name: 'Chrome on Linux',
    } as never)
    const req = request('/passkey/delete-passkey')
    await rememberPasskeyBeforeRemoval({
      path: '/passkey/delete-passkey',
      body: { id: 'pk-1' },
      request: req,
    })
    await auditAccountSecurityRoute({
      path: '/passkey/delete-passkey',
      request: req,
      context: { returned: { status: true } },
    })
    expect(written()).toEqual([
      expect.objectContaining({
        userId: 'alex',
        action: 'auth.passkeyRemoved',
        message: 'Removed the passkey "Chrome on Linux"',
      }),
    ])
  })

  it('says nothing when removing someone else’s passkey was refused', async () => {
    vi.mocked(db.passkey.findFirst).mockResolvedValue({
      userId: 'sam',
      name: 'Sam’s phone',
    } as never)
    const req = request('/passkey/delete-passkey')
    await rememberPasskeyBeforeRemoval({
      path: '/passkey/delete-passkey',
      body: { id: 'pk-sam' },
      request: req,
    })
    await auditAccountSecurityRoute({
      path: '/passkey/delete-passkey',
      request: req,
      context: { returned: new APIError('UNAUTHORIZED') },
    })
    expect(written()).toEqual([])
  })
})
