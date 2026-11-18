/**
 * A calendar link to one appointment opens it only for somebody in that
 * workshop who may read the calendar. Anybody else gets the plain calendar,
 * so the link does not tell them whether the id exists or which day it is.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/cached-session', () => ({
  getCachedSession: vi.fn(),
  getCachedMembership: vi.fn(),
}))
vi.mock('@/lib/db', () => ({
  db: { appointment: { findFirst: vi.fn() } },
}))

import { getCachedMembership } from '@/lib/cached-session'
import { db } from '@/lib/db'
import { findLinkedAppointment } from '@/features/calendar/Lib/linkedAppointment.server'

const START = new Date('2026-11-24T09:30:00Z')
const ROWS = [
  { id: 'appt-a', organizationId: 'org-a', startAt: START },
  { id: 'appt-b', organizationId: 'org-b', startAt: START },
]

const owner = { userId: 'user-a', isAdmin: true, organizationId: 'org-a' }
const member = { userId: 'user-m', isAdmin: false, organizationId: 'org-a' }

function memberMayRead(subjects: string[]) {
  vi.mocked(getCachedMembership).mockResolvedValue({
    organizationId: 'org-a',
    role: 'member',
    roleId: 'role-1',
    customRole: {
      isAdmin: false,
      permissions: subjects.map((subject) => ({ action: 'read', subject })),
    },
  } as never)
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(db.appointment.findFirst).mockImplementation((async (args: {
    where: { id: string; organizationId: string }
  }) => {
    const row = ROWS.find(
      (r) => r.id === args.where.id && r.organizationId === args.where.organizationId
    )
    return row ? { id: row.id, startAt: row.startAt } : null
  }) as never)
})

describe('findLinkedAppointment', () => {
  it('opens the workshop’s own appointment', async () => {
    expect(await findLinkedAppointment(owner, 'appt-a')).toEqual({ id: 'appt-a', startAt: START })
  })

  it('opens nothing for another workshop’s appointment', async () => {
    expect(await findLinkedAppointment(owner, 'appt-b')).toBeNull()
  })

  it('opens nothing, and looks nothing up, for a member who cannot read the calendar', async () => {
    memberMayRead(['dashboard', 'customers'])
    expect(await findLinkedAppointment(member, 'appt-a')).toBeNull()
    expect(db.appointment.findFirst).not.toHaveBeenCalled()
  })

  it('opens it for a member who can read the calendar', async () => {
    memberMayRead(['services'])
    expect(await findLinkedAppointment(member, 'appt-a')).toEqual({ id: 'appt-a', startAt: START })
  })

  it('ignores a missing or malformed id', async () => {
    expect(await findLinkedAppointment(owner, undefined)).toBeNull()
    expect(await findLinkedAppointment(owner, ['appt-a'])).toBeNull()
    expect(await findLinkedAppointment(null, 'appt-a')).toBeNull()
  })
})
