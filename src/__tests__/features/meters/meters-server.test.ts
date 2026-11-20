/**
 * @vitest-environment node
 *
 * Meters on the server: nothing at all for a workshop without them, every
 * read and write inside the caller's own workshop, the odometer's name kept
 * for the odometer, and a reading below the last one saved and said.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const decimal = (n: number) => ({ toNumber: () => n, toString: () => String(n) })

const db = vi.hoisted(() => ({
  meterType: {
    findMany: vi.fn(),
    create: vi.fn(),
    aggregate: vi.fn(async () => ({ _max: { sortOrder: 1 } })),
  },
  vehicleMeter: { findMany: vi.fn(), findFirst: vi.fn(), updateMany: vi.fn() },
  meterReading: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(async (_args: { data: Record<string, unknown> }) => ({ id: 'r-new' })),
    updateMany: vi.fn(async () => ({ count: 1 })),
    upsert: vi.fn(),
    deleteMany: vi.fn(),
  },
  appSetting: { findFirst: vi.fn(async () => null) },
  vehicle: { count: vi.fn(async () => 1) },
  serviceRecord: { findFirst: vi.fn() },
}))
vi.mock('@/lib/db', () => ({ db }))
vi.mock('@/lib/features', () => ({ getFeatures: vi.fn(), requireFeature: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next-intl/server', () => ({
  getTranslations: async () => (key: string, values?: Record<string, string>) =>
    key === 'odometerName' ? `"${values?.name}" is the odometer` : key,
}))
vi.mock('@/i18n/organization-translator', () => ({
  organizationTranslator: async () => (key: string) =>
    ({
      'form.mileage': 'Mileage',
      'form.mileageMarine': 'Engine Hours',
      'meters.suggestEngineHours': 'Engine hours',
      'meters.suggestPtoHours': 'PTO hours',
      'meters.hoursUnit': 'hrs',
    })[key] ?? key,
}))
vi.mock('@/lib/workshop-timezone', () => ({ workshopTimeZone: vi.fn(async () => 'Europe/London') }))
vi.mock('@/lib/document-lock.server', () => ({ assertInvoiceEditable: vi.fn() }))
vi.mock('@/lib/with-auth', () => ({
  withAuth: async (fn: (ctx: { userId: string; organizationId: string }) => Promise<unknown>) => {
    try {
      return { success: true, data: await fn({ userId: 'user-1', organizationId: 'org-1' }) }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  },
}))

import { getFeatures } from '@/lib/features'
import { assertInvoiceEditable } from '@/lib/document-lock.server'
import {
  activeMeterTypes,
  printableMeterReadings,
  vehicleMeterViews,
} from '@/features/meters/Lib/meters.server'
import { writeJobMeterReading } from '@/features/meters/Lib/jobMeterReading.server'
import { createMeterType, getMeterSuggestions } from '@/features/meters/Actions/meterTypeActions'
import {
  addMeterReading,
  markMeterReadingWrong,
} from '@/features/meters/Actions/vehicleMeterActions'

const plan = (customFields: boolean) =>
  vi.mocked(getFeatures).mockResolvedValue({ customFields } as never)
const TYPES = [
  { id: 't-engine', name: 'Engine hours', unit: 'hrs' },
  { id: 't-pto', name: 'PTO hours', unit: 'hrs' },
]
const row = (id: string, value: number, day: string, extra: Record<string, unknown> = {}) => ({
  id,
  value: decimal(value),
  readAt: new Date(`${day}T12:00:00Z`),
  createdAt: new Date(`${day}T12:00:00Z`),
  replacedFrom: null,
  wrongAt: null,
  source: 'web',
  serviceRecordId: null,
  serviceRecord: null,
  ...extra,
})

beforeEach(() => {
  vi.clearAllMocks()
  plan(true)
  db.meterType.findMany.mockResolvedValue(TYPES)
  db.appSetting.findFirst.mockResolvedValue(null)
})

describe('a workshop without meters', () => {
  it('on a plan without custom fields is not even asked about them', async () => {
    plan(false)
    expect(await activeMeterTypes('org-1')).toEqual([])
    expect(await printableMeterReadings('org-1', { jobId: 'job-1' })).toEqual([])
    expect(await vehicleMeterViews('org-1', 'veh-1')).toEqual([])
    expect(db.meterType.findMany).not.toHaveBeenCalled()
    expect(db.meterReading.findMany).not.toHaveBeenCalled()
  })

  it('with none defined prints none and reads no readings', async () => {
    db.meterType.findMany.mockResolvedValue([])
    expect(await printableMeterReadings('org-1', { vehicleId: 'veh-1' })).toEqual([])
    expect(db.vehicleMeter.findMany).not.toHaveBeenCalled()
  })

  it('asks only for its own meters in use', async () => {
    await activeMeterTypes('org-1')
    expect(db.meterType.findMany.mock.calls[0][0].where).toEqual({
      organizationId: 'org-1',
      isActive: true,
    })
  })
})

describe('what a document prints', () => {
  it('prints the job’s readings in the workshop’s order, none marked wrong', async () => {
    db.meterReading.findMany.mockResolvedValue([
      { value: decimal(2984.3), vehicleMeter: { meterTypeId: 't-pto' } },
      { value: decimal(4256.7), vehicleMeter: { meterTypeId: 't-engine' } },
    ])
    expect(await printableMeterReadings('org-1', { jobId: 'job-1' })).toEqual([
      { name: 'Engine hours', unit: 'hrs', value: 4256.7 },
      { name: 'PTO hours', unit: 'hrs', value: 2984.3 },
    ])
    expect(db.meterReading.findMany.mock.calls[0][0].where).toMatchObject({
      organizationId: 'org-1',
      serviceRecordId: 'job-1',
      wrongAt: null,
    })
  })

  it('prints a quote’s vehicle as its meters read now, and nothing for a meter without a reading', async () => {
    db.vehicleMeter.findMany.mockResolvedValue([
      {
        id: 'vm-1',
        meterTypeId: 't-engine',
        readings: [row('a', 4000, '2026-01-01'), row('b', 4256.7, '2026-02-01')],
      },
      { id: 'vm-2', meterTypeId: 't-pto', readings: [] },
    ])
    expect(await printableMeterReadings('org-1', { vehicleId: 'veh-1' })).toEqual([
      { name: 'Engine hours', unit: 'hrs', value: 4256.7 },
    ])
    expect(db.vehicleMeter.findMany.mock.calls[0][0].where).toMatchObject({
      organizationId: 'org-1',
      vehicleId: 'veh-1',
      removedAt: null,
    })
  })
})

describe('the workshop’s list of meters', () => {
  it('will not take the odometer’s name', async () => {
    const result = await createMeterType({ name: ' mileage ', unit: 'km' })
    expect(result).toEqual({ success: false, error: '"mileage" is the odometer' })
    expect(db.meterType.create).not.toHaveBeenCalled()
  })

  it('on a boat, keeps "Engine Hours" for the odometer, which is what a boat’s odometer is', async () => {
    db.appSetting.findFirst.mockResolvedValue({ value: 'marine' } as never)
    expect((await createMeterType({ name: 'Engine hours', unit: 'hrs' })).success).toBe(false)
    db.meterType.findMany.mockResolvedValue([])
    const suggestions = await getMeterSuggestions()
    expect(suggestions.data).toEqual([{ name: 'PTO hours', unit: 'hrs' }])
  })

  it('suggests both, in the workshop’s language, and not one already defined', async () => {
    db.meterType.findMany.mockResolvedValue([{ name: 'PTO HOURS' }])
    expect((await getMeterSuggestions()).data).toEqual([{ name: 'Engine hours', unit: 'hrs' }])
  })

  it('adds a meter under this workshop', async () => {
    db.meterType.create.mockResolvedValue({ id: 't-new', name: 'Engine hours', unit: 'hrs' })
    expect((await createMeterType({ name: 'Engine hours', unit: 'hrs' })).success).toBe(true)
    expect(db.meterType.create.mock.calls[0][0].data).toEqual({
      name: 'Engine hours',
      unit: 'hrs',
      sortOrder: 2,
      organizationId: 'org-1',
    })
  })
})

describe('a reading typed on the vehicle', () => {
  const meter = (readings: unknown[]) => ({
    id: 'vm-1',
    vehicleId: 'veh-1',
    meterType: { name: 'Engine hours', isActive: true },
    readings,
  })

  it('below the last one is saved all the same, and said', async () => {
    db.vehicleMeter.findFirst.mockResolvedValue(meter([row('a', 4256.7, '2026-01-01')]))

    const result = await addMeterReading({ vehicleMeterId: 'vm-1', value: '4200,5' })

    expect(result.data).toMatchObject({ lower: true, last: 4256.7 })
    expect(db.meterReading.create.mock.calls[0][0].data).toMatchObject({
      vehicleMeterId: 'vm-1',
      value: 4200.5,
      organizationId: 'org-1',
    })
  })

  it('is refused on another workshop’s meter, and nothing is written', async () => {
    db.vehicleMeter.findFirst.mockResolvedValue(null)

    expect(await addMeterReading({ vehicleMeterId: 'theirs', value: '1' })).toEqual({
      success: false,
      error: 'Meter not found',
    })
    expect(db.vehicleMeter.findFirst.mock.calls[0][0].where).toMatchObject({
      id: 'theirs',
      organizationId: 'org-1',
    })
    expect(db.meterReading.create).not.toHaveBeenCalled()
  })

  it('that is not a number is refused, and nothing is written', async () => {
    db.vehicleMeter.findFirst.mockResolvedValue(meter([]))
    expect((await addMeterReading({ vehicleMeterId: 'vm-1', value: '12.345' })).success).toBe(false)
    expect(db.meterReading.create).not.toHaveBeenCalled()
  })

  it('marked as wrong stays, and is marked in this workshop only', async () => {
    db.meterReading.findFirst.mockResolvedValue({
      id: 'r-1',
      value: decimal(99999),
      vehicleMeter: { vehicleId: 'veh-1', meterType: { name: 'Engine hours' } },
    })

    expect((await markMeterReadingWrong({ readingId: 'r-1', wrong: true })).success).toBe(true)

    expect(db.meterReading.updateMany).toHaveBeenCalledWith({
      where: { id: 'r-1', organizationId: 'org-1' },
      data: { wrongAt: expect.any(Date), wrongById: 'user-1' },
    })
    expect(db.meterReading.deleteMany).not.toHaveBeenCalled()
  })
})

describe('a reading on a job', () => {
  const job = {
    id: 'job-1',
    vehicleId: 'veh-1',
    startDateTime: null,
    serviceDate: new Date('2026-03-01T09:00:00Z'),
  }
  const input = {
    organizationId: 'org-1',
    userId: 'user-1',
    jobId: 'job-1',
    vehicleMeterId: 'vm-1',
    source: 'web' as const,
  }

  beforeEach(() => {
    db.serviceRecord.findFirst.mockResolvedValue(job)
    db.vehicleMeter.findFirst.mockResolvedValue({
      id: 'vm-1',
      readings: [
        { ...row('a', 4000, '2026-01-01'), serviceRecordId: null },
        { ...row('own', 1, '2026-03-01'), serviceRecordId: 'job-1' },
      ],
    })
  })

  it('is dated by the job and judged against the last reading before it, not its own', async () => {
    const result = await writeJobMeterReading({ ...input, value: '3999.9' })

    expect(result).toEqual({ vehicleMeterId: 'vm-1', value: 3999.9, last: 4000, lower: true })
    expect(db.meterReading.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          vehicleMeterId_serviceRecordId: { vehicleMeterId: 'vm-1', serviceRecordId: 'job-1' },
        },
        create: expect.objectContaining({ readAt: job.serviceDate, value: 3999.9, source: 'web' }),
      })
    )
  })

  it('takes the job’s reading away when emptied', async () => {
    await writeJobMeterReading({ ...input, value: '' })
    expect(db.meterReading.deleteMany).toHaveBeenCalledWith({
      where: { organizationId: 'org-1', vehicleMeterId: 'vm-1', serviceRecordId: 'job-1' },
    })
    expect(db.meterReading.upsert).not.toHaveBeenCalled()
  })

  it('is refused on a locked invoice, as every other edit to the job is', async () => {
    vi.mocked(assertInvoiceEditable).mockRejectedValueOnce(
      Object.assign(new Error('locked'), { name: 'DocumentLockedError' })
    )
    await expect(writeJobMeterReading({ ...input, value: '5000' })).rejects.toThrow('locked')
    expect(db.meterReading.upsert).not.toHaveBeenCalled()
  })

  it('is refused for a meter that is not on the job’s vehicle, or not this workshop’s', async () => {
    db.vehicleMeter.findFirst.mockResolvedValue(null)
    await expect(writeJobMeterReading({ ...input, value: '5000' })).rejects.toThrow(
      'Meter not found'
    )
    expect(db.vehicleMeter.findFirst.mock.calls[0][0].where).toMatchObject({
      id: 'vm-1',
      organizationId: 'org-1',
      vehicleId: 'veh-1',
      removedAt: null,
    })
    expect(db.meterReading.upsert).not.toHaveBeenCalled()
  })

  it('is refused for a job of another workshop', async () => {
    db.serviceRecord.findFirst.mockResolvedValue(null)
    await expect(writeJobMeterReading({ ...input, value: '5000' })).rejects.toThrow(
      'Work order not found'
    )
    expect(db.serviceRecord.findFirst.mock.calls[0][0].where).toEqual({
      id: 'job-1',
      organizationId: 'org-1',
    })
  })
})
