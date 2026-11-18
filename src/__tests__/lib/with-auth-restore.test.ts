import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * withAuth refuses to run an action for a workshop that is being restored,
 * unless the action says it may. The freeze is the real one; the session and
 * membership are mocked as in with-auth.test.ts.
 */

vi.mock('@/lib/cached-session', () => ({
  getCachedSession: vi.fn(),
  getCachedMembership: vi.fn(),
}))

vi.mock('@/lib/db', () => ({
  db: {
    user: {
      findUnique: vi.fn(),
    },
  },
}))

import { getCachedMembership, getCachedSession } from '@/lib/cached-session'
import { db } from '@/lib/db'
import { freezeOrganization, RESTORE_IN_PROGRESS_MESSAGE, unfreezeOrganization } from '@/lib/backup/freeze'
import { withAuth } from '@/lib/with-auth'

const SESSION = { user: { id: 'user-1', email: 'user@example.com' } }
const MEMBERSHIP = { organizationId: 'org-1', role: 'owner', roleId: null, customRole: null }

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(getCachedSession).mockResolvedValue(SESSION as never)
  vi.mocked(db.user.findUnique).mockResolvedValue({ isSuperAdmin: false } as never)
  vi.mocked(getCachedMembership).mockResolvedValue(MEMBERSHIP as never)
  unfreezeOrganization('org-1')
  unfreezeOrganization('org-2')
})

describe('withAuth during a restore', () => {
  it('refuses an action while the workshop is being restored, without running it', async () => {
    freezeOrganization('org-1')
    const action = vi.fn(async () => 'ok')
    const result = await withAuth(action)
    expect(result).toEqual({ success: false, error: RESTORE_IN_PROGRESS_MESSAGE })
    expect(action).not.toHaveBeenCalled()
  })

  it('runs an action that is allowed during a restore', async () => {
    freezeOrganization('org-1')
    const result = await withAuth(async () => 'ok', { allowDuringRestore: true })
    expect(result).toEqual({ success: true, data: 'ok' })
  })

  it('runs the action again once the restore is done', async () => {
    freezeOrganization('org-1')
    unfreezeOrganization('org-1')
    expect(await withAuth(async () => 'ok')).toEqual({ success: true, data: 'ok' })
  })

  it('does not hold up another workshop', async () => {
    freezeOrganization('org-2')
    expect(await withAuth(async () => 'ok')).toEqual({ success: true, data: 'ok' })
  })

  it('refuses a super admin acting in the workshop too', async () => {
    vi.mocked(db.user.findUnique).mockResolvedValue({ isSuperAdmin: true } as never)
    freezeOrganization('org-1')
    const result = await withAuth(async () => 'ok')
    expect(result).toEqual({ success: false, error: RESTORE_IN_PROGRESS_MESSAGE })
  })
})
