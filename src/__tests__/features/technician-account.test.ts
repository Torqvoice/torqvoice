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
    user: { findUnique: vi.fn(), create: vi.fn() },
    technician: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), aggregate: vi.fn() },
    organizationMember: { create: vi.fn(), findFirst: vi.fn(), count: vi.fn() },
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
        data: expect.objectContaining({ organizationId: ORG, role: 'member', roleId: null }),
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

  it('gives them no permissions in the web app', async () => {
    await createTechnicianAccount({ name: 'Ola', phone: '912 34 567' })
    const data = vi.mocked(db.organizationMember.create).mock.calls[0]?.[0]?.data as {
      roleId: null
    }
    expect(data.roleId).toBeNull()
  })

  it('refuses a number this workshop already has', async () => {
    vi.mocked(db.technician.findFirst).mockResolvedValue({ name: 'Kari' } as never)

    const result = await createTechnicianAccount({ name: 'Ola', phone: '912 34 567' })
    expect(result.success).toBe(false)
    expect(result.error).toContain('Kari')
    expect(db.user.create).not.toHaveBeenCalled()
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
    await removeTechnicianAccess({ technicianId: 'tech-1' })
    expect(db.technician.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { isActive: false } })
    )
  })

  it('kills every session, so the token on the phone stops being one', async () => {
    await removeTechnicianAccess({ technicianId: 'tech-1' })
    expect(deleteSession).toHaveBeenCalledWith('tok-1')
    expect(deleteSession).toHaveBeenCalledWith('tok-2')
  })

  it('leaves sessions alone when they still work at another branch', async () => {
    vi.mocked(db.organizationMember.count).mockResolvedValue(1 as never)

    await removeTechnicianAccess({ technicianId: 'tech-1' })
    expect(deleteSession).not.toHaveBeenCalled()
  })

  it('destroys anything outstanding that could still be redeemed', async () => {
    await removeTechnicianAccess({ technicianId: 'tech-1' })
    expect(db.technicianLoginCode.deleteMany).toHaveBeenCalledWith({
      where: { technicianId: 'tech-1' },
    })
    expect(db.technicianSetupCode.deleteMany).toHaveBeenCalledWith({
      where: { organizationId: ORG, userId: 'user-1' },
    })
  })

  it('stops the wrong phone being told about jobs', async () => {
    await removeTechnicianAccess({ technicianId: 'tech-1' })
    expect(db.pushDevice.updateMany).toHaveBeenCalledWith({
      where: { userId: 'user-1', organizationId: ORG },
      data: { isActive: false },
    })
  })

  it('refuses a technician from another workshop', async () => {
    vi.mocked(db.technician.findFirst).mockResolvedValue(null as never)

    const result = await removeTechnicianAccess({ technicianId: 'tech-elsewhere' })
    expect(result.success).toBe(false)
    expect(db.technician.update).not.toHaveBeenCalled()
    expect(deleteSession).not.toHaveBeenCalled()
  })
})
