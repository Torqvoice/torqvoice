/**
 * @vitest-environment node
 *
 * Equipment on a job's vehicle, from the technician app (`vehicle-equipment`).
 *
 * The technician standing at a truck sees the crane and the tail lift on it,
 * picks what the job works on, and reads those items' meters beside the
 * truck's own. The rules are the web's: only items on the job's vehicle, a
 * locked invoice refuses the change, an item taken off the list takes this
 * job's readings of its meters with it, and none of it exists for a workshop
 * that records no equipment. The app is installed separately, so the job
 * only gains keys.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

type Item = {
  id: string
  organizationId: string
  vehicleId: string
  typeId: string
  make: string | null
  model: string | null
  serialNumber: string | null
  removedAt: Date | null
  createdAt: Date
  type: { name: string; sortOrder: number }
}

const JOB = { id: 'job-1', vehicleId: 'veh-1', invoiceNumber: 'WO-7' }

function item(over: Partial<Item>): Item {
  return {
    id: 'item',
    organizationId: 'org-1',
    vehicleId: 'veh-1',
    typeId: 'type-crane',
    make: null,
    model: null,
    serialNumber: null,
    removedAt: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    type: { name: 'Crane', sortOrder: 0 },
    ...over,
  }
}

const state = {
  customFields: true,
  types: [{ id: 'type-crane', name: 'Crane', isActive: true }],
  items: [] as Item[],
  links: [] as { serviceRecordId: string; itemId: string; organizationId: string }[],
  locked: false,
  unlinked: [] as unknown[],
}

const ITEM_FIELDS = (row: Item) => ({
  id: row.id,
  typeId: row.typeId,
  make: row.make,
  model: row.model,
  serialNumber: row.serialNumber,
  manufactureYear: null,
  manufactureDate: null,
  installDate: null,
  notes: null,
  ratedCapacity: null,
  nextExaminationDue: null,
  lastExaminedAt: null,
  certificateReference: null,
  reportFileUrl: null,
  reportFileName: null,
  removedAt: row.removedAt,
  vehicleId: row.vehicleId,
  createdAt: row.createdAt,
  type: row.type,
})

type Where = Record<string, unknown>
const inOr = (value: unknown, cond: unknown) =>
  cond && typeof cond === 'object' && 'in' in (cond as object)
    ? (cond as { in: unknown[] }).in.includes(value)
    : value === cond

vi.mock('@/lib/db', () => {
  const db = {
    equipmentType: { findMany: vi.fn(async () => state.types) },
    equipmentItem: {
      findMany: vi.fn(async ({ where }: { where: Where }) =>
        state.items
          .filter(
            (i) =>
              i.organizationId === where.organizationId &&
              (where.vehicleId === undefined || i.vehicleId === where.vehicleId) &&
              (where.id === undefined || inOr(i.id, where.id)) &&
              (where.removedAt !== null || i.removedAt === null)
          )
          .map(ITEM_FIELDS)
      ),
    },
    serviceRecord: {
      findFirst: vi.fn(async ({ where, select }: { where: Where; select?: Where }) => {
        if (where.id !== JOB.id || where.organizationId !== 'org-1') return null
        // The job as the app's job screen reads it.
        if (select?.vehicle) {
          return {
            ...JOB,
            startDateTime: null,
            serviceDate: new Date('2026-11-20T08:00:00Z'),
            title: 'Service',
            customerReference: null,
            vehicle: { id: JOB.vehicleId, fleetNumber: null, hsn: null, tsn: null, customer: null },
            customer: null,
            timeEntries: [],
          }
        }
        return { ...JOB, startDateTime: null, serviceDate: new Date('2026-11-20T08:00:00Z') }
      }),
    },
    serviceRecordEquipment: {
      findMany: vi.fn(async ({ where }: { where: Where & { item?: Where } }) =>
        state.links
          .filter(
            (l) =>
              l.organizationId === where.organizationId &&
              l.serviceRecordId === where.serviceRecordId &&
              (!where.item ||
                state.items.some(
                  (i) =>
                    i.id === l.itemId &&
                    Object.entries(where.item ?? {}).every(
                      ([key, value]) => i[key as keyof Item] === value
                    )
                ))
          )
          .map((l) => ({ itemId: l.itemId }))
      ),
      deleteMany: vi.fn(async ({ where }: { where: Where }) => {
        state.links = state.links.filter(
          (l) => !(l.serviceRecordId === where.serviceRecordId && inOr(l.itemId, where.itemId))
        )
      }),
      createMany: vi.fn(async ({ data }: { data: typeof state.links }) => {
        state.links.push(...data)
      }),
    },
    meterReading: {
      updateMany: vi.fn(async (args: unknown) => {
        state.unlinked.push(args)
        return { count: 1 }
      }),
    },
    // The job's row lock: what the job is on as the lock is taken.
    $queryRaw: vi.fn(async () => [{ mileage: null, vehicleId: JOB.vehicleId }]),
    $transaction: vi.fn(async (run: (tx: unknown) => Promise<unknown>) => run(db)),
  }
  return { db }
})

vi.mock('@/lib/features', async (original) => ({
  ...(await original<typeof import('@/lib/features')>()),
  getFeatures: vi.fn(async () => ({ customFields: state.customFields })),
  requireFeature: vi.fn(),
}))
vi.mock('@/lib/document-lock.server', async () => {
  const { DocumentLockedError } =
    await vi.importActual<typeof import('@/lib/document-lock')>('@/lib/document-lock')
  return {
    assertInvoiceEditable: vi.fn(async () => {
      if (state.locked) throw new DocumentLockedError('sent')
    }),
    getInvoiceLockState: vi.fn(async () =>
      state.locked
        ? { locked: true, reason: 'sent', unlockedAt: null }
        : { locked: false, reason: null, unlockedAt: null }
    ),
  }
})
vi.mock('@/lib/audit', () => ({ logAudit: vi.fn(async () => undefined) }))
vi.mock('@/lib/realtime/publish.server', () => ({ publishRecordChange: vi.fn() }))
vi.mock('@/features/condition-map/Lib/checkinAccess.server', () => ({
  // The job is on this technician's list; any other id is not.
  checkinJobFor: vi.fn(async (_ctx: unknown, id: string) =>
    id === JOB.id
      ? { id: JOB.id, vehicleId: JOB.vehicleId, status: 'in-progress', ref: 'WO-7', scope: {} }
      : null
  ),
}))
// The meters route's own work is the meters library's, tested beside it;
// here it is what the route hands the app and the library.
vi.mock('@/features/meters/Lib/meters.server', async (original) => ({
  ...(await original<typeof import('@/features/meters/Lib/meters.server')>()),
  metersEnabled: vi.fn(async () => true),
  jobMeterViews: vi.fn(async () => []),
}))
vi.mock('@/features/meters/Lib/jobMeterReading.server', async (original) => ({
  ...(await original<typeof import('@/features/meters/Lib/jobMeterReading.server')>()),
  writeJobMeterReadings: vi.fn(async () => []),
}))
vi.mock('@/features/time-tracking/Lib/timeEntries', () => ({
  getOpenEntry: vi.fn(async () => null),
}))
vi.mock('@/features/vehicles/Lib/typeKeySetting', () => ({
  isTypeKeyEnabled: vi.fn(async () => false),
  gateTypeKey: <T>(vehicle: T) => vehicle,
}))
vi.mock('@/features/vehicles/Lib/fleetNumberSetting', async (original) => ({
  ...(await original<typeof import('@/features/vehicles/Lib/fleetNumberSetting')>()),
  isFleetNumberEnabled: vi.fn(async () => false),
}))
vi.mock('@/features/customer-reference/Lib/referenceSetting', async (original) => ({
  ...(await original<typeof import('@/features/customer-reference/Lib/referenceSetting')>()),
  isCustomerReferenceEnabled: vi.fn(async () => false),
}))
vi.mock('@/lib/with-api-auth', async () => {
  const actual = await vi.importActual<typeof import('@/lib/with-api-auth')>('@/lib/with-api-auth')
  return {
    ...actual,
    withApiAuth: vi.fn(async (_req: Request, handler: (ctx: unknown) => Promise<Response>) =>
      handler({ userId: 'user-1', organizationId: 'org-1', technicianIds: ['tech-1'] })
    ),
  }
})

import { GET, PUT } from '@/app/api/v1/tech/jobs/[id]/equipment/route'
import { GET as getJob } from '@/app/api/v1/tech/jobs/[id]/route'
import { GET as getMeters, PUT as putMeters } from '@/app/api/v1/tech/jobs/[id]/meters/route'
import { logAudit } from '@/lib/audit'
import { db } from '@/lib/db'
import { publishRecordChange } from '@/lib/realtime/publish.server'
import { jobMeterViews } from '@/features/meters/Lib/meters.server'
import {
  InvalidMeterReadingError,
  MeterNotOnJobError,
  writeJobMeterReadings,
} from '@/features/meters/Lib/jobMeterReading.server'
import { MUCH_HIGHER_READING } from '@/features/vehicles/Lib/vehicleReading'
import { TECH_API_FEATURES } from '@/lib/tech-api-features'

const put = (body: unknown, id = JOB.id) =>
  PUT(
    new Request('https://app.test/api', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id }) }
  )
const read = async (res: Response) => ({ status: res.status, body: await res.json() })

beforeEach(() => {
  vi.clearAllMocks()
  state.customFields = true
  state.types = [{ id: 'type-crane', name: 'Crane', isActive: true }]
  state.locked = false
  state.unlinked = []
  state.links = []
  state.items = [
    item({
      id: 'crane',
      make: 'HIAB',
      model: 'X-HiPro 192',
      serialNumber: '4471',
      createdAt: new Date('2026-01-01T00:00:00Z'),
    }),
    item({
      id: 'lift',
      typeId: 'type-lift',
      type: { name: 'Tail lift', sortOrder: 1 },
      make: 'Dhollandia',
      createdAt: new Date('2026-01-02T00:00:00Z'),
    }),
    item({ id: 'other-truck', vehicleId: 'veh-2' }),
    item({ id: 'other-workshop', organizationId: 'org-2' }),
  ]
})

describe('the server says it has equipment', () => {
  it('by name, and no name the app knew is gone', () => {
    expect(TECH_API_FEATURES).toContain('vehicle-equipment')
    expect(TECH_API_FEATURES).toEqual(
      expect.arrayContaining([
        'job-video',
        'checkin',
        'job-documents',
        'job-reference',
        'vehicle-fleet-number',
        'vehicle-meters',
      ])
    )
  })
})

describe('reading a job’s equipment', () => {
  it('lists the items on the job’s vehicle and which the job works on', async () => {
    state.links = [{ serviceRecordId: JOB.id, itemId: 'lift', organizationId: 'org-1' }]
    const res = await read(
      await GET(new Request('https://app.test/api'), {
        params: Promise.resolve({ id: JOB.id }),
      })
    )
    expect(res.status).toBe(200)
    expect(res.body.data.equipment).toEqual({
      items: [
        {
          id: 'crane',
          label: 'Crane, HIAB X-HiPro 192 (4471)',
          type: 'Crane',
          make: 'HIAB',
          model: 'X-HiPro 192',
          serialNumber: '4471',
          removed: false,
          state: null,
        },
        {
          id: 'lift',
          label: 'Tail lift, Dhollandia',
          type: 'Tail lift',
          make: 'Dhollandia',
          model: null,
          serialNumber: null,
          removed: false,
          state: null,
        },
      ],
      workOn: ['lift'],
    })
  })

  it('is null for a workshop whose plan has no custom fields, without a look at equipment', async () => {
    state.customFields = false
    const res = await read(
      await GET(new Request('https://app.test/api'), {
        params: Promise.resolve({ id: JOB.id }),
      })
    )
    expect(res.body).toEqual({ data: { equipment: null } })
    expect(db.equipmentType.findMany).not.toHaveBeenCalled()
    expect(db.equipmentItem.findMany).not.toHaveBeenCalled()
  })

  it('is null for a workshop that has defined no kind of equipment', async () => {
    state.types = []
    const res = await read(
      await GET(new Request('https://app.test/api'), {
        params: Promise.resolve({ id: JOB.id }),
      })
    )
    expect(res.body).toEqual({ data: { equipment: null } })
    expect(db.equipmentItem.findMany).not.toHaveBeenCalled()
  })
})

describe('the job', () => {
  const job = async () =>
    read(
      await getJob(new Request('https://app.test/api'), {
        params: Promise.resolve({ id: JOB.id }),
      })
    )

  it('carries its equipment beside everything it carried before', async () => {
    state.links = [{ serviceRecordId: JOB.id, itemId: 'crane', organizationId: 'org-1' }]
    const res = await job()
    expect(res.status).toBe(200)
    expect(res.body.data).toMatchObject({ id: JOB.id, title: 'Service', meters: [] })
    expect(res.body.data.equipment.workOn).toEqual(['crane'])
    expect(res.body.data.equipment.items.map((i: { id: string }) => i.id)).toEqual([
      'crane',
      'lift',
    ])
  })

  it('carries null while the workshop records no equipment', async () => {
    state.customFields = false
    const res = await job()
    expect(res.status).toBe(200)
    expect(res.body.data.equipment).toBeNull()
    expect(db.equipmentItem.findMany).not.toHaveBeenCalled()
  })
})

describe('setting what a job works on', () => {
  it('saves the list, answers it, and is logged once like any change to the job', async () => {
    const res = await read(await put({ itemIds: ['crane', 'lift'] }))
    expect(res.status).toBe(200)
    expect(res.body.data.equipment.workOn).toEqual(['crane', 'lift'])
    expect(state.links.map((l) => l.itemId)).toEqual(['crane', 'lift'])
    expect(logAudit).toHaveBeenCalledTimes(1)
    expect(vi.mocked(logAudit).mock.calls[0][1]).toMatchObject({
      action: 'service.update',
      entityId: JOB.id,
      details: { key: 'service_update', params: { ref: 'WO-7' } },
      metadata: { via: 'tech-equipment', equipmentItemIds: ['crane', 'lift'] },
    })
    // A work order open at the desk is told.
    expect(publishRecordChange).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'serviceRecord', id: JOB.id, organizationId: 'org-1' })
    )
  })

  it('takes this job’s readings of an item’s meters with the item taken off the list', async () => {
    state.links = [
      { serviceRecordId: JOB.id, itemId: 'crane', organizationId: 'org-1' },
      { serviceRecordId: JOB.id, itemId: 'lift', organizationId: 'org-1' },
    ]
    await put({ itemIds: ['crane'] })
    expect(state.links.map((l) => l.itemId)).toEqual(['crane'])
    expect(state.unlinked).toEqual([
      {
        where: {
          organizationId: 'org-1',
          vehicleMeter: { equipmentItemId: { in: ['lift'] } },
          serviceRecordId: { in: [JOB.id] },
        },
        data: { serviceRecordId: null },
      },
    ])
  })

  it('refuses an item on another vehicle or of another workshop, and changes nothing', async () => {
    for (const id of ['other-truck', 'other-workshop', 'nope']) {
      const res = await read(await put({ itemIds: ['crane', id] }))
      expect(res.status).toBe(404)
      expect(res.body.error.code).toBe('not_found')
    }
    expect(state.links).toEqual([])
    expect(logAudit).not.toHaveBeenCalled()
  })

  it('refuses newly picking an item removed from the vehicle, and keeps one the job already had', async () => {
    state.items[1].removedAt = new Date('2026-06-01T00:00:00Z')
    expect((await put({ itemIds: ['lift'] })).status).toBe(404)
    state.links = [{ serviceRecordId: JOB.id, itemId: 'lift', organizationId: 'org-1' }]
    const res = await read(await put({ itemIds: ['lift', 'crane'] }))
    expect(res.status).toBe(200)
    expect(
      res.body.data.equipment.items.find((i: { id: string }) => i.id === 'lift')
    ).toMatchObject({
      removed: true,
      state: 'removed',
    })
  })

  it('keeps an item that moved to another vehicle since on the job, and refuses picking it anew', async () => {
    state.links = [{ serviceRecordId: JOB.id, itemId: 'crane', organizationId: 'org-1' }]
    state.items[0].vehicleId = 'veh-2'
    // Still the job's, marked as moved.
    const before = await read(
      await GET(new Request('https://app.test/api'), { params: Promise.resolve({ id: JOB.id }) })
    )
    expect(before.body.data.equipment.workOn).toEqual(['crane'])
    expect(
      before.body.data.equipment.items.find((i: { id: string }) => i.id === 'crane')
    ).toMatchObject({ removed: true, state: 'moved' })
    // Saving the list with it kept changes nothing about it.
    const kept = await read(await put({ itemIds: ['crane', 'lift'] }))
    expect(kept.status).toBe(200)
    expect(state.links.map((l) => l.itemId)).toEqual(['crane', 'lift'])
    // Once let go of, it cannot come back: it is on another vehicle now.
    await put({ itemIds: ['lift'] })
    expect((await put({ itemIds: ['lift', 'crane'] })).status).toBe(404)
    expect(state.links.map((l) => l.itemId)).toEqual(['lift'])
  })

  it('is refused on a locked invoice, as every other edit to the job is', async () => {
    state.locked = true
    const res = await read(await put({ itemIds: ['crane'] }))
    expect(res.status).toBe(409)
    // The code and English message as before, and the lock's reason beside them.
    expect(res.body.error).toEqual({
      code: 'document_locked',
      message: 'This document is locked because it has been sent.',
      details: { reason: 'sent' },
    })
    expect(state.links).toEqual([])
    expect(logAudit).not.toHaveBeenCalled()
  })

  it('is not found while the workshop records no equipment', async () => {
    state.types = []
    const res = await read(await put({ itemIds: ['crane'] }))
    expect(res.status).toBe(404)
    expect(state.links).toEqual([])
    state.types = [{ id: 'type-crane', name: 'Crane', isActive: true }]
    state.customFields = false
    expect((await put({ itemIds: ['crane'] })).status).toBe(404)
    expect(db.equipmentItem.findMany).not.toHaveBeenCalled()
  })

  it('is not found on a job that is not on the technician’s list', async () => {
    expect((await put({ itemIds: ['crane'] }, 'job-x')).status).toBe(404)
  })

  it('wants a list of ids', async () => {
    expect((await put({ items: ['crane'] })).status).toBe(400)
    expect((await put({ itemIds: 'crane' })).status).toBe(400)
  })
})

describe('the meters of the equipment a job works on', () => {
  it('come with the item they are on, for the app to group them', async () => {
    const crane = { id: 'crane', label: 'Crane, HIAB X-HiPro 192 (4471)' }
    vi.mocked(jobMeterViews).mockResolvedValueOnce([
      {
        vehicleMeterId: 'vm-truck',
        meterTypeId: 'mt-hours',
        name: 'Engine hours',
        unit: 'h',
        value: null,
        last: 100,
        item: null,
      },
      {
        vehicleMeterId: 'vm-crane',
        meterTypeId: 'mt-hours',
        name: 'Engine hours',
        unit: 'h',
        value: 12.5,
        last: 10,
        item: crane,
      },
    ])
    vi.mocked(db.serviceRecord.findFirst).mockResolvedValueOnce({
      startDateTime: null,
      serviceDate: new Date('2026-11-20T08:00:00Z'),
    } as never)
    const res = await read(
      await getMeters(new Request('https://app.test/api'), {
        params: Promise.resolve({ id: JOB.id }),
      })
    )
    expect(res.body.data.meters.map((m: { item: unknown }) => m.item)).toEqual([null, crane])
  })

  it('take readings through the same request as the vehicle’s own', async () => {
    vi.mocked(writeJobMeterReadings).mockResolvedValueOnce([
      { vehicleMeterId: 'vm-crane', value: 12.5, last: 10, lower: false },
    ])
    const res = await read(
      await putMeters(
        new Request('https://app.test/api', {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ readings: [{ vehicleMeterId: 'vm-crane', value: 12.5 }] }),
        }),
        { params: Promise.resolve({ id: JOB.id }) }
      )
    )
    expect(res.status).toBe(200)
    expect(writeJobMeterReadings).toHaveBeenCalledWith(
      expect.objectContaining({
        jobId: JOB.id,
        readings: [{ vehicleMeterId: 'vm-crane', value: 12.5 }],
        source: 'tech',
      })
    )
    expect(res.body.data.readings).toEqual([
      { vehicleMeterId: 'vm-crane', value: 12.5, last: 10, lower: false },
    ])
  })
})

const METER_VIEW = (over: Record<string, unknown>) => ({
  vehicleMeterId: 'vm',
  meterTypeId: 'mt',
  name: 'Engine hours',
  unit: 'h',
  value: null,
  last: 100,
  item: null,
  ...over,
})

describe('the ask-first limit on each meter', () => {
  const meters = [
    METER_VIEW({ vehicleMeterId: 'vm-hours', unit: 'hrs' }),
    METER_VIEW({ vehicleMeterId: 'vm-km', name: 'Trailer km', unit: 'km' }),
    METER_VIEW({ vehicleMeterId: 'vm-lifts', name: 'Lifts', unit: 'cycles' }),
  ]
  const expected = [
    { ...meters[0], askAbove: MUCH_HIGHER_READING.hours },
    { ...meters[1], askAbove: MUCH_HIGHER_READING.distance },
    { ...meters[2], askAbove: null },
  ]

  it('comes with the meters GET, beside every key it had', async () => {
    vi.mocked(jobMeterViews).mockResolvedValueOnce(meters)
    const res = await read(
      await getMeters(new Request('https://app.test/api'), {
        params: Promise.resolve({ id: JOB.id }),
      })
    )
    expect(res.body.data.meters).toEqual(expected)
  })

  it('comes with the job, looked up once', async () => {
    vi.mocked(jobMeterViews).mockResolvedValueOnce(meters)
    const res = await read(
      await getJob(new Request('https://app.test/api'), {
        params: Promise.resolve({ id: JOB.id }),
      })
    )
    expect(res.body.data.meters).toEqual(expected)
    expect(jobMeterViews).toHaveBeenCalledWith('org-1', {
      id: JOB.id,
      vehicleId: JOB.vehicleId,
      readAt: new Date('2026-11-20T08:00:00Z'),
    })
    // Its dates come with the job itself, not from a second look-up.
    expect(db.serviceRecord.findFirst).toHaveBeenCalledTimes(1)
    expect(res.body.data).not.toHaveProperty('serviceDate')
  })
})

describe('the job’s document lock', () => {
  const job = async () =>
    read(
      await getJob(new Request('https://app.test/api'), {
        params: Promise.resolve({ id: JOB.id }),
      })
    )

  it('says the job is editable', async () => {
    const res = await job()
    expect(res.body.data.documentLock).toEqual({ locked: false, reason: null })
  })

  it('says the job is locked and why, beside the keys the job had', async () => {
    state.locked = true
    const res = await job()
    expect(res.body.data.documentLock).toEqual({ locked: true, reason: 'sent' })
    expect(res.body.data).toMatchObject({ id: JOB.id, title: 'Service', meters: [] })
  })
})

describe('a meter reading refused', () => {
  const putReadings = async (readings: unknown) =>
    read(
      await putMeters(
        new Request('https://app.test/api', {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ readings }),
        }),
        { params: Promise.resolve({ id: JOB.id }) }
      )
    )

  it('names the reading and why, with the code and message it always had', async () => {
    vi.mocked(writeJobMeterReadings).mockRejectedValueOnce(
      new InvalidMeterReadingError('vm-2', 'invalid_number')
    )
    const res = await putReadings([{ vehicleMeterId: 'vm-2', value: '12.345' }])
    expect(res.status).toBe(400)
    expect(res.body.error).toEqual({
      code: 'invalid_request',
      message: 'A reading is a number with up to two decimals, each meter once.',
      details: { vehicleMeterId: 'vm-2', code: 'invalid_number' },
    })
  })

  it('says which meter came twice', async () => {
    vi.mocked(writeJobMeterReadings).mockRejectedValueOnce(
      new InvalidMeterReadingError('vm-1', 'duplicate')
    )
    const res = await putReadings([
      { vehicleMeterId: 'vm-1', value: 1 },
      { vehicleMeterId: 'vm-1', value: 2 },
    ])
    expect(res.status).toBe(400)
    expect(res.body.error.details).toEqual({ vehicleMeterId: 'vm-1', code: 'duplicate' })
  })

  it('says which meter is not the job’s, still a 404', async () => {
    vi.mocked(writeJobMeterReadings).mockRejectedValueOnce(new MeterNotOnJobError('vm-x'))
    const res = await putReadings([{ vehicleMeterId: 'vm-x', value: 1 }])
    expect(res.status).toBe(404)
    expect(res.body.error).toEqual({
      code: 'not_found',
      message: 'That meter is not on this job’s vehicle or the equipment it works on.',
      details: { vehicleMeterId: 'vm-x', code: 'not_on_job' },
    })
  })

  it('on a locked invoice says why, beside the message it had', async () => {
    const { DocumentLockedError } =
      await vi.importActual<typeof import('@/lib/document-lock')>('@/lib/document-lock')
    vi.mocked(writeJobMeterReadings).mockRejectedValueOnce(new DocumentLockedError('paid'))
    const res = await putReadings([{ vehicleMeterId: 'vm-1', value: 1 }])
    expect(res.status).toBe(409)
    expect(res.body.error).toEqual({
      code: 'document_locked',
      message: 'This document is locked because it has been paid.',
      details: { reason: 'paid' },
    })
  })
})

describe('the answer to setting what a job works on', () => {
  it('carries the job’s meters as they now are, beside the equipment', async () => {
    const craneMeter = METER_VIEW({
      vehicleMeterId: 'vm-crane',
      item: { id: 'crane', label: 'Crane, HIAB X-HiPro 192 (4471)' },
    })
    vi.mocked(jobMeterViews).mockResolvedValueOnce([craneMeter])
    const res = await read(await put({ itemIds: ['crane'] }))
    expect(res.status).toBe(200)
    expect(res.body.data.equipment.workOn).toEqual(['crane'])
    expect(res.body.data.meters).toEqual([{ ...craneMeter, askAbove: MUCH_HIGHER_READING.hours }])
  })
})
