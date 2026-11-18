/**
 * Booked once, on a real PostgreSQL (`npm run test:db` with E2E_DATABASE_URL
 * set).
 *
 * Two things the unit tests can only describe. The booking token is unique
 * within a workshop, so the second of two sends that arrive together is
 * refused by the database rather than by a lookup that both passed; a job
 * booked any other way has no token, and any number of those sit side by
 * side. And the draft the "New work order" page just made is found again
 * when all it carries is the workshop's shop fee.
 *
 * It makes one person and two workshops of its own and removes them again; it empties
 * nothing.
 */
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const url = process.env.E2E_DATABASE_URL ?? ''
const databaseName = url.split('/').pop()?.split('?')[0]?.toLowerCase() ?? ''
if (url && !/test|e2e/.test(databaseName)) {
  throw new Error(
    `Refusing to use database "${databaseName}": its name must say test or e2e, like the rest of this suite.`
  )
}

// Set before the app's modules load, so the client connects to the test database.
process.env.DATABASE_URL = url

const stamp = randomUUID().slice(0, 8)
const TOKEN = `token-${randomUUID()}`
const HOUR = 3_600_000
const START = new Date('2026-11-18T09:00:00Z')

let db: typeof import('@/lib/db')['db']
let untouchedDraftWhere: typeof import('@/features/vehicles/Lib/untouchedDraft')['untouchedDraftWhere']
let organizationId = ''
let otherOrganizationId = ''
let vehicleId = ''
let userId = ''

beforeAll(async () => {
  ;({ db } = await import('@/lib/db'))
  ;({ untouchedDraftWhere } = await import('@/features/vehicles/Lib/untouchedDraft'))
  organizationId = (await db.organization.create({ data: { name: `Booking ${stamp}` } })).id
  otherOrganizationId = (await db.organization.create({ data: { name: `Other ${stamp}` } })).id
  userId = (
    await db.user.create({
      data: { name: `Booking ${stamp}`, email: `booking-${stamp}@example.com` },
    })
  ).id
  vehicleId = (
    await db.vehicle.create({
      data: { make: 'Volvo', model: '240', year: 1990, organizationId, userId },
    })
  ).id
})

afterAll(async () => {
  // Jobs, appointments and the vehicle go with their workshop.
  const ids = [organizationId, otherOrganizationId].filter(Boolean)
  if (ids.length) await db.organization.deleteMany({ where: { id: { in: ids } } })
  if (userId) await db.user.deleteMany({ where: { id: userId } })
})

const job = (org: string, bookingToken: string | null) =>
  db.serviceRecord.create({ data: { title: 'Booked', organizationId: org, bookingToken } })

const appointment = (org: string, bookingToken: string | null) =>
  db.appointment.create({
    data: {
      title: 'Call',
      organizationId: org,
      bookingToken,
      startAt: START,
      endAt: new Date(START.getTime() + HOUR),
    },
  })

describe('the booking token on PostgreSQL', () => {
  it('lets a workshop book one job with a token and refuses the second', async () => {
    await job(organizationId, TOKEN)

    await expect(job(organizationId, TOKEN)).rejects.toMatchObject({ code: 'P2002' })
    expect(await db.serviceRecord.count({ where: { organizationId, bookingToken: TOKEN } })).toBe(1)
  })

  it('lets a workshop book one appointment with a token and refuses the second', async () => {
    await appointment(organizationId, TOKEN)

    await expect(appointment(organizationId, TOKEN)).rejects.toMatchObject({ code: 'P2002' })
    expect(await db.appointment.count({ where: { organizationId, bookingToken: TOKEN } })).toBe(1)
  })

  it('refuses one of two that arrive together', async () => {
    const token = `together-${randomUUID()}`
    const results = await Promise.allSettled([
      job(organizationId, token),
      job(organizationId, token),
    ])

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
    expect(await db.serviceRecord.count({ where: { organizationId, bookingToken: token } })).toBe(1)
  })

  it('is only unique within the workshop', async () => {
    await expect(job(otherOrganizationId, TOKEN)).resolves.toBeTruthy()
    await expect(appointment(otherOrganizationId, TOKEN)).resolves.toBeTruthy()
  })

  it('leaves jobs and appointments made any other way alone: none has a token', async () => {
    await job(organizationId, null)
    await job(organizationId, null)
    await appointment(organizationId, null)
    await appointment(organizationId, null)

    expect(
      await db.serviceRecord.count({ where: { organizationId, bookingToken: null } })
    ).toBeGreaterThanOrEqual(2)
  })
})

describe('the draft the New work order page just made, on PostgreSQL', () => {
  const draft = (lines: { pricingType: string }[], parts = 0) =>
    db.serviceRecord.create({
      data: {
        title: 'Draft',
        status: 'pending',
        organizationId,
        vehicleId,
        laborItems: {
          create: lines.map((line) => ({
            description: line.pricingType,
            hours: 1,
            rate: 10,
            total: 10,
            pricingType: line.pricingType,
          })),
        },
        partItems: {
          create: Array.from({ length: parts }, () => ({
            name: 'Oil filter',
            quantity: 1,
            unitPrice: 10,
            total: 10,
          })),
        },
      },
      select: { id: true },
    })

  const found = async () =>
    (
      await db.serviceRecord.findMany({
        where: untouchedDraftWhere({ vehicleId, organizationId, now: new Date() }),
        select: { id: true },
      })
    ).map((record) => record.id)

  it('finds the one with nothing on it and the one with only the shop fee', async () => {
    const empty = await draft([])
    const feeOnly = await draft([{ pricingType: 'shopFee' }])
    const worked = await draft([{ pricingType: 'shopFee' }, { pricingType: 'hourly' }])
    const withPart = await draft([{ pricingType: 'shopFee' }], 1)

    const ids = await found()

    expect(ids).toContain(empty.id)
    expect(ids).toContain(feeOnly.id)
    expect(ids).not.toContain(worked.id)
    expect(ids).not.toContain(withPart.id)
  })

  it("finds nothing from another workshop's side", async () => {
    await draft([])

    const ids = await db.serviceRecord.findMany({
      where: untouchedDraftWhere({
        vehicleId,
        organizationId: otherOrganizationId,
        now: new Date(),
      }),
    })

    expect(ids).toHaveLength(0)
  })
})
