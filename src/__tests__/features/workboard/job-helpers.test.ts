/**
 * More than one person on a job.
 *
 * A job keeps one technician and can have helpers beside them: an apprentice
 * working with whoever is teaching them, a second pair of hands on a truck.
 * What has to hold is that "who is on this job" stays one list with nobody in
 * it twice, whichever screen changes it:
 *
 * - a helper who takes the job over swaps with the technician, so the same
 *   people are still on it;
 * - somebody new taking over leaves the helpers where they were;
 * - a job with nobody's name on it has no helpers either;
 * - moving a job in time or between bays never touches who is on it.
 *
 * The database here is a small in-memory one rather than a list of expected
 * calls: what matters is who is on the job afterwards.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

type Helper = { serviceRecordId: string; technicianId: string; organizationId: string }

const state = {
  /** The job's technician. */
  technicianId: 'andy' as string | null,
  /**
   * Who an ordinary read of the job says leads it, when that differs from the
   * row: what a desk saw before another desk changed the team. The row lock
   * always reads the row itself.
   */
  staleTechnicianId: undefined as string | null | undefined,
  helpers: [] as Helper[],
  technicians: [
    { id: 'andy', name: 'Andy', isActive: true, organizationId: 'org-a' },
    { id: 'sam', name: 'Sam', isActive: true, organizationId: 'org-a' },
    { id: 'jo', name: 'Jo', isActive: true, organizationId: 'org-a' },
    { id: 'gone', name: 'Left last year', isActive: false, organizationId: 'org-a' },
  ],
}

const helperIds = () => state.helpers.map((h) => h.technicianId)

vi.mock('@/lib/cached-session', () => ({
  getCachedSession: vi.fn(),
  getCachedMembership: vi.fn(),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/notification-bus', () => ({ notificationBus: { emit: vi.fn() } }))
vi.mock('@/features/notifications/Lib/pushToTechnician', () => ({
  pushToTechnician: vi.fn(async () => undefined),
}))

vi.mock('@/lib/db', () => {
  const matches = (row: Record<string, unknown>, where: Record<string, unknown>) =>
    Object.entries(where).every(([key, value]) => row[key] === value)

  const job = () => ({
    id: 'job-1',
    title: 'Truck service',
    status: 'pending',
    startDateTime: null,
    endDateTime: null,
    promisedAt: null,
    technicianId: state.technicianId,
    helpers: state.helpers.map((h) => ({ technicianId: h.technicianId })),
    workBayId: null,
    sortOrder: 0,
    vehicle: null,
    customer: null,
  })

  const db = {
    user: { findUnique: vi.fn(async () => ({ isSuperAdmin: false })) },
    technician: {
      findFirst: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
        return state.technicians.find((t) => matches(t, where)) ?? null
      }),
    },
    workBay: { findFirst: vi.fn(async () => null) },
    serviceRecord: {
      findFirst: vi.fn(async ({ where }: { where: { id: string } }) =>
        where.id === 'job-1'
          ? {
              ...job(),
              technicianId:
                state.staleTechnicianId === undefined
                  ? state.technicianId
                  : state.staleTechnicianId,
            }
          : null
      ),
      findFirstOrThrow: vi.fn(async () => job()),
      update: vi.fn(async ({ data }: { data: { technicianId?: string | null } }) => {
        if (data.technicianId !== undefined) state.technicianId = data.technicianId
        return job()
      }),
    },
    serviceRecordHelper: {
      deleteMany: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
        const before = state.helpers.length
        state.helpers = state.helpers.filter((h) => !matches(h, where))
        return { count: before - state.helpers.length }
      }),
      createMany: vi.fn(async ({ data }: { data: Helper[] }) => {
        let count = 0
        for (const row of data) {
          if (state.helpers.some((h) => h.technicianId === row.technicianId)) continue
          state.helpers.push(row)
          count += 1
        }
        return { count }
      }),
    },
    inspection: { findFirst: vi.fn(), update: vi.fn() },
    // The team lock: answers with the row as it is, and only for this
    // workshop's job. Called as a tagged template, so the values follow the
    // strings in the order the statement names them: the job, then the workshop.
    $queryRaw: vi.fn(async (_sql: TemplateStringsArray, id: string, organizationId: string) =>
      id === 'job-1' && organizationId === 'org-a' ? [{ technicianId: state.technicianId }] : []
    ),
    $transaction: vi.fn(async (run: (tx: unknown) => unknown) => run(db)),
  }
  return { db }
})

import { getCachedMembership, getCachedSession } from '@/lib/cached-session'
import { pushToTechnician } from '@/features/notifications/Lib/pushToTechnician'
import { db } from '@/lib/db'
import {
  addJobHelper,
  assignTechnician,
  moveJob,
  removeJobHelper,
  scheduleJob,
  unassignJob,
} from '@/features/workboard/Actions/boardActions'
import { helpersAfterTechnicianChange } from '@/features/workboard/utils/lanes'

const helper = (technicianId: string): Helper => ({
  serviceRecordId: 'job-1',
  technicianId,
  organizationId: 'org-a',
})

beforeEach(() => {
  vi.clearAllMocks()
  state.technicianId = 'andy'
  state.staleTechnicianId = undefined
  state.helpers = []
  vi.mocked(getCachedSession).mockResolvedValue({
    user: { id: 'user-a', email: 'a@example.com' },
  } as never)
  vi.mocked(getCachedMembership).mockResolvedValue({
    organizationId: 'org-a',
    role: 'owner',
    roleId: null,
    customRole: null,
  } as never)
})

describe('putting a second person on a job', () => {
  it('adds them beside the technician and tells their phone', async () => {
    const result = await addJobHelper({ id: 'job-1', technicianId: 'sam' })

    expect(result.success).toBe(true)
    expect(result.data?.technicianId).toBe('andy')
    expect(result.data?.helperIds).toEqual(['sam'])
    expect(pushToTechnician).toHaveBeenCalledWith(
      expect.objectContaining({ technicianId: 'sam', organizationId: 'org-a' })
    )
  })

  it('adds them once, however often it is asked, and tells their phone once', async () => {
    await addJobHelper({ id: 'job-1', technicianId: 'sam' })
    const again = await addJobHelper({ id: 'job-1', technicianId: 'sam' })

    expect(again.data?.helperIds).toEqual(['sam'])
    expect(pushToTechnician).toHaveBeenCalledTimes(1)
  })

  it('does not make the technician their own helper', async () => {
    const result = await addJobHelper({ id: 'job-1', technicianId: 'andy' })

    expect(result.success).toBe(true)
    expect(result.data?.helperIds).toEqual([])
    expect(pushToTechnician).not.toHaveBeenCalled()
  })

  it('refuses when nobody has the job yet', async () => {
    state.technicianId = null

    const result = await addJobHelper({ id: 'job-1', technicianId: 'sam' })

    expect(result.success).toBe(false)
    expect(helperIds()).toEqual([])
  })

  it('refuses somebody who has left the workshop', async () => {
    const result = await addJobHelper({ id: 'job-1', technicianId: 'gone' })

    expect(result.success).toBe(false)
    expect(helperIds()).toEqual([])
  })

  it('refuses a job that is not this workshop’s', async () => {
    const result = await addJobHelper({ id: 'somebody-elses-job', technicianId: 'sam' })

    expect(result.success).toBe(false)
    expect(helperIds()).toEqual([])
  })

  it('takes them off again, and leaves everybody else on it', async () => {
    state.helpers = [helper('sam'), helper('jo')]

    const result = await removeJobHelper({ id: 'job-1', technicianId: 'sam' })

    expect(result.data?.technicianId).toBe('andy')
    expect(result.data?.helperIds).toEqual(['jo'])
  })
})

describe('changing the technician of a job that has helpers', () => {
  it('swaps the two when a helper takes the job over', async () => {
    state.helpers = [helper('sam')]

    const result = await assignTechnician({
      id: 'job-1',
      technicianId: 'sam',
      type: 'serviceRecord',
    })

    expect(result.data?.technicianId).toBe('sam')
    expect(result.data?.helperIds).toEqual(['andy'])
  })

  it('swaps them the same way when the card is dragged into the helper’s lane', async () => {
    state.helpers = [helper('sam'), helper('jo')]

    const result = await scheduleJob({ id: 'job-1', type: 'serviceRecord', technicianId: 'jo' })

    expect(result.data?.technicianId).toBe('jo')
    expect(result.data?.helperIds?.slice().sort()).toEqual(['andy', 'sam'])
  })

  it('keeps the helpers when somebody new takes the job', async () => {
    state.helpers = [helper('sam')]

    const result = await moveJob({
      id: 'job-1',
      technicianId: 'jo',
      sortOrder: 0,
      type: 'serviceRecord',
    })

    expect(result.data?.technicianId).toBe('jo')
    // Andy handed the job on and is off it; Sam is still helping.
    expect(result.data?.helperIds).toEqual(['sam'])
  })

  it('takes the helpers off with the technician when nobody has the job', async () => {
    state.helpers = [helper('sam'), helper('jo')]

    const result = await scheduleJob({ id: 'job-1', type: 'serviceRecord', technicianId: null })

    expect(result.data?.technicianId).toBeNull()
    expect(result.data?.helperIds).toEqual([])
  })

  it('takes the helpers off when the job is taken off the board', async () => {
    state.helpers = [helper('sam')]

    const result = await unassignJob({ id: 'job-1', type: 'serviceRecord' })

    expect(result.success).toBe(true)
    expect(state.technicianId).toBeNull()
    expect(helperIds()).toEqual([])
  })

  it('leaves everybody where they are when only the time or the bay moves', async () => {
    state.helpers = [helper('sam')]

    const result = await scheduleJob({
      id: 'job-1',
      type: 'serviceRecord',
      startDateTime: new Date('2026-11-10T08:00:00Z'),
      endDateTime: new Date('2026-11-10T11:00:00Z'),
    })

    expect(result.data?.technicianId).toBe('andy')
    expect(result.data?.helperIds).toEqual(['sam'])
  })
})

/**
 * Two desks changing the same team at once. Each change reads who leads the
 * job under a lock on it, so it acts on the team the other desk left behind,
 * not on the one its own page showed.
 */
describe('when another desk changed the team first', () => {
  it('refuses a helper once the technician has been taken off the job', async () => {
    // The page showed Andy on the job; another desk has since taken him off.
    state.staleTechnicianId = 'andy'
    state.technicianId = null

    const result = await addJobHelper({ id: 'job-1', technicianId: 'sam' })

    expect(result.success).toBe(false)
    expect(helperIds()).toEqual([])
    expect(pushToTechnician).not.toHaveBeenCalled()
  })

  it('does not make somebody a helper of the job they now lead', async () => {
    // The page showed Andy leading; another desk has since made Sam the technician.
    state.staleTechnicianId = 'andy'
    state.technicianId = 'sam'

    const result = await addJobHelper({ id: 'job-1', technicianId: 'sam' })

    expect(result.success).toBe(true)
    expect(helperIds()).toEqual([])
    expect(pushToTechnician).not.toHaveBeenCalled()
  })

  const handOvers = {
    assigning: () => assignTechnician({ id: 'job-1', technicianId: 'jo', type: 'serviceRecord' }),
    'moving the card': () =>
      moveJob({ id: 'job-1', technicianId: 'jo', sortOrder: 0, type: 'serviceRecord' }),
    'dragging on the week': () =>
      scheduleJob({ id: 'job-1', type: 'serviceRecord', technicianId: 'jo' }),
  }

  for (const [name, handOver] of Object.entries(handOvers)) {
    it(`hands the job over from whoever leads it now when ${name}`, async () => {
      // An earlier read said Andy leads, but Sam already took over and Andy
      // is off the job. Jo, helping, now takes it from Sam.
      state.staleTechnicianId = 'andy'
      state.technicianId = 'sam'
      state.helpers = [helper('jo')]

      const result = await handOver()

      expect(result.data?.technicianId).toBe('jo')
      // Sam swaps down to helping; Andy, who had left the job, is not put back on it.
      expect(result.data?.helperIds).toEqual(['sam'])
    })
  }

  it('takes the helpers off the team as it is now when the job leaves the board', async () => {
    state.staleTechnicianId = 'andy'
    state.technicianId = 'sam'
    state.helpers = [helper('jo')]

    const result = await unassignJob({ id: 'job-1', type: 'serviceRecord' })

    expect(result.success).toBe(true)
    expect(state.technicianId).toBeNull()
    expect(helperIds()).toEqual([])
  })
})

describe('a job from another workshop', () => {
  const foreign = 'somebody-elses-job'
  const actions = {
    'adding a helper': () => addJobHelper({ id: foreign, technicianId: 'sam' }),
    'removing a helper': () => removeJobHelper({ id: foreign, technicianId: 'sam' }),
    assigning: () => assignTechnician({ id: foreign, technicianId: 'jo', type: 'serviceRecord' }),
    'moving the card': () =>
      moveJob({ id: foreign, technicianId: 'jo', sortOrder: 0, type: 'serviceRecord' }),
    'dragging on the week': () =>
      scheduleJob({ id: foreign, type: 'serviceRecord', technicianId: 'jo' }),
    'taking it off the board': () => unassignJob({ id: foreign, type: 'serviceRecord' }),
  }

  for (const [name, run] of Object.entries(actions)) {
    it(`is refused when ${name}, and nobody's helpers change`, async () => {
      // Sam helps on this workshop's job; nothing done to the other one may touch that.
      state.helpers = [helper('sam')]

      const result = await run()

      expect(result.success).toBe(false)
      expect(helperIds()).toEqual(['sam'])
      expect(state.technicianId).toBe('andy')
      expect(db.serviceRecordHelper.deleteMany).not.toHaveBeenCalled()
      expect(db.serviceRecordHelper.createMany).not.toHaveBeenCalled()
      expect(db.serviceRecord.update).not.toHaveBeenCalled()
    })
  }
})

/**
 * The board draws a drag before the server answers, from its own copy of the
 * rules. If the two ever disagree a card jumps when the answer lands, so each
 * case is run through both.
 */
describe('what the board draws while a drag is in the air', () => {
  const cases: { name: string; helpers: string[]; next: string | null }[] = [
    { name: 'a helper takes over', helpers: ['sam'], next: 'sam' },
    { name: 'one of two helpers takes over', helpers: ['sam', 'jo'], next: 'jo' },
    { name: 'somebody new takes over', helpers: ['sam'], next: 'jo' },
    { name: 'nobody has it any more', helpers: ['sam', 'jo'], next: null },
    { name: 'dropped back where it was', helpers: ['sam'], next: 'andy' },
  ]

  for (const c of cases) {
    it(`matches what the server writes when ${c.name}`, async () => {
      state.helpers = c.helpers.map(helper)
      const drawn = helpersAfterTechnicianChange(
        { technicianId: 'andy', helperIds: c.helpers },
        c.next
      )

      const written = await scheduleJob({
        id: 'job-1',
        type: 'serviceRecord',
        technicianId: c.next,
      })

      expect(written.data?.helperIds?.slice().sort()).toEqual(drawn.slice().sort())
    })
  }
})
