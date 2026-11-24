/**
 * A link into settings is offered only to somebody the settings pages open
 * for.
 *
 * The settings layout sends anyone without READ on settings to the
 * dashboard. The work order's "add a status" link, the tyre hotel's price
 * and capacity links and the "switch it on in settings" lines under the
 * plate lookup and the document scan were offered on UPDATE alone, so a
 * role holding UPDATE without READ followed a link that turned them away.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { getCachedMembership } = vi.hoisted(() => ({ getCachedMembership: vi.fn() }))
vi.mock('@/lib/cached-session', () => ({ getCachedMembership, getCachedSession: vi.fn() }))
vi.mock('@/lib/with-auth', () => ({
  withAuth: async (
    fn: (ctx: { organizationId: string; userId: string; role: string }) => unknown
  ) => ({
    success: true,
    data: await fn({ organizationId: 'org-1', userId: 'u1', role: 'member' }),
  }),
}))
vi.mock('@/lib/features', () => ({
  getFeatures: vi.fn().mockResolvedValue({ integrations: true }),
}))
vi.mock('@/features/integrations/Lib/vehicle-lookup', () => ({
  askRegistry: vi.fn(),
  findLookupConnection: vi.fn().mockResolvedValue(null),
  lookupKeys: vi.fn(),
  withinLookupBudget: vi.fn(),
}))
vi.mock('@/features/integrations/Lib/inspection-sync', () => ({ recordRegistryAnswer: vi.fn() }))

import { getVehicleLookupAvailability } from '@/features/integrations/Actions/vehicleLookupActions'
import { PermissionAction, PermissionSubject } from '@/lib/permissions'
import { canOpenAndEditSettings } from '@/lib/settings-access'

const READ = { action: PermissionAction.READ, subject: PermissionSubject.SETTINGS }
const UPDATE = { action: PermissionAction.UPDATE, subject: PermissionSubject.SETTINGS }

function role(permissions: { action: string; subject: string }[]) {
  getCachedMembership.mockResolvedValue({ roleId: 'r1', customRole: { permissions } })
}

beforeEach(() => getCachedMembership.mockReset())

describe('whether a link into settings is offered', () => {
  it('is not, to a role that may change settings but not open them', async () => {
    role([UPDATE])
    expect(await canOpenAndEditSettings('u1', 'member')).toBe(false)
  })

  it('is not, to a role that may only look at them', async () => {
    role([READ])
    expect(await canOpenAndEditSettings('u1', 'member')).toBe(false)
  })

  it('is, to a role with both, to owners and admins, and to a member with no role', async () => {
    role([READ, UPDATE])
    expect(await canOpenAndEditSettings('u1', 'member')).toBe(true)
    expect(await canOpenAndEditSettings('u1', 'owner')).toBe(true)
    expect(await canOpenAndEditSettings('u1', 'admin')).toBe(true)
    getCachedMembership.mockResolvedValue({ roleId: null })
    expect(await canOpenAndEditSettings('u1', 'member')).toBe(true)
  })

  it('leaves the plate lookup saying "ask an admin" rather than linking a page that turns them away', async () => {
    role([UPDATE])
    const result = await getVehicleLookupAvailability()
    expect(result.data).toMatchObject({ reason: 'notConnected', canEditSettings: false })

    role([READ, UPDATE])
    const allowed = await getVehicleLookupAvailability()
    expect(allowed.data).toMatchObject({ canEditSettings: true })
  })
})
