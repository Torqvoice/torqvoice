/**
 * @vitest-environment node
 *
 * A helper in the technician app.
 *
 * Somebody put on a job beside its technician has to be able to work it from
 * their own phone: see it on their list, open it, and clock on. Before a job
 * could have helpers the app only ever showed a person the jobs that were in
 * their own name, so an apprentice on somebody else's job had nothing to tap.
 *
 * And with two clocks able to run on one job, whoever says the job is done
 * speaks for both: the other's clock must not run on against finished work.
 *
 * The database is a few rows and a filter that reads the same conditions
 * Prisma would, so what is asserted is who gets the job, not how it is asked.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

type Job = {
  id: string
  organizationId: string
  title: string
  status: string
  technicianId: string | null
  helpers: { technicianId: string }[]
  startDateTime: Date | null
}

type Entry = {
  id: string
  organizationId: string
  serviceRecordId: string
  technicianId: string
  startedAt: Date
  endedAt: Date | null
  durationMinutes: number | null
}

const state = {
  /** Who is holding the phone. */
  technicianIds: ['sam-row'] as string[],
  isAdmin: false,
  jobs: [] as Job[],
  entries: [] as Entry[],
}

/** Enough of a Prisma filter to answer "is this row asked for". */
function matches(row: Record<string, unknown>, where: Record<string, unknown>): boolean {
  return Object.entries(where).every(([key, condition]) => {
    if (key === 'AND') return (condition as Record<string, unknown>[]).every((c) => matches(row, c))
    if (key === 'OR') return (condition as Record<string, unknown>[]).some((c) => matches(row, c))
    const value = row[key]
    if (condition !== null && typeof condition === 'object' && !(condition instanceof Date)) {
      const c = condition as Record<string, unknown>
      if ('in' in c) return (c.in as unknown[]).includes(value)
      if ('lt' in c) return value instanceof Date && value < (c.lt as Date)
      if ('some' in c)
        return (value as Record<string, unknown>[]).some((child) =>
          matches(child, c.some as Record<string, unknown>)
        )
      throw new Error(`The test filter does not read ${JSON.stringify(condition)}`)
    }
    return value === condition
  })
}

vi.mock('@/lib/db', () => ({
  db: {
    serviceRecord: {
      findMany: vi.fn(async ({ where }: { where: Record<string, unknown> }) =>
        state.jobs
          .filter((job) => matches(job, where))
          .map((job) => ({
            ...job,
            updatedAt: new Date(),
            vehicle: null,
            customer: null,
            attachments: [],
            _count: { partItems: 0, laborItems: 0 },
          }))
      ),
      findFirst: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
        const job = state.jobs.find((j) => matches(j, where))
        return job ? { ...job, vehicleId: null, vehicle: null } : null
      }),
      update: vi.fn(
        async ({ where, data }: { where: { id: string }; data: { status: string } }) => {
          const job = state.jobs.find((j) => j.id === where.id)
          if (job) job.status = data.status
          return { id: where.id, status: data.status }
        }
      ),
    },
    timeEntry: {
      findFirst: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
        const open = state.entries.find((e) => matches(e, where))
        return open ? { ...open, serviceRecord: { id: open.serviceRecordId } } : null
      }),
      findMany: vi.fn(async ({ where }: { where: Record<string, unknown> }) =>
        state.entries.filter((e) => matches(e, where))
      ),
      updateMany: vi.fn(
        async ({ where, data }: { where: Record<string, unknown>; data: Partial<Entry> }) => {
          const hit = state.entries.filter((e) => matches(e, where))
          for (const entry of hit) Object.assign(entry, data)
          return { count: hit.length }
        }
      ),
    },
    technician: { findFirst: vi.fn(async () => ({ name: 'Andy' })) },
    appSetting: { findFirst: vi.fn(async () => ({ value: 'false' })) },
  },
}))

vi.mock('@/lib/workshop-timezone', () => ({ workshopTimeZone: vi.fn(async () => 'UTC') }))
vi.mock('@/lib/notify', () => ({ notify: vi.fn(async () => undefined) }))
vi.mock('@/features/vehicles/Lib/jobEvents', () => ({ announceJobStatusChanged: vi.fn() }))

vi.mock('@/lib/with-api-auth', async () => {
  const actual = await vi.importActual<typeof import('@/lib/with-api-auth')>('@/lib/with-api-auth')
  return {
    ...actual,
    withApiAuth: vi.fn(
      async (
        _request: Request,
        handler: (ctx: {
          organizationId: string
          technicianIds: string[]
          isAdmin: boolean
        }) => Promise<Response>
      ) =>
        handler({
          organizationId: 'org-1',
          technicianIds: state.technicianIds,
          isAdmin: state.isAdmin,
        })
    ),
  }
})

import { GET as listJobs } from '@/app/api/v1/tech/jobs/route'
import { PATCH as setStatus } from '@/app/api/v1/tech/jobs/[id]/status/route'

async function myJobs(): Promise<string[]> {
  const response = await listJobs(new Request('https://app.test/api/v1/tech/jobs'))
  const body = await response.json()
  return (body.data.jobs as { id: string }[]).map((job) => job.id)
}

function finish(id: string, status = 'completed') {
  return setStatus(
    new Request(`https://app.test/api/v1/tech/jobs/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    }),
    { params: Promise.resolve({ id }) }
  )
}

const job = (over: Partial<Job> & { id: string }): Job => ({
  organizationId: 'org-1',
  title: over.id,
  status: 'in-progress',
  technicianId: null,
  helpers: [],
  startDateTime: null,
  ...over,
})

const running = (id: string, technicianId: string, serviceRecordId: string): Entry => ({
  id,
  organizationId: 'org-1',
  serviceRecordId,
  technicianId,
  startedAt: new Date(Date.now() - 90 * 60_000),
  endedAt: null,
  durationMinutes: null,
})

beforeEach(() => {
  state.technicianIds = ['sam-row']
  state.isAdmin = false
  state.entries = []
  state.jobs = [
    job({ id: 'truck', technicianId: 'andy-row', helpers: [{ technicianId: 'sam-row' }] }),
    job({ id: 'brakes', technicianId: 'jo-row' }),
    job({ id: 'own', technicianId: 'sam-row' }),
    job({ id: 'elsewhere', organizationId: 'org-2', helpers: [{ technicianId: 'sam-row' }] }),
  ]
})

describe('the job list of somebody helping on a job', () => {
  it('has the job they are helping on, beside their own', async () => {
    expect((await myJobs()).sort()).toEqual(['own', 'truck'])
  })

  it('does not have a job they are on neither way', async () => {
    expect(await myJobs()).not.toContain('brakes')
  })

  it('never reaches into another workshop', async () => {
    expect(await myJobs()).not.toContain('elsewhere')
  })

  it('loses the job again once they are taken off it', async () => {
    state.jobs[0].helpers = []

    expect(await myJobs()).toEqual(['own'])
  })

  it('still shows the technician the same job', async () => {
    state.technicianIds = ['andy-row']

    expect(await myJobs()).toEqual(['truck'])
  })
})

describe('finishing a job two people are clocked on', () => {
  beforeEach(() => {
    state.technicianIds = ['andy-row']
    state.entries = [
      running('andy-clock', 'andy-row', 'truck'),
      running('sam-clock', 'sam-row', 'truck'),
      running('jo-clock', 'jo-row', 'brakes'),
    ]
  })

  const open = () => state.entries.filter((e) => e.endedAt === null).map((e) => e.id)

  it('stops both their clocks, and nobody else’s', async () => {
    const response = await finish('truck')

    expect(response.status).toBe(200)
    expect(open()).toEqual(['jo-clock'])
  })

  it('tells the one who finished it how long their own stretch was', async () => {
    const body = await (await finish('truck')).json()

    expect(body.data.stoppedMinutes).toBe(90)
  })

  it('stops them too when the job is parked for parts', async () => {
    await finish('truck', 'waiting-parts')

    expect(open()).toEqual(['jo-clock'])
  })

  it('lets the helper be the one who finishes it', async () => {
    state.technicianIds = ['sam-row']

    const response = await finish('truck')

    expect(response.status).toBe(200)
    expect(open()).toEqual(['jo-clock'])
  })

  it('leaves every clock running when the job only goes back in progress', async () => {
    await finish('truck', 'in-progress')

    expect(open().sort()).toEqual(['andy-clock', 'jo-clock', 'sam-clock'])
  })

  it('refuses somebody who is not on the job, and stops nothing', async () => {
    state.technicianIds = ['jo-row']

    const response = await finish('truck')

    expect(response.status).toBe(404)
    expect(open().sort()).toEqual(['andy-clock', 'jo-clock', 'sam-clock'])
  })
})
