/**
 * A vehicle's reading and the readings on its jobs, on a real PostgreSQL
 * (`npm run test:db` with E2E_DATABASE_URL set).
 *
 * The rule (src/features/vehicles/Lib/vehicleReading.ts) compares and sets
 * in the database's own WHERE, which a mocked client cannot say anything
 * about, so this runs the real save actions against a real database: the
 * work order save, a new job, the vehicle form, deleting a job, moving it,
 * and the technician app's check-in. What a workshop would see is the
 * vehicle's reading afterwards, and whether the reading field warns.
 *
 * It makes two workshops of its own and removes them again; it empties nothing.
 */
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const url = process.env.E2E_DATABASE_URL ?? ''
const databaseName = url.split('/').pop()?.split('?')[0]?.toLowerCase() ?? ''
if (url && !/test|e2e/.test(databaseName)) {
  throw new Error(
    `Refusing to use database "${databaseName}": its name must say test or e2e, like the rest of this suite.`
  )
}

// Set before the app's modules load, so the client connects to the test database.
process.env.DATABASE_URL = url

/** Who is signed in: the session the actions see. */
const who = vi.hoisted(() => ({ userId: '', organizationId: '' }))

vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }))
vi.mock('next/headers', () => ({
  headers: async () => new Headers(),
  cookies: async () => ({ get: () => undefined, getAll: () => [] }),
}))
vi.mock('@/lib/cached-session', () => ({
  getCachedSession: async () => ({ user: { id: who.userId }, session: {} }),
  getCachedMembership: async () => ({
    organizationId: who.organizationId,
    role: 'owner',
    roleId: null,
    customRole: null,
  }),
}))
// The technician app: signed in as an owner of the workshop, with the job on
// their list. Who may check a job in is tested with the route itself.
vi.mock('@/lib/with-api-auth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/with-api-auth')>()),
  withApiAuth: async (_request: Request, handler: (ctx: unknown) => Promise<Response>) =>
    handler({
      userId: who.userId,
      organizationId: who.organizationId,
      role: 'owner',
      isSuperAdmin: false,
      isAdmin: true,
      technicianIds: [],
    }),
}))
vi.mock('@/features/condition-map/Lib/checkinAccess.server', async (importOriginal) => {
  const real =
    await importOriginal<typeof import('@/features/condition-map/Lib/checkinAccess.server')>()
  const { db } = await import('@/lib/db')
  return {
    ...real,
    checkinJobFor: async (ctx: { organizationId: string }, id: string) => {
      const job = await db.serviceRecord.findFirst({
        where: { id, organizationId: ctx.organizationId, vehicleId: { not: null } },
        select: { id: true, vehicleId: true, status: true, title: true },
      })
      return job ? { ...job, vehicleId: job.vehicleId as string, ref: job.title } : null
    },
  }
})

const stamp = randomUUID().slice(0, 8)

let db: typeof import('@/lib/db')['db']
let actions: typeof import('@/features/vehicles/Actions/serviceActions')
let vehicleActions: typeof import('@/features/vehicles/Actions/vehicleActions')
let reading: typeof import('@/features/vehicles/Lib/vehicleReading')
let checkin: typeof import('@/app/api/v1/tech/jobs/[id]/checkin/route')

const workshops: { userId: string; organizationId: string }[] = []

async function makeWorkshop(name: string) {
  const user = await db.user.create({
    data: { name: `${name} ${stamp}`, email: `reading-${name}-${stamp}@example.com` },
  })
  const organization = await db.organization.create({ data: { name: `${name} ${stamp}` } })
  await db.organizationMember.create({
    data: { userId: user.id, organizationId: organization.id, role: 'owner' },
  })
  const workshop = { userId: user.id, organizationId: organization.id }
  workshops.push(workshop)
  return workshop
}

let home: { userId: string; organizationId: string }
let other: { userId: string; organizationId: string }

function signIn(workshop: { userId: string; organizationId: string }) {
  who.userId = workshop.userId
  who.organizationId = workshop.organizationId
}

/** A vehicle as the vehicle form left it: a reading that is nobody's job's. */
async function makeVehicle(mileage: number, workshop = home) {
  const vehicle = await db.vehicle.create({
    data: {
      make: 'ZZ Toyota',
      model: 'Hilux',
      year: 2015,
      mileage,
      userId: workshop.userId,
      organizationId: workshop.organizationId,
    },
  })
  return vehicle.id
}

function ok<T>(result: { success: boolean; data?: T; error?: string }): T {
  expect(result.success, result.error).toBe(true)
  return result.data as T
}

/** A new job through the action, as the new work order page saves it. */
async function newJob(vehicleId: string, date: string, mileage?: number | null) {
  const job = ok(
    await actions.createServiceRecord({
      vehicleId,
      title: `ZZ job ${date}`,
      serviceDate: `${date}T09:00:00.000Z`,
      ...(mileage !== undefined ? { mileage } : {}),
    })
  )
  return job.id
}

/** A save of the work order page, which sends the reading with everything else. */
async function saveJob(id: string, fields: Record<string, unknown>) {
  ok(await actions.updateServiceRecord({ id, ...fields }))
}

async function vehicleOf(id: string) {
  return db.vehicle.findUniqueOrThrow({
    where: { id },
    select: { mileage: true, readingJobId: true, readingBeforeJob: true },
  })
}

/** What the work order's reading field compares a typed reading with. */
async function lastReadingFor(jobId: string) {
  const job = await db.serviceRecord.findUniqueOrThrow({
    where: { id: jobId },
    select: {
      id: true,
      organizationId: true,
      vehicleId: true,
      startDateTime: true,
      serviceDate: true,
      vehicle: { select: { mileage: true, readingJobId: true, readingBeforeJob: true } },
    },
  })
  if (!job.vehicle || !job.vehicleId || !job.organizationId) throw new Error('No vehicle')
  return reading.lastReadingBeforeJob(db, {
    organizationId: job.organizationId,
    vehicleId: job.vehicleId,
    jobId: job.id,
    jobDate: reading.jobReadingDate(job),
    vehicle: job.vehicle,
  })
}

beforeAll(async () => {
  ;({ db } = await import('@/lib/db'))
  actions = await import('@/features/vehicles/Actions/serviceActions')
  vehicleActions = await import('@/features/vehicles/Actions/vehicleActions')
  reading = await import('@/features/vehicles/Lib/vehicleReading')
  checkin = await import('@/app/api/v1/tech/jobs/[id]/checkin/route')
  home = await makeWorkshop('ZZ Reading Home')
  other = await makeWorkshop('ZZ Reading Other')
})

beforeEach(() => signIn(home))

afterAll(async () => {
  if (db) {
    // Vehicles, jobs and audit rows go with the workshop.
    for (const { organizationId, userId } of workshops) {
      await db.organization.delete({ where: { id: organizationId } }).catch(() => undefined)
      await db.user.delete({ where: { id: userId } }).catch(() => undefined)
    }
    await db.$disconnect()
  }
})

describe('a typo on the job that set the vehicle’s reading', () => {
  it('brings the vehicle back down when the job is corrected', async () => {
    const car = await makeVehicle(148_000)
    // One digit too many.
    const job = await newJob(car, '2026-11-19', 1_490_000)
    expect(await vehicleOf(car)).toEqual({
      mileage: 1_490_000,
      readingJobId: job,
      readingBeforeJob: 148_000,
    })

    await saveJob(job, { mileage: 149_000 })
    expect(await vehicleOf(car)).toMatchObject({ mileage: 149_000, readingJobId: job })
    // The reading field does not warn the job about its own typo: it compares
    // with what the vehicle read before this job.
    expect(await lastReadingFor(job)).toBe(148_000)
  })

  it('never puts the vehicle below another job’s reading', async () => {
    const car = await makeVehicle(100_000)
    await newJob(car, '2026-10-01', 150_000)
    const job = await newJob(car, '2026-11-19', 1_500_000)
    expect((await vehicleOf(car)).mileage).toBe(1_500_000)

    await saveJob(job, { mileage: 149_000 })
    // The other job read 150,000: the vehicle stays there, and its reading is
    // no longer this job's to correct.
    expect(await vehicleOf(car)).toEqual({
      mileage: 150_000,
      readingJobId: null,
      readingBeforeJob: null,
    })
  })

  it('never puts the vehicle below what it read before the job', async () => {
    const car = await makeVehicle(148_000)
    const job = await newJob(car, '2026-11-19', 1_480_000)
    // Corrected, but to a second typo that is now too low.
    await saveJob(job, { mileage: 14_800 })
    expect(await vehicleOf(car)).toMatchObject({ mileage: 148_000, readingJobId: null })
    // Corrected again, right this time: up by the usual rule.
    await saveJob(job, { mileage: 148_500 })
    expect(await vehicleOf(car)).toMatchObject({ mileage: 148_500, readingJobId: job })
  })

  it('goes back to what the vehicle read before, when the job’s reading is cleared', async () => {
    const car = await makeVehicle(148_000)
    const job = await newJob(car, '2026-11-19', 1_490_000)
    await saveJob(job, { mileage: null })
    expect(await vehicleOf(car)).toEqual({
      mileage: 148_000,
      readingJobId: null,
      readingBeforeJob: null,
    })
  })

  it('goes to the highest other job when the cleared job had raised it', async () => {
    const car = await makeVehicle(0)
    await newJob(car, '2026-09-01', 120_000)
    const job = await newJob(car, '2026-11-19', 1_250_000)
    await saveJob(job, { mileage: null })
    expect((await vehicleOf(car)).mileage).toBe(120_000)
  })

  it('remembers what the vehicle read before the job when the same job raises it again', async () => {
    const car = await makeVehicle(148_000)
    const job = await newJob(car, '2026-11-19', 149_000)
    await saveJob(job, { mileage: 1_490_000 })
    expect(await vehicleOf(car)).toMatchObject({ mileage: 1_490_000, readingBeforeJob: 148_000 })
    await saveJob(job, { mileage: 149_500 })
    expect((await vehicleOf(car)).mileage).toBe(149_500)
  })
})

describe('a job that did not set the vehicle’s reading', () => {
  it('never lowers the vehicle', async () => {
    const car = await makeVehicle(100_000)
    const old = await newJob(car, '2026-03-01', 120_000)
    const newest = await newJob(car, '2026-11-19', 180_000)
    expect((await vehicleOf(car)).readingJobId).toBe(newest)

    await saveJob(old, { mileage: 90_000 })
    expect((await vehicleOf(car)).mileage).toBe(180_000)
    await saveJob(old, { mileage: null })
    expect((await vehicleOf(car)).mileage).toBe(180_000)
  })

  it('leaves alone a vehicle whose reading was set before jobs were remembered', async () => {
    // A job saved before this change: the vehicle carries its reading but
    // does not know it was that job's.
    const car = await makeVehicle(1_490_000)
    const job = await newJob(car, '2026-11-19')
    await db.serviceRecord.update({ where: { id: job }, data: { mileage: 1_490_000 } })
    await saveJob(job, { mileage: 149_000 })
    expect((await vehicleOf(car)).mileage).toBe(1_490_000)
  })

  it('does not let an old job being edited push today’s reading forward', async () => {
    const car = await makeVehicle(100_000)
    const old = await newJob(car, '2026-03-01', 90_000)
    await newJob(car, '2026-10-01', 100_000)
    await saveJob(old, { mileage: 900_000 })
    expect((await vehicleOf(car)).mileage).toBe(100_000)
  })

  it('is not held back by a later booking without a reading', async () => {
    const car = await makeVehicle(100_000)
    await newJob(car, '2026-12-10')
    const today = await newJob(car, '2026-11-19')
    await saveJob(today, { mileage: 104_500 })
    expect(await vehicleOf(car)).toMatchObject({ mileage: 104_500, readingJobId: today })
  })
})

describe('writes that end a job’s claim on the reading', () => {
  it('a reading changed on the vehicle form is the vehicle’s own from then on', async () => {
    const car = await makeVehicle(148_000)
    const job = await newJob(car, '2026-11-19', 1_490_000)

    // Saved with another field changed and the reading as it was: still the job's.
    ok(await vehicleActions.updateVehicle({ id: car, color: 'Red', mileage: 1_490_000 }))
    expect((await vehicleOf(car)).readingJobId).toBe(job)

    ok(await vehicleActions.updateVehicle({ id: car, mileage: 1_500_000 }))
    expect(await vehicleOf(car)).toEqual({
      mileage: 1_500_000,
      readingJobId: null,
      readingBeforeJob: null,
    })
    // So correcting the job no longer moves it.
    await saveJob(job, { mileage: 149_000 })
    expect((await vehicleOf(car)).mileage).toBe(1_500_000)
  })

  it('a deleted job leaves the vehicle on its reading, which is nobody’s job’s', async () => {
    const car = await makeVehicle(148_000)
    const job = await newJob(car, '2026-11-19', 1_490_000)
    ok(await actions.deleteServiceRecord(job))
    expect((await vehicleOf(car)).mileage).toBe(1_490_000)
    expect((await vehicleOf(car)).readingJobId).toBeNull()
  })

  it('a job moved to another vehicle leaves the first on its reading and speaks for the second', async () => {
    const first = await makeVehicle(148_000)
    const second = await makeVehicle(30_000)
    const job = await newJob(first, '2026-11-19', 1_490_000)

    await saveJob(job, { vehicleId: second, mileage: 1_490_000 })
    expect(await vehicleOf(first)).toMatchObject({ mileage: 1_490_000, readingJobId: null })
    expect(await vehicleOf(second)).toEqual({
      mileage: 1_490_000,
      readingJobId: job,
      readingBeforeJob: 30_000,
    })
    // Corrected on its new vehicle, that vehicle follows.
    await saveJob(job, { mileage: 31_000 })
    expect((await vehicleOf(second)).mileage).toBe(31_000)
    expect((await vehicleOf(first)).mileage).toBe(1_490_000)
  })
})

describe('the technician app’s check-in', () => {
  async function checkIn(jobId: string, mileage: number | null) {
    const response = await checkin.PATCH(
      new Request(`http://localhost/api/v1/tech/jobs/${jobId}/checkin`, {
        method: 'PATCH',
        body: JSON.stringify({ mileage }),
        headers: { 'content-type': 'application/json' },
      }),
      { params: Promise.resolve({ id: jobId }) }
    )
    expect(response.status).toBe(200)
    // The answer is as it was: the reading the app sent.
    expect(await response.json()).toMatchObject({ data: { mileage: mileage ?? undefined } })
  }

  it('follows the same rule: a typo moves the vehicle up, the correction brings it back', async () => {
    const car = await makeVehicle(148_000)
    const job = await newJob(car, '2026-11-19')
    await checkIn(job, 1_490_000)
    expect(await vehicleOf(car)).toMatchObject({ mileage: 1_490_000, readingJobId: job })
    await checkIn(job, 149_000)
    expect((await vehicleOf(car)).mileage).toBe(149_000)
  })
})

describe('two saves at once', () => {
  it('leave the vehicle on the job’s final reading', async () => {
    for (let round = 0; round < 5; round++) {
      const car = await makeVehicle(148_000)
      const job = await newJob(car, '2026-11-19', 1_490_000)
      await Promise.all([saveJob(job, { mileage: 149_000 }), saveJob(job, { mileage: 150_000 })])
      const saved = await db.serviceRecord.findUniqueOrThrow({
        where: { id: job },
        select: { mileage: true },
      })
      expect((await vehicleOf(car)).mileage).toBe(saved.mileage)
    }
  })

  it('on two jobs never leave the lower of two raises behind', async () => {
    for (let round = 0; round < 5; round++) {
      const car = await makeVehicle(100_000)
      const a = await newJob(car, '2026-11-19')
      const b = await newJob(car, '2026-11-19')
      await Promise.all([saveJob(a, { mileage: 110_000 }), saveJob(b, { mileage: 120_000 })])
      expect(await vehicleOf(car)).toMatchObject({
        mileage: 120_000,
        readingJobId: b,
        readingBeforeJob: expect.any(Number),
      })
    }
  })
})

describe('a correction and another job’s reading at the same moment', () => {
  it('leaves the vehicle on the other job’s reading when it is the higher one', async () => {
    // Job A set the vehicle to 1,490,000 by mistake; job B, on the same day,
    // has no reading yet.
    const car = await makeVehicle(148_000)
    const a = await newJob(car, '2026-11-19', 1_490_000)
    const b = await newJob(car, '2026-11-19')

    // A is corrected to 149,000 and its transaction is held open after the
    // rule has run. While it is open, B is saved with 160,000: before A has
    // committed, B can only see the vehicle at 1,490,000.
    let corrected!: () => void
    const correctedNow = new Promise<void>((resolve) => {
      corrected = resolve
    })
    const holdA = db.$transaction(
      async (tx) => {
        await reading.lockJobReading(tx, { organizationId: home.organizationId, jobId: a })
        await tx.serviceRecord.update({ where: { id: a }, data: { mileage: 149_000 } })
        await reading.applyJobReading(tx, {
          organizationId: home.organizationId,
          vehicleId: car,
          jobId: a,
          jobDate: new Date('2026-11-19T09:00:00Z'),
          reading: 149_000,
          previousReading: 1_490_000,
        })
        corrected()
        await new Promise((resolve) => setTimeout(resolve, 1500))
      },
      { timeout: 20_000 }
    )
    await correctedNow
    const saveB = saveJob(b, { mileage: 160_000 })
    await Promise.all([holdA, saveB])

    // B waited for A, then saw 149,000 and moved the vehicle on.
    expect(await vehicleOf(car)).toMatchObject({ mileage: 160_000, readingJobId: b })
  })
})

describe('another workshop', () => {
  it('cannot correct, move or read this workshop’s vehicle through a job id', async () => {
    const car = await makeVehicle(148_000)
    const job = await newJob(car, '2026-11-19', 1_490_000)

    signIn(other)
    const theirs = await makeVehicle(10, other)
    const result = await actions.updateServiceRecord({ id: job, mileage: 149_000 })
    expect(result.success).toBe(false)
    const moved = await actions.updateServiceRecord({ id: job, vehicleId: theirs })
    expect(moved.success).toBe(false)
    // The rule asked directly with the other workshop's id changes nothing either.
    expect(
      await reading.applyJobReading(db, {
        organizationId: other.organizationId,
        vehicleId: car,
        jobId: job,
        jobDate: new Date('2026-11-19T09:00:00Z'),
        reading: 149_000,
        previousReading: 1_490_000,
      })
    ).toBe(false)
    await reading.forgetJobReading(db, { organizationId: other.organizationId, jobId: job })

    expect(await vehicleOf(car)).toEqual({
      mileage: 1_490_000,
      readingJobId: job,
      readingBeforeJob: 148_000,
    })
    expect((await vehicleOf(theirs)).mileage).toBe(10)
  })
})
