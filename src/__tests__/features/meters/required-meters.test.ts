/**
 * @vitest-environment node
 *
 * The one check every way of finishing a job asks: which meters the workshop
 * requires that this job has no reading of. It asks for the vehicle's own
 * required meters and for those of the equipment the job works on, never for
 * an item it does not work on, a hidden meter, a job without a vehicle or a
 * job completed already; and a reading counts only when it is this job's.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const decimal = (n: number) => ({ toNumber: () => n, toString: () => String(n) })

/** The workshop as rows, read through the same filters the queries use. */
const world = vi.hoisted(() => ({
  types: [] as {
    id: string
    name: string
    unit: string
    isActive: boolean
    required: boolean
  }[],
  meters: [] as {
    id: string
    meterTypeId: string
    vehicleId: string | null
    equipmentItemId: string | null
    readings: { id: string; value: number; job: string | null; wrong?: boolean }[]
  }[],
  job: null as null | Record<string, unknown>,
  workOn: [] as string[],
  items: [] as { id: string; vehicleId: string; make: string; typeName: string }[],
  locked: false,
}))

type Where = Record<string, unknown>
const inList = (value: unknown, filter: unknown) =>
  filter === undefined ||
  (typeof filter === 'object' && filter !== null && 'in' in filter
    ? (filter as { in: unknown[] }).in.includes(value)
    : filter === value)

const db = vi.hoisted(() => ({
  meterType: {
    findFirst: vi.fn(async ({ where }: { where: Where }) => {
      const found = world.types.find(
        (t) =>
          (where.required === undefined || t.required === where.required) &&
          (where.isActive === undefined || t.isActive === where.isActive)
      )
      return found ? { id: found.id } : null
    }),
    findMany: vi.fn(async ({ where }: { where: Where }) =>
      world.types
        .filter((t) => where.isActive === undefined || t.isActive === where.isActive)
        .map(({ id, name, unit, required }) => ({ id, name, unit, required }))
    ),
  },
  vehicleMeter: {
    findMany: vi.fn(async ({ where }: { where: Where }) =>
      world.meters
        .filter(
          (m) =>
            inList(m.vehicleId, where.vehicleId) &&
            inList(m.equipmentItemId, where.equipmentItemId) &&
            inList(m.meterTypeId, where.meterTypeId)
        )
        .map((m) => ({
          id: m.id,
          meterTypeId: m.meterTypeId,
          equipmentItemId: m.equipmentItemId,
          readings: m.readings.map((r) => ({
            id: r.id,
            value: decimal(r.value),
            readAt: new Date('2026-11-01T10:00:00Z'),
            createdAt: new Date('2026-11-01T10:00:00Z'),
            replacedFrom: null,
            wrongAt: r.wrong ? new Date() : null,
            source: 'web',
            serviceRecordId: r.job,
            serviceRecord: r.job
              ? {
                  id: r.job,
                  title: 'Job',
                  invoiceNumber: null,
                  vehicleId: 'veh-1',
                  startDateTime: null,
                  serviceDate: new Date('2026-11-01T10:00:00Z'),
                }
              : null,
          })),
        }))
    ),
  },
  serviceRecord: { findFirst: vi.fn(async () => world.job) },
  serviceRecordEquipment: {
    findMany: vi.fn(async () => world.workOn.map((itemId) => ({ itemId }))),
  },
  equipmentType: {
    findMany: vi.fn(async () =>
      world.items.length > 0 ? [{ id: 'et-crane', name: 'Crane', isActive: true }] : []
    ),
  },
  equipmentItem: {
    findMany: vi.fn(async ({ where }: { where: Where }) =>
      world.items
        .filter((i) => inList(i.id, where.id) && inList(i.vehicleId, where.vehicleId))
        .map((i) => ({
          id: i.id,
          make: i.make,
          model: null,
          serialNumber: null,
          type: { name: i.typeName },
        }))
    ),
  },
}))
vi.mock('@/lib/db', () => ({ db }))
vi.mock('@/lib/features', () => ({
  getFeatures: vi.fn(async () => ({ customFields: true })),
}))
vi.mock('@/lib/document-lock.server', () => ({
  getInvoiceLockState: vi.fn(async () => ({
    locked: world.locked,
    reason: world.locked ? 'sent' : null,
    unlockedAt: null,
  })),
}))
vi.mock('next-intl/server', () => ({
  getTranslations: async (namespace: string) => (key: string, values?: { meters: string }) =>
    `${namespace}.${key}: ${values?.meters}`,
}))

import {
  assertRequiredMetersRead,
  missingRequiredMeters,
  missingRequiredMetersForNewJob,
  requiredMeterNames,
} from '@/features/meters/Lib/requiredMeters.server'

const JOB = {
  id: 'job-1',
  status: 'in-progress',
  vehicleId: 'veh-1',
  startDateTime: null,
  serviceDate: new Date('2026-11-01T10:00:00Z'),
  issuedAt: null,
  editUnlockedAt: null,
}

const names = async (occasion: Parameters<typeof missingRequiredMeters>[2] = 'complete') =>
  (await missingRequiredMeters('org-1', 'job-1', occasion)).map((m) => m.name)

beforeEach(() => {
  vi.clearAllMocks()
  world.types = [
    { id: 't-pto', name: 'PTO hours', unit: 'hrs', isActive: true, required: true },
    { id: 't-engine', name: 'Engine hours', unit: 'hrs', isActive: true, required: false },
    { id: 't-crane', name: 'Crane hours', unit: 'hrs', isActive: true, required: true },
  ]
  world.meters = [
    { id: 'vm-pto', meterTypeId: 't-pto', vehicleId: 'veh-1', equipmentItemId: null, readings: [] },
    {
      id: 'vm-engine',
      meterTypeId: 't-engine',
      vehicleId: 'veh-1',
      equipmentItemId: null,
      readings: [],
    },
    {
      id: 'vm-crane',
      meterTypeId: 't-crane',
      vehicleId: null,
      equipmentItemId: 'item-crane',
      readings: [],
    },
  ]
  world.items = [{ id: 'item-crane', vehicleId: 'veh-1', make: 'HIAB', typeName: 'Crane' }]
  world.workOn = []
  world.job = { ...JOB }
  world.locked = false
})

describe('which meters a job is asked for', () => {
  it('asks for the vehicle’s own required meter, not one that is not required', async () => {
    expect(await names()).toEqual(['PTO hours'])
  })

  it('asks nothing once the job has its own reading', async () => {
    world.meters[0].readings = [{ id: 'r1', value: 812.5, job: 'job-1' }]
    expect(await names()).toEqual([])
  })

  it('still asks when only an older job has a reading of it', async () => {
    world.meters[0].readings = [{ id: 'r0', value: 700, job: 'job-0' }]
    expect(await names()).toEqual(['PTO hours'])
  })

  it('still asks when the job’s reading was marked wrong', async () => {
    world.meters[0].readings = [{ id: 'r1', value: 812.5, job: 'job-1', wrong: true }]
    expect(await names()).toEqual(['PTO hours'])
  })

  it('asks for an equipment item’s meter only when the job works on the item', async () => {
    expect(await names()).not.toContain('Crane hours')
    world.workOn = ['item-crane']
    expect(await names()).toEqual(['PTO hours', 'Crane hours'])
  })

  it('never asks for a hidden meter', async () => {
    world.types[0].isActive = false
    expect(await names()).toEqual([])
  })

  it('never asks a job without a vehicle', async () => {
    world.job = { ...JOB, vehicleId: null }
    expect(await names()).toEqual([])
  })

  it('leaves a job completed already alone', async () => {
    world.job = { ...JOB, status: 'completed' }
    expect(await names()).toEqual([])
    expect(await names('payment')).toEqual([])
  })

  it('asks nothing on an invoice locked against new readings', async () => {
    world.locked = true
    expect(await names()).toEqual([])
  })

  it('costs a workshop that requires no meter one small query and nothing more', async () => {
    for (const type of world.types) type.required = false
    expect(await names()).toEqual([])
    expect(db.meterType.findFirst).toHaveBeenCalledWith({
      where: { organizationId: 'org-1', required: true, isActive: true },
      select: { id: true },
    })
    expect(db.serviceRecord.findFirst).not.toHaveBeenCalled()
    expect(db.vehicleMeter.findMany).not.toHaveBeenCalled()
  })

  it('looks the job up in the caller’s own workshop', async () => {
    await names()
    expect(db.serviceRecord.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'job-1', organizationId: 'org-1' } })
    )
  })
})

describe('issuing the invoice', () => {
  it('asks before an invoice is first issued, by sending, sharing or paying', async () => {
    for (const occasion of ['send', 'share', 'payment', 'markPaid'] as const) {
      expect(await names(occasion)).toEqual(['PTO hours'])
    }
  })

  it('asks nothing once the invoice is out: a payment or a re-send only follows it', async () => {
    world.job = { ...JOB, issuedAt: new Date('2026-11-02T10:00:00Z') }
    expect(await names('payment')).toEqual([])
    expect(await names('send')).toEqual([])
    // A completion is still a completion.
    expect(await names('complete')).toEqual(['PTO hours'])
  })

  it('asks again when an owner reopened the invoice and it is sent anew', async () => {
    world.job = {
      ...JOB,
      issuedAt: new Date('2026-11-02T10:00:00Z'),
      editUnlockedAt: new Date('2026-11-03T10:00:00Z'),
    }
    expect(await names('send')).toEqual(['PTO hours'])
  })
})

describe('a save that moves the job to another vehicle and completes it', () => {
  it('asks for the new vehicle’s meters and keeps only the items on it', async () => {
    world.meters.push({
      id: 'vm-pto-2',
      meterTypeId: 't-pto',
      vehicleId: 'veh-2',
      equipmentItemId: null,
      readings: [],
    })
    world.workOn = ['item-crane']
    const missing = await missingRequiredMeters('org-1', 'job-1', 'complete', {
      vehicleId: 'veh-2',
    })
    expect(missing.map((m) => m.vehicleMeterId)).toEqual(['vm-pto-2'])
  })
})

describe('a job made completed', () => {
  it('is asked for every required meter of its vehicle', async () => {
    world.meters[0].readings = [{ id: 'r0', value: 700, job: 'job-0' }]
    const missing = await missingRequiredMetersForNewJob('org-1', 'veh-1')
    expect(missing.map((m) => m.name)).toEqual(['PTO hours'])
    expect(await missingRequiredMetersForNewJob('org-1', null)).toEqual([])
  })
})

describe('the refusal', () => {
  it('names the meters, in the pattern of the custom fields refusal', async () => {
    world.workOn = ['item-crane']
    await expect(assertRequiredMetersRead('org-1', 'job-1', 'complete')).rejects.toMatchObject({
      name: 'RequiredMetersRefusedError',
      message: 'vehicles.meters.requiredNotCompleted: PTO hours, Crane hours',
      meters: [
        expect.objectContaining({ vehicleMeterId: 'vm-pto', name: 'PTO hours', item: null }),
        expect.objectContaining({
          vehicleMeterId: 'vm-crane',
          name: 'Crane hours',
          item: { id: 'item-crane', label: expect.stringContaining('HIAB') },
        }),
      ],
    })
  })

  it('says what was refused on each occasion', async () => {
    await expect(assertRequiredMetersRead('org-1', 'job-1', 'send')).rejects.toThrow(
      'vehicles.meters.requiredNotSent: PTO hours'
    )
    await expect(assertRequiredMetersRead('org-1', 'job-1', 'payment')).rejects.toThrow(
      'vehicles.meters.requiredPaymentNotRecorded: PTO hours'
    )
  })

  it('passes when every required reading is there', async () => {
    world.meters[0].readings = [{ id: 'r1', value: 812.5, job: 'job-1' }]
    await expect(assertRequiredMetersRead('org-1', 'job-1', 'complete')).resolves.toBeUndefined()
  })

  it('tells two meters of one name apart by their item', () => {
    const item = (id: string, label: string) => ({ id, label })
    expect(
      requiredMeterNames([
        { vehicleMeterId: 'a', meterTypeId: 't', name: 'Crane hours', item: item('1', 'Front') },
        { vehicleMeterId: 'b', meterTypeId: 't', name: 'Crane hours', item: item('2', 'Rear') },
        { vehicleMeterId: 'c', meterTypeId: 'p', name: 'PTO hours', item: null },
      ])
    ).toBe('Crane hours (Front), Crane hours (Rear), PTO hours')
  })
})
