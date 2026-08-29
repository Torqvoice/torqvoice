import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Creating a mechanic's account at the counter, and cutting one off.
 */

vi.mock('@/lib/cached-session', () => ({
  getCachedSession: vi.fn(),
  getCachedMembership: vi.fn(),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/notification-bus', () => ({ notificationBus: { emit: vi.fn() } }))
vi.mock('@/lib/sms', () => ({ normalizeOrgPhone: vi.fn() }))
vi.mock('@/lib/auth', () => ({
  auth: { $context: Promise.resolve({ internalAdapter: { deleteSession: vi.fn() } }) },
}))
vi.mock('@/lib/db', () => ({
  db: {
    role: { findFirst: vi.fn(), create: vi.fn() },
    technician: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), aggregate: vi.fn() },
    organizationMember: {
      create: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
    },
    user: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
    technicianLoginCode: { deleteMany: vi.fn() },
    technicianSetupCode: { deleteMany: vi.fn() },
    pushDevice: { updateMany: vi.fn() },
    session: { findMany: vi.fn() },
    $transaction: vi.fn(),
  },
}))

import { auth } from '@/lib/auth'
import { getCachedMembership, getCachedSession } from '@/lib/cached-session'
import { db } from '@/lib/db'
import { normalizeOrgPhone } from '@/lib/sms'
import { createTechnicianAccount } from '@/features/team/Actions/createTechnicianAccount'
import { removeTechnicianAccess } from '@/features/team/Actions/removeTechnicianAccess'

const deleteSession = vi.mocked(
  (await auth.$context).internalAdapter.deleteSession as ReturnType<typeof vi.fn>
)
const ORG = 'org-a'

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getCachedSession).mockResolvedValue({ user: { id: 'desk-1' } } as never)
  vi.mocked(getCachedMembership).mockResolvedValue({
    organizationId: ORG,
    role: 'owner',
    roleId: null,
    customRole: null,
  } as never)
  vi.mocked(db.user.findUnique).mockResolvedValue(null as never)
  vi.mocked(normalizeOrgPhone).mockResolvedValue('+4791234567')
  vi.mocked(db.technician.findFirst).mockResolvedValue(null as never)
  vi.mocked(db.technician.aggregate).mockResolvedValue({ _max: { sortOrder: 2 } } as never)
  vi.mocked(db.technician.create).mockResolvedValue({
    id: 'tech-1',
    userId: 'user-1',
  } as never)
  vi.mocked(db.user.create).mockResolvedValue({ id: 'user-1' } as never)
  vi.mocked(db.role.findFirst).mockResolvedValue({ id: 'role-tech' } as never)
  vi.mocked(db.$transaction).mockImplementation(async (arg: unknown) =>
    typeof arg === 'function' ? (arg as (tx: unknown) => unknown)(db) : arg
  )
})

describe('creating a technician account at the counter', () => {
  it('makes a user, a membership and a technician from a name and a number', async () => {
    const result = await createTechnicianAccount({ name: 'Ola Nordmann', phone: '912 34 567' })

    expect(result.success).toBe(true)
    expect(db.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ name: 'Ola Nordmann', phone: '+4791234567' }),
      })
    )
    expect(db.organizationMember.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ organizationId: ORG, role: 'member', roleId: 'role-tech' }),
      })
    )
    expect(db.technician.create).toHaveBeenCalled()
  })

  it('stores the number in the workshop’s own canonical form', async () => {
    await createTechnicianAccount({ name: 'Ola', phone: '  912 34 567 ' })
    const data = vi.mocked(db.user.create).mock.calls[0]?.[0]?.data as { phone: string }
    expect(data.phone).toBe('+4791234567')
  })

  it('invents an unroutable address rather than asking for one', async () => {
    await createTechnicianAccount({ name: 'Ola', phone: '912 34 567' })
    const data = vi.mocked(db.user.create).mock.calls[0]?.[0]?.data as { email: string }

    expect(data.email).toMatch(/@technician\.torqvoice\.invalid$/)
    // .invalid can never resolve, so nothing can ever be sent there by mistake.
    expect(data.email.endsWith('.invalid')).toBe(true)
  })

  it('gives them the role the app needs, and reuses the workshop’s own', async () => {
    // Creating them with no role at all was the bug: withApiAuth enforces
    // permissions exactly as the web app does, so every screen in the
    // technician app answered "Your role does not allow this".
    await createTechnicianAccount({ name: 'Ola', phone: '912 34 567' })

    const data = vi.mocked(db.organizationMember.create).mock.calls[0]?.[0]?.data as {
      roleId: string
    }
    expect(data.roleId).toBe('role-tech')
    // Found rather than made, so five mechanics share one role instead of
    // filling the team page with five identical ones.
    expect(db.role.create).not.toHaveBeenCalled()
  })

  it('creates the technician role once, when the workshop has none yet', async () => {
    vi.mocked(db.role.findFirst).mockResolvedValue(null as never)
    vi.mocked(db.role.create).mockResolvedValue({ id: 'role-new' } as never)

    await createTechnicianAccount({ name: 'Ola', phone: '912 34 567' })

    const data = vi.mocked(db.role.create).mock.calls[0]?.[0]?.data as {
      isAdmin: boolean
      permissions: { create: { action: string; subject: string }[] }
    }
    // Not isAdmin: that bypasses permission checks entirely and hides what the
    // account can reach behind a flag, which is the shape of the bug this
    // product just finished removing.
    expect(data.isAdmin).toBe(false)
    expect(data.permissions.create).toEqual([
      { action: 'read', subject: 'services' },
      { action: 'update', subject: 'services' },
      { action: 'read', subject: 'inventory' },
    ])
  })

  it('refuses a number somebody here is already using', async () => {
    vi.mocked(db.technician.findFirst).mockResolvedValue({
      id: 'tech-9',
      name: 'Kari',
      isActive: true,
      userId: 'user-9',
    } as never)

    const result = await createTechnicianAccount({ name: 'Ola', phone: '912 34 567' })
    expect(result.success).toBe(false)
    expect(result.error).toContain('Kari')
    expect(db.user.create).not.toHaveBeenCalled()
  })

  describe('somebody who worked here before', () => {
    // Removing a technician deactivates the row rather than deleting it, so a
    // mechanic who leaves and comes back is a row that already exists. Refusing
    // them meant they could never return.
    beforeEach(() => {
      vi.mocked(db.technician.findFirst).mockResolvedValue({
        id: 'tech-old',
        name: 'Petter',
        isActive: false,
        userId: 'user-old',
      } as never)
      vi.mocked(db.technician.update).mockResolvedValue({
        id: 'tech-old',
        userId: 'user-old',
      } as never)
      vi.mocked(db.organizationMember.findFirst).mockResolvedValue({
        id: 'mem-old',
        roleId: 'role-tech',
      } as never)
    })

    it('brings them back rather than refusing them', async () => {
      const result = await createTechnicianAccount({ name: 'Petter', phone: '912 34 567' })

      expect(result.success).toBe(true)
      expect((result.data as { reinstated: boolean }).reinstated).toBe(true)
      expect(db.technician.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'tech-old' },
          data: { isActive: true, name: 'Petter' },
        })
      )
    })

    it('keeps their history by reusing the row, not making a second one', async () => {
      await createTechnicianAccount({ name: 'Petter', phone: '912 34 567' })

      expect(db.technician.create).not.toHaveBeenCalled()
      expect(db.user.create).not.toHaveBeenCalled()
    })

    it('takes the name as typed now, in case it changed', async () => {
      await createTechnicianAccount({ name: 'Petter Stordalen', phone: '912 34 567' })

      expect(db.user.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ name: 'Petter Stordalen' }) })
      )
    })

    it('rebuilds the membership when they were removed from the team entirely', async () => {
      // The trash icon deletes the membership and leaves the technician row.
      vi.mocked(db.organizationMember.findFirst).mockResolvedValue(null as never)

      await createTechnicianAccount({ name: 'Petter', phone: '912 34 567' })

      expect(db.organizationMember.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ userId: 'user-old', roleId: 'role-tech' }),
        })
      )
    })

    it('gives back the role if they came back without one', async () => {
      vi.mocked(db.organizationMember.findFirst).mockResolvedValue({
        id: 'mem-old',
        roleId: null,
      } as never)

      await createTechnicianAccount({ name: 'Petter', phone: '912 34 567' })

      expect(db.organizationMember.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'mem-old' }, data: { roleId: 'role-tech' } })
      )
    })
  })

  it('looks for that number only inside this workshop', async () => {
    await createTechnicianAccount({ name: 'Ola', phone: '912 34 567' })
    expect(db.technician.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ organizationId: ORG }) })
    )
  })

  it('refuses a number it cannot make sense of', async () => {
    vi.mocked(normalizeOrgPhone).mockResolvedValue(null)

    const result = await createTechnicianAccount({ name: 'Ola', phone: 'not a number' })
    expect(result.success).toBe(false)
    expect(db.user.create).not.toHaveBeenCalled()
  })

  it('refuses an email somebody already has', async () => {
    vi.mocked(db.user.findUnique).mockResolvedValue({ id: 'other' } as never)

    const result = await createTechnicianAccount({
      name: 'Ola',
      phone: '912 34 567',
      email: 'taken@x.test',
    })
    expect(result.success).toBe(false)
    expect(db.user.create).not.toHaveBeenCalled()
  })
})

describe('removing a technician', () => {
  beforeEach(() => {
    vi.mocked(db.technician.findFirst).mockResolvedValue({
      id: 'tech-1',
      name: 'Ola',
      userId: 'user-1',
    } as never)
    vi.mocked(db.organizationMember.count).mockResolvedValue(0 as never)
    // The real deleteSession is async and the code chains .catch onto it.
    deleteSession.mockResolvedValue(undefined)
    vi.mocked(db.session.findMany).mockResolvedValue([
      { token: 'tok-1' },
      { token: 'tok-2' },
    ] as never)
  })

  it('deactivates rather than deletes, so the work still has an author', async () => {
    await removeTechnicianAccess({ userId: 'user-1' })
    expect(db.technician.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { isActive: false } })
    )
  })

  it('kills every session, so the token on the phone stops being one', async () => {
    await removeTechnicianAccess({ userId: 'user-1' })
    expect(deleteSession).toHaveBeenCalledWith('tok-1')
    expect(deleteSession).toHaveBeenCalledWith('tok-2')
  })

  it('leaves sessions alone when they still work at another branch', async () => {
    vi.mocked(db.organizationMember.count).mockResolvedValue(1 as never)

    await removeTechnicianAccess({ userId: 'user-1' })
    expect(deleteSession).not.toHaveBeenCalled()
  })

  it('destroys anything outstanding that could still be redeemed', async () => {
    await removeTechnicianAccess({ userId: 'user-1' })
    expect(db.technicianLoginCode.deleteMany).toHaveBeenCalledWith({
      where: { technicianId: 'tech-1' },
    })
    expect(db.technicianSetupCode.deleteMany).toHaveBeenCalledWith({
      where: { organizationId: ORG, userId: 'user-1' },
    })
  })

  it('stops the wrong phone being told about jobs', async () => {
    await removeTechnicianAccess({ userId: 'user-1' })
    expect(db.pushDevice.updateMany).toHaveBeenCalledWith({
      where: { userId: 'user-1', organizationId: ORG },
      data: { isActive: false },
    })
  })

  it('refuses a technician from another workshop', async () => {
    vi.mocked(db.technician.findFirst).mockResolvedValue(null as never)

    const result = await removeTechnicianAccess({ userId: 'user-elsewhere' })
    expect(result.success).toBe(false)
    expect(db.technician.update).not.toHaveBeenCalled()
    expect(deleteSession).not.toHaveBeenCalled()
  })
})
