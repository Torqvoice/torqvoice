/**
 * @vitest-environment node
 *
 * When a job's reading becomes the vehicle's current reading.
 *
 * Every writer of a job's reading asks the same question (vehicleReading.ts),
 * so a workshop sees one behaviour whether the reading was typed on the work
 * order, sent by the technician app, raised from an inspection or imported:
 * the newest reading moves the vehicle forward, and nothing winds it back.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import {
  applyJobReading,
  isLowerReading,
  jobReadingDate,
  lastReadingBeforeJob,
} from '@/features/vehicles/Lib/vehicleReading'

type Job = {
  id: string
  organizationId: string
  vehicleId: string
  mileage: number | null
  startDateTime: Date | null
  serviceDate: Date
}

const ORG = 'org-1'
const VEHICLE = 'veh-1'
const day = (d: string) => new Date(`${d}T09:00:00Z`)

const state = {
  vehicles: [] as { id: string; organizationId: string; mileage: number }[],
  jobs: [] as Job[],
}

/** Enough of Prisma's `where` for the queries the rule makes. */
function matches(row: Record<string, unknown>, where: Record<string, unknown>): boolean {
  return Object.entries(where).every(([key, cond]) => {
    if (key === 'OR') return (cond as Record<string, unknown>[]).some((c) => matches(row, c))
    const value = row[key]
    if (cond === null || typeof cond !== 'object' || cond instanceof Date) return value === cond
    const c = cond as { not?: unknown; gt?: number | Date; lt?: number | Date }
    if ('not' in c) return value !== c.not
    if (value == null) return false
    if (c.gt !== undefined) return (value as number | Date) > c.gt
    if (c.lt !== undefined) return (value as number | Date) < c.lt
    throw new Error(`Unhandled condition on ${key}`)
  })
}

const client = {
  serviceRecord: {
    findFirst: async ({ where }: { where: Record<string, unknown> }) =>
      state.jobs.find((j) => matches(j, where)) ?? null,
    aggregate: async ({ where }: { where: Record<string, unknown> }) => {
      const readings = state.jobs.filter((j) => matches(j, where)).map((j) => j.mileage as number)
      return { _max: { mileage: readings.length ? Math.max(...readings) : null } }
    },
  },
  vehicle: {
    updateMany: async ({
      where,
      data,
    }: {
      where: Record<string, unknown>
      data: { mileage: number }
    }) => {
      const hit = state.vehicles.filter((v) => matches(v, where))
      for (const v of hit) v.mileage = data.mileage
      return { count: hit.length }
    },
  },
} as unknown as Parameters<typeof applyJobReading>[0]

function job(id: string, date: string, mileage: number | null, over: Partial<Job> = {}): Job {
  const row = {
    id,
    organizationId: ORG,
    vehicleId: VEHICLE,
    mileage,
    startDateTime: day(date),
    serviceDate: day(date),
    ...over,
  }
  state.jobs.push(row)
  return row
}

const vehicle = () => state.vehicles[0]

/** A reading saved on a job, the way each writer reports it. */
function save(j: Job, reading: number | null, previousReading?: number | null) {
  j.mileage = reading
  return applyJobReading(client, {
    organizationId: ORG,
    vehicleId: j.vehicleId,
    jobId: j.id,
    jobDate: jobReadingDate(j),
    reading,
    previousReading,
  })
}

beforeEach(() => {
  state.vehicles = [{ id: VEHICLE, organizationId: ORG, mileage: 100_000 }]
  state.jobs = []
})

describe('a job reading and the vehicle', () => {
  it('moves the vehicle forward when the newest job reads higher', async () => {
    job('old', '2026-03-01', 90_000)
    const today = job('today', '2026-11-19', null)
    expect(await save(today, 104_500, null)).toBe(true)
    expect(vehicle().mileage).toBe(104_500)
  })

  it('leaves the vehicle alone when the reading is lower', async () => {
    const today = job('today', '2026-11-19', null)
    expect(await save(today, 99_000, null)).toBe(false)
    expect(vehicle().mileage).toBe(100_000)
  })

  it('leaves the vehicle alone when the reading is the same', async () => {
    const today = job('today', '2026-11-19', null)
    expect(await save(today, 100_000, null)).toBe(false)
    expect(vehicle().mileage).toBe(100_000)
  })

  it('gives a vehicle with no reading its first one', async () => {
    vehicle().mileage = 0
    const first = job('first', '2026-11-19', null)
    expect(await save(first, 12_345)).toBe(true)
    expect(vehicle().mileage).toBe(12_345)
  })

  it('says nothing for a cleared reading or a zero', async () => {
    const today = job('today', '2026-11-19', 104_500)
    expect(await save(today, null, 104_500)).toBe(false)
    expect(await save(today, 0, null)).toBe(false)
    expect(vehicle().mileage).toBe(100_000)
  })

  it('does not let an old job being edited push today’s reading forward', async () => {
    const old = job('old', '2026-03-01', 90_000)
    job('newer', '2026-10-01', 100_000)
    // A slip of the finger on the March job: one digit too many.
    expect(await save(old, 900_000, 90_000)).toBe(false)
    expect(vehicle().mileage).toBe(100_000)
  })

  it('is not held back by a later booking that has no reading yet', async () => {
    const today = job('today', '2026-11-19', null)
    job('booked', '2026-12-10', null)
    expect(await save(today, 104_500, null)).toBe(true)
    expect(vehicle().mileage).toBe(104_500)
  })

  it('does not undo a reading corrected by hand when the job is saved again', async () => {
    // The cluster was replaced on this job: 180 000 on the way in, and the
    // vehicle set to the new odometer's 5 on the vehicle form.
    const today = job('today', '2026-11-19', 180_000)
    vehicle().mileage = 5
    expect(await save(today, 180_000, 180_000)).toBe(false)
    expect(vehicle().mileage).toBe(5)
  })

  it('dates a job without a start by its service date', async () => {
    const undated = job('undated', '2026-03-01', null, { startDateTime: null })
    job('newer', '2026-10-01', 100_000, { startDateTime: null })
    expect(await save(undated, 150_000, null)).toBe(false)
    const latest = job('latest', '2026-11-19', null, { startDateTime: null })
    expect(await save(latest, 150_000, null)).toBe(true)
    expect(vehicle().mileage).toBe(150_000)
  })

  it('never touches another workshop’s vehicle or reads its jobs', async () => {
    state.vehicles.push({ id: VEHICLE, organizationId: 'org-2', mileage: 10 })
    job('theirs', '2026-12-01', 500_000, { organizationId: 'org-2' })
    const today = job('today', '2026-11-19', null)
    expect(await save(today, 104_500, null)).toBe(true)
    expect(state.vehicles[1].mileage).toBe(10)
  })
})

describe('the last reading a job is compared with', () => {
  const lastFor = (j: Job) =>
    lastReadingBeforeJob(client, {
      organizationId: ORG,
      vehicleId: VEHICLE,
      jobId: j.id,
      jobDate: jobReadingDate(j),
      vehicleReading: vehicle().mileage,
    })

  it('is the vehicle’s for the newest job', async () => {
    job('old', '2026-03-01', 90_000)
    expect(await lastFor(job('today', '2026-11-19', null))).toBe(100_000)
  })

  it('is an earlier job’s when that is higher than the vehicle’s', async () => {
    job('old', '2026-03-01', 120_000)
    expect(await lastFor(job('today', '2026-11-19', null))).toBe(120_000)
  })

  it('is the earlier job’s for an old job, not today’s reading', async () => {
    job('first', '2025-01-10', 60_000)
    const old = job('old', '2026-03-01', 90_000)
    job('newer', '2026-10-01', 100_000)
    expect(await lastFor(old)).toBe(60_000)
  })

  it('is nothing when nothing is known', async () => {
    vehicle().mileage = 0
    expect(await lastFor(job('today', '2026-11-19', null))).toBeNull()
  })
})

describe('what counts as a lower reading in the field', () => {
  it('is a number below the last one', () => {
    expect(isLowerReading('99999', 100_000)).toBe(true)
    expect(isLowerReading('0', 100_000)).toBe(true)
  })

  it('is not an equal or higher one, an empty field, or an unknown last reading', () => {
    expect(isLowerReading('100000', 100_000)).toBe(false)
    expect(isLowerReading('100001', 100_000)).toBe(false)
    expect(isLowerReading('', 100_000)).toBe(false)
    expect(isLowerReading('  ', 100_000)).toBe(false)
    expect(isLowerReading('abc', 100_000)).toBe(false)
    expect(isLowerReading('5', null)).toBe(false)
    expect(isLowerReading('5', 0)).toBe(false)
  })
})
