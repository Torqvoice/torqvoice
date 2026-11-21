/**
 * What the server refuses, whatever the screen sent: the platform admin
 * actions on an account are checked again where they run, so a request that
 * did not come through the confirmation changes nothing.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import enAdmin from '../../../../messages/en/admin.json'

vi.mock('@/lib/cached-session', () => ({
  getCachedSession: vi.fn(),
}))

vi.mock('next/headers', () => ({
  headers: vi.fn().mockResolvedValue(new Headers({ 'user-agent': 'vitest' })),
}))

vi.mock('next-intl/server', () => ({
  getTranslations: async (namespace: string) => (key: string) => {
    const found = `${namespace}.${key}`
      .split('.')
      .slice(1)
      .reduce<unknown>((node, part) => (node as Record<string, unknown>)?.[part], enAdmin)
    return typeof found === 'string' ? found : key
  },
}))

vi.mock('@/lib/session-scope', () => ({ sessionOrganizationScope: () => null }))

vi.mock('@/lib/delete-user-data', () => ({
  deleteUserOrganizations: vi.fn(),
}))

vi.mock('@/lib/db', () => ({
  db: {
    user: { findUnique: vi.fn(), update: vi.fn(), delete: vi.fn(), count: vi.fn() },
    teamInvitation: { deleteMany: vi.fn() },
    auditLog: { create: vi.fn() },
  },
}))

import { deletePlatformUser } from '@/features/admin/Actions/deletePlatformUser'
import { grantSuperAdmin } from '@/features/admin/Actions/grantSuperAdmin'
import { revokeSuperAdmin } from '@/features/admin/Actions/revokeSuperAdmin'
import { getCachedSession } from '@/lib/cached-session'
import { db } from '@/lib/db'
import { deleteUserOrganizations } from '@/lib/delete-user-data'

const ADMIN = 'user-admin'
const OLA = { id: 'user-ola', name: 'Ola Nordmann', email: 'ola@nordmann-bil.example' }

type Account = { id: string; name: string; email: string; isSuperAdmin: boolean }

/** The accounts the database holds; the signed-in admin is always one of them. */
function accounts(...others: Account[]) {
  const all: Account[] = [
    { id: ADMIN, name: 'Admin', email: 'admin@example.com', isSuperAdmin: true },
    ...others,
  ]
  vi.mocked(db.user.findUnique).mockImplementation((({ where }: { where: { id: string } }) =>
    Promise.resolve(all.find((a) => a.id === where.id) ?? null)) as never)
  vi.mocked(db.user.count).mockImplementation((({ where }: { where: { NOT: { id: string } } }) =>
    Promise.resolve(all.filter((a) => a.isSuperAdmin && a.id !== where.NOT.id).length)) as never)
}

function signInAs(userId: string | null) {
  vi.mocked(getCachedSession).mockResolvedValue(
    (userId ? { user: { id: userId }, session: {} } : null) as never
  )
}

function auditRows() {
  return vi.mocked(db.auditLog.create).mock.calls.map(([arg]) => (arg as { data: unknown }).data)
}

beforeEach(() => {
  vi.clearAllMocks()
  signInAs(ADMIN)
  accounts({ ...OLA, isSuperAdmin: false })
})

describe('deleting an account', () => {
  it('deletes the account whose email was typed and records who did it', async () => {
    const result = await deletePlatformUser({
      userId: OLA.id,
      confirmEmail: ' Ola@Nordmann-Bil.example ',
    })

    expect(result.success).toBe(true)
    expect(deleteUserOrganizations).toHaveBeenCalledWith(OLA.id)
    expect(db.user.delete).toHaveBeenCalledWith({ where: { id: OLA.id } })
    expect(auditRows()).toEqual([
      expect.objectContaining({
        userId: ADMIN,
        organizationId: null,
        action: 'platform.deleteUser',
        entity: 'user',
        entityId: OLA.id,
        metadata: {
          details: {
            key: 'platform_deleteUser',
            params: { name: 'Ola Nordmann', email: 'ola@nordmann-bil.example' },
          },
        },
        userAgent: 'vitest',
      }),
    ])
  })

  it('refuses when the typed email is another account’s', async () => {
    const result = await deletePlatformUser({ userId: OLA.id, confirmEmail: 'kari@example.com' })

    expect(result).toEqual({
      success: false,
      error: 'The email you typed does not match this user.',
    })
    expect(deleteUserOrganizations).not.toHaveBeenCalled()
    expect(db.user.delete).not.toHaveBeenCalled()
    expect(auditRows()).toEqual([])
  })

  it('refuses to delete your own account', async () => {
    const result = await deletePlatformUser({ userId: ADMIN, confirmEmail: 'admin@example.com' })

    expect(result).toEqual({ success: false, error: 'You cannot delete your own account.' })
    expect(db.user.delete).not.toHaveBeenCalled()
  })

  it('refuses to delete a super admin', async () => {
    accounts({ ...OLA, isSuperAdmin: true })
    const result = await deletePlatformUser({ userId: OLA.id, confirmEmail: OLA.email })

    expect(result).toEqual({
      success: false,
      error: 'Remove super admin from this user before deleting them.',
    })
    expect(deleteUserOrganizations).not.toHaveBeenCalled()
    expect(db.user.delete).not.toHaveBeenCalled()
  })

  it('says so when the account is already gone', async () => {
    const result = await deletePlatformUser({ userId: 'user-nobody', confirmEmail: OLA.email })

    expect(result).toEqual({ success: false, error: 'This user no longer exists.' })
    expect(db.user.delete).not.toHaveBeenCalled()
  })

  it('is refused for anyone who is not a super admin', async () => {
    signInAs(OLA.id)
    accounts(
      { ...OLA, isSuperAdmin: false },
      { id: 'user-kari', name: 'Kari', email: 'kari@example.com', isSuperAdmin: false }
    )
    const result = await deletePlatformUser({
      userId: 'user-kari',
      confirmEmail: 'kari@example.com',
    })

    expect(result).toEqual({ success: false, error: 'Forbidden' })
    expect(db.user.delete).not.toHaveBeenCalled()
  })
})

describe('super admin access', () => {
  it('is granted to the account whose email was typed, and recorded', async () => {
    const result = await grantSuperAdmin({ userId: OLA.id, confirmEmail: OLA.email })

    expect(result.success).toBe(true)
    expect(db.user.update).toHaveBeenCalledWith({
      where: { id: OLA.id },
      data: { isSuperAdmin: true },
    })
    expect(auditRows()).toEqual([
      expect.objectContaining({
        userId: ADMIN,
        action: 'platform.grantSuperAdmin',
        entityId: OLA.id,
        metadata: {
          details: {
            key: 'platform_grantSuperAdmin',
            params: { name: 'Ola Nordmann', email: 'ola@nordmann-bil.example' },
          },
        },
      }),
    ])
  })

  it('is not granted when the typed email does not match', async () => {
    const result = await grantSuperAdmin({ userId: OLA.id, confirmEmail: 'ola@example.com' })

    expect(result.success).toBe(false)
    expect(db.user.update).not.toHaveBeenCalled()
    expect(auditRows()).toEqual([])
  })

  it('is not granted without a typed email at all', async () => {
    const result = await grantSuperAdmin({ userId: OLA.id } as never)

    expect(result.success).toBe(false)
    expect(db.user.update).not.toHaveBeenCalled()
  })

  it('cannot be removed from yourself', async () => {
    const result = await revokeSuperAdmin({ userId: ADMIN })

    expect(result).toEqual({
      success: false,
      error: 'You cannot change your own super admin access.',
    })
    expect(db.user.update).not.toHaveBeenCalled()
  })

  it('cannot be removed from the last account that has it', async () => {
    // The caller passes the gate, but by the time the count runs the target
    // is the only super admin left.
    accounts({ ...OLA, isSuperAdmin: true })
    vi.mocked(db.user.count).mockResolvedValue(0 as never)
    const result = await revokeSuperAdmin({ userId: OLA.id })

    expect(result).toEqual({
      success: false,
      error: 'The platform needs at least one super admin.',
    })
    expect(db.user.update).not.toHaveBeenCalled()
  })

  it('is removed from another super admin, and recorded', async () => {
    accounts({ ...OLA, isSuperAdmin: true })
    const result = await revokeSuperAdmin({ userId: OLA.id })

    expect(result.success).toBe(true)
    expect(db.user.update).toHaveBeenCalledWith({
      where: { id: OLA.id },
      data: { isSuperAdmin: false },
    })
    expect(auditRows()).toEqual([
      expect.objectContaining({
        action: 'platform.revokeSuperAdmin',
        entityId: OLA.id,
        metadata: {
          details: {
            key: 'platform_revokeSuperAdmin',
            params: { name: 'Ola Nordmann', email: 'ola@nordmann-bil.example' },
          },
        },
      }),
    ])
  })
})
