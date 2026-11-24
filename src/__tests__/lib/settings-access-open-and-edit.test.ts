/**
 * The invoice's "Set payment terms" link goes to a settings page. Somebody
 * whose role may change settings but not read them would be sent from that
 * page straight to the dashboard (the settings layout requires READ), so the
 * link is only for those holding both.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { getCachedMembership } = vi.hoisted(() => ({ getCachedMembership: vi.fn() }))
vi.mock('@/lib/cached-session', () => ({ getCachedMembership }))

import { canOpenAndEditSettings } from '@/lib/settings-access'
import { PermissionAction, PermissionSubject } from '@/lib/permissions'

const READ = { action: PermissionAction.READ, subject: PermissionSubject.SETTINGS }
const UPDATE = { action: PermissionAction.UPDATE, subject: PermissionSubject.SETTINGS }

function role(permissions: { action: string; subject: string }[]) {
  getCachedMembership.mockResolvedValue({ roleId: 'r1', customRole: { permissions } })
}

beforeEach(() => getCachedMembership.mockReset())

describe('canOpenAndEditSettings', () => {
  it('is true for owners and admins', async () => {
    expect(await canOpenAndEditSettings('u1', 'owner')).toBe(true)
    expect(await canOpenAndEditSettings('u1', 'admin')).toBe(true)
  })

  it('is false for a role that may update settings but not read them', async () => {
    role([UPDATE])
    expect(await canOpenAndEditSettings('u1', 'member')).toBe(false)
  })

  it('is false for a role that may only read settings', async () => {
    role([READ])
    expect(await canOpenAndEditSettings('u1', 'member')).toBe(false)
  })

  it('is true for a role with both', async () => {
    role([READ, UPDATE])
    expect(await canOpenAndEditSettings('u1', 'member')).toBe(true)
  })

  it('is true for a member with no custom role, who keeps full access', async () => {
    getCachedMembership.mockResolvedValue({ roleId: null })
    expect(await canOpenAndEditSettings('u1', 'member')).toBe(true)
  })
})
