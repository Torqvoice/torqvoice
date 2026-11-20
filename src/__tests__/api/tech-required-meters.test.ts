/**
 * @vitest-environment node
 *
 * Required meters in the technician app's API, additive only.
 *
 * Each meter of a job says whether the workshop requires its reading
 * (`required`), false everywhere for a workshop that requires none. A job is
 * not completed from the phone without those readings: 409
 * `meters_required`, the human sentence naming them, and the meters in
 * `details.meters` by `vehicleMeterId` and name, in the error shape the app
 * already reads for `document_locked`. Nothing about the job moves, its
 * clocks included. Every other status, and a job without required meters,
 * goes through as it always has.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const decimal = (n: number) => ({ toNumber: () => n, toString: () => String(n) })

const world = vi.hoisted(() => ({
  required: true,
  reading: null as number | null,
  status: 'in-progress',
}))

vi.mock('@/lib/db', () => ({
  db: {
    meterType: {
      findFirst: vi.fn(async ({ where }: { where: { required?: boolean } }) =>
        where.required && world.required ? { id: 't-pto' } : null
      ),
      findMany: vi.fn(async () => [
        { id: 't-pto', name: 'PTO hours', unit: 'hrs', required: world.required },
        { id: 't-engine', name: 'Engine hours', unit: 'hrs', required: false },
      ]),
    },
    vehicleMeter: {
      findMany: vi.fn(async () => [
        {
          id: 'vm-pto',
          meterTypeId: 't-pto',
          readings:
            world.reading == null
              ? []
              : [
                  {
                    id: 'r1',
                    value: decimal(world.reading),
                    readAt: new Date('2026-11-01T10:00:00Z'),
                    createdAt: new Date('2026-11-01T10:00:00Z'),
                    replacedFrom: null,
                    wrongAt: null,
                    source: 'tech',
                    serviceRecordId: 'job-1',
                    serviceRecord: {
                      id: 'job-1',
                      title: 'Service',
                      invoiceNumber: null,
                      vehicleId: 'veh-1',
                      startDateTime: null,
                      serviceDate: new Date('2026-11-01T10:00:00Z'),
                    },
                  },
                ],
        },
        { id: 'vm-engine', meterTypeId: 't-engine', readings: [] },
      ]),
    },
    serviceRecord: {
      findFirst: vi.fn(async () => ({
        id: 'job-1',
        status: world.status,
        title: 'Service',
        vehicleId: 'veh-1',
        vehicle: null,
        startDateTime: null,
        serviceDate: new Date('2026-11-01T10:00:00Z'),
        issuedAt: null,
        editUnlockedAt: null,
        inspectionId: null,
        createdAt: new Date('2026-11-01T09:00:00Z'),
        invoiceNumber: 'WO-1',
      })),
      update: vi.fn(async ({ data }: { data: { status: string } }) => ({
        id: 'job-1',
        status: data.status,
      })),
    },
    serviceRecordEquipment: { findMany: vi.fn(async () => []) },
    equipmentType: { findMany: vi.fn(async () => []) },
    technician: { findFirst: vi.fn(async () => ({ name: 'Andy' })) },
    appSetting: { findFirst: vi.fn(async () => ({ value: 'false' })) },
  },
}))
vi.mock('@/lib/features', () => ({
  getFeatures: vi.fn(async () => ({ customFields: true })),
  isCloudMode: () => false,
}))
vi.mock('@/lib/document-lock.server', () => ({
  getInvoiceLockState: vi.fn(async () => ({ locked: false, reason: null, unlockedAt: null })),
}))
vi.mock('next-intl/server', () => ({
  getTranslations: async () => (key: string, values?: { meters: string }) =>
    key === 'requiredNotCompleted' ? `Not completed. Fill in: ${values?.meters}` : key,
}))
vi.mock('@/features/time-tracking/Lib/timeEntries', () => ({
  stopJobClocks: vi.fn(async () => []),
}))
vi.mock('@/lib/notify', () => ({ notify: vi.fn(async () => undefined) }))
vi.mock('@/features/vehicles/Lib/jobEvents', () => ({ announceJobStatusChanged: vi.fn() }))
vi.mock('@/lib/with-api-auth', async () => {
  const actual = await vi.importActual<typeof import('@/lib/with-api-auth')>('@/lib/with-api-auth')
  return {
    ...actual,
    withApiAuth: vi.fn(async (_request: Request, handler: (ctx: unknown) => Promise<Response>) =>
      handler({ organizationId: 'org-1', userId: 'u1', technicianIds: ['t1'], isAdmin: true })
    ),
  }
})

import { db } from '@/lib/db'
import { stopJobClocks } from '@/features/time-tracking/Lib/timeEntries'
import { PATCH as setStatus } from '@/app/api/v1/tech/jobs/[id]/status/route'
import { GET as getMeters } from '@/app/api/v1/tech/jobs/[id]/meters/route'

const params = { params: Promise.resolve({ id: 'job-1' }) }
const move = (status: string) =>
  setStatus(
    new Request('https://app.test/api/v1/tech/jobs/job-1/status', {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    }),
    params
  )

beforeEach(() => {
  vi.clearAllMocks()
  world.required = true
  world.reading = null
  world.status = 'in-progress'
})

describe('a job’s meters in the app', () => {
  it('say which readings the workshop requires', async () => {
    const response = await getMeters(new Request('https://app.test/x'), params)
    const body = await response.json()
    expect(
      body.data.meters.map((m: { name: string; required: boolean }) => [m.name, m.required])
    ).toEqual([
      ['PTO hours', true],
      ['Engine hours', false],
    ])
  })

  it('all say false for a workshop that requires none', async () => {
    world.required = false
    const body = await (await getMeters(new Request('https://app.test/x'), params)).json()
    expect(body.data.meters.every((m: { required: boolean }) => m.required === false)).toBe(true)
  })
})

describe('completing a job from the phone', () => {
  it('is refused while a required reading is missing, naming it, with nothing moved', async () => {
    const response = await move('completed')
    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({
      error: {
        code: 'meters_required',
        message: 'Not completed. Fill in: PTO hours',
        details: {
          meters: [
            { vehicleMeterId: 'vm-pto', meterTypeId: 't-pto', name: 'PTO hours', item: null },
          ],
        },
      },
    })
    expect(db.serviceRecord.update).not.toHaveBeenCalled()
    expect(stopJobClocks).not.toHaveBeenCalled()
  })

  it('goes through once the job has the reading', async () => {
    world.reading = 812.5
    const response = await move('completed')
    expect(response.status).toBe(200)
    expect((await response.json()).data.job).toEqual({ id: 'job-1', status: 'completed' })
  })

  it('goes through as before for a workshop that requires no meter', async () => {
    world.required = false
    expect((await move('completed')).status).toBe(200)
  })

  it('is never asked of any other status', async () => {
    for (const status of ['pending', 'in-progress', 'waiting-parts']) {
      expect((await move(status)).status).toBe(200)
    }
  })
})
