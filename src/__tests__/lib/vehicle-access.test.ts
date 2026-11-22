/**
 * The work order offers "Add customer" only to someone `updateVehicle` would
 * let through. `canEditVehicles` answers ahead of time what `withAuth` will
 * answer when the button is pressed, so the two are asked the same question
 * here for every kind of account and must agree.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/cached-session', () => ({
  getCachedSession: vi.fn(),
  getCachedMembership: vi.fn(),
}))
vi.mock('@/lib/db', () => ({
  db: {
    user: { findUnique: vi.fn() },
    auditLog: { create: vi.fn() },
  },
}))
vi.mock('@/lib/audit', () => ({ logAudit: vi.fn(async () => undefined) }))

import { getCachedMembership, getCachedSession } from '@/lib/cached-session'
import { db } from '@/lib/db'
import { getAuthContext } from '@/lib/get-auth-context'
import { PermissionAction, PermissionSubject } from '@/lib/permissions'
import { canEditVehicles } from '@/lib/vehicle-access'
import { withAuth } from '@/lib/with-auth'

const UPDATE_VEHICLES = { action: PermissionAction.UPDATE, subject: PermissionSubject.VEHICLES }
const READ_VEHICLES = { action: PermissionAction.READ, subject: PermissionSubject.VEHICLES }
const UPDATE_CUSTOMERS = { action: PermissionAction.UPDATE, subject: PermissionSubject.CUSTOMERS }

interface Account {
  who: string
  role: string
  superAdmin?: boolean
  /** A session a workshop minted: none of the account's platform rights. */
  scoped?: boolean
  customRole?: { isAdmin?: boolean; permissions: { action: string; subject: string }[] } | null
  allowed: boolean
}

const ACCOUNTS: Account[] = [
  { who: 'the owner', role: 'owner', allowed: true },
  { who: 'an admin', role: 'admin', allowed: true },
  {
    who: 'an admin with a custom role that lacks it',
    role: 'admin',
    customRole: { permissions: [READ_VEHICLES] },
    allowed: true,
  },
  { who: 'a super admin who is a plain member', role: 'member', superAdmin: true, allowed: true },
  {
    who: 'a super admin with a custom role that lacks it',
    role: 'member',
    superAdmin: true,
    customRole: { permissions: [READ_VEHICLES] },
    allowed: true,
  },
  {
    who: 'a super admin on a session bound to one workshop, with no role',
    role: 'member',
    superAdmin: true,
    scoped: true,
    allowed: false,
  },
  { who: 'a member with no custom role', role: 'member', customRole: null, allowed: false },
  {
    who: 'a member whose custom role may update vehicles',
    role: 'member',
    customRole: { permissions: [READ_VEHICLES, UPDATE_VEHICLES] },
    allowed: true,
  },
  {
    who: 'a member whose custom role may only read vehicles',
    role: 'member',
    customRole: { permissions: [READ_VEHICLES, UPDATE_CUSTOMERS] },
    allowed: false,
  },
  {
    who: 'a member whose custom role has no permissions',
    role: 'member',
    customRole: { permissions: [] },
    allowed: false,
  },
  {
    who: 'a member whose custom role is marked as admin',
    role: 'member',
    customRole: { isAdmin: true, permissions: [] },
    allowed: true,
  },
]

function signIn(account: Account) {
  vi.mocked(getCachedSession).mockResolvedValue({
    user: { id: 'user-1', email: 'someone@example.com' },
    session: account.scoped ? { organizationId: 'org-1' } : {},
  } as never)
  vi.mocked(db.user.findUnique).mockResolvedValue({
    isSuperAdmin: account.superAdmin ?? false,
  } as never)
  vi.mocked(getCachedMembership).mockResolvedValue({
    organizationId: 'org-1',
    role: account.role,
    roleId: account.customRole ? 'role-1' : null,
    customRole: account.customRole ?? null,
  } as never)
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('who is offered "Add customer" on a work order', () => {
  it.each(ACCOUNTS)('$who: $allowed, and the save agrees', async (account) => {
    signIn(account)

    const offered = await canEditVehicles(await getAuthContext())
    const saved = await withAuth(async () => 'saved', { requiredPermissions: [UPDATE_VEHICLES] })

    expect(offered).toBe(account.allowed)
    expect(saved.success).toBe(account.allowed)
  })

  it('offers nothing to nobody', async () => {
    expect(await canEditVehicles(null)).toBe(false)
  })
})
