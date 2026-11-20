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
    updateMany: vi.fn(async () => ({ count: 1 })),
    findFirstOrThrow: vi.fn(),
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
  vehicle: {
    count: vi.fn(async () => 1),
    findFirst: vi.fn(async () => ({
      year: 2019,
      make: 'Scania',
      model: 'R 450',
      licensePlate: 'ZZ19 TST',
    })),
  },
  serviceRecord: { findFirst: vi.fn() },
  // No equipment unless a test defines some.
  equipmentType: { findMany: vi.fn(async () => [] as unknown[]) },
  equipmentItem: { findMany: vi.fn(async () => [] as unknown[]) },
  serviceRecordEquipment: {
    findMany: vi.fn(async (_args?: { where: unknown }) => [] as unknown[]),
  },
  // A transaction runs on the same mocks, so what it writes can be asked about.
  $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn(db)),
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
// The audit row each action would write, read through its own option.
const audits = vi.hoisted(() => [] as unknown[])
vi.mock('@/lib/with-auth', () => ({
  withAuth: async (
    fn: (ctx: { userId: string; organizationId: string }) => Promise<unknown>,
    options: { audit?: (a: { result: unknown }) => unknown } = {}
  ) => {
    try {
      const data = await fn({ userId: 'user-1', organizationId: 'org-1' })
      if (options.audit) audits.push(options.audit({ result: data }))
      return { success: true, data }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  },
}))

import { getFeatures } from '@/lib/features'
import { assertInvoiceEditable } from '@/lib/document-lock.server'
import {
  activeMeterTypes,
  jobMeterViews,
  printableMeterReadings,
  vehicleMeterViews,
} from '@/features/meters/Lib/meters.server'
import {
  unlinkJobMeterReadingsFromOtherVehicles,
  writeJobMeterReading,
  writeJobMeterReadings,
} from '@/features/meters/Lib/jobMeterReading.server'
import {
  createMeterType,
  getMeterSuggestions,
  updateMeterType,
} from '@/features/meters/Actions/meterTypeActions'
import {
  addMeterReading,
  markMeterReadingWrong,
} from '@/features/meters/Actions/vehicleMeterActions'
import { setJobMeterReading } from '@/features/meters/Actions/jobMeterActions'

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
    expect(await printableMeterReadings('org-1', { jobId: 'job-1', vehicleId: 'veh-1' })).toEqual(
      []
    )
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
    expect(await printableMeterReadings('org-1', { jobId: 'job-1', vehicleId: 'veh-1' })).toEqual([
      { name: 'Engine hours', unit: 'hrs', value: 4256.7 },
      { name: 'PTO hours', unit: 'hrs', value: 2984.3 },
    ])
    expect(db.meterReading.findMany.mock.calls[0][0].where).toMatchObject({
      organizationId: 'org-1',
      serviceRecordId: 'job-1',
      wrongAt: null,
      // Only the meters of the vehicle the job is on now.
      vehicleMeter: { vehicleId: 'veh-1', removedAt: null },
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
    // No meter of that name yet.
    db.meterType.findMany.mockImplementation(async (args: { where: Record<string, unknown> }) =>
      'isActive' in args.where ? TYPES : []
    )
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
  const fitted = (id: string, readings: unknown[]) => ({ id, readings })

  beforeEach(() => {
    db.serviceRecord.findFirst.mockResolvedValue(job)
    db.vehicleMeter.findMany.mockResolvedValue([
      fitted('vm-1', [
        { ...row('a', 4000, '2026-01-01'), serviceRecordId: null },
        { ...row('own', 1, '2026-03-01'), serviceRecordId: 'job-1' },
      ]),
      fitted('vm-2', []),
    ])
  })

  it('is dated by the job and judged against the last reading before it, not its own', async () => {
    const result = await writeJobMeterReading({ ...input, value: '3999.9' })

    expect(result).toEqual({ vehicleMeterId: 'vm-1', value: 3999.9, last: 4000, lower: true })
    expect(db.$transaction).toHaveBeenCalledTimes(1)
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
    db.vehicleMeter.findMany.mockResolvedValue([])
    await expect(writeJobMeterReading({ ...input, value: '5000' })).rejects.toThrow(
      'Meter not found'
    )
    expect(db.vehicleMeter.findMany.mock.calls[0][0].where).toMatchObject({
      id: { in: ['vm-1'] },
      organizationId: 'org-1',
      OR: [{ vehicleId: 'veh-1' }],
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

  it('writes several at once all or nothing: one bad reading writes none of them', async () => {
    await expect(
      writeJobMeterReadings({
        organizationId: 'org-1',
        userId: 'user-1',
        jobId: 'job-1',
        source: 'tech',
        readings: [
          { vehicleMeterId: 'vm-1', value: 4300 },
          { vehicleMeterId: 'vm-2', value: '4.256.7' },
        ],
      })
    ).rejects.toThrow('That is not a reading')
    expect(db.$transaction).not.toHaveBeenCalled()
    expect(db.meterReading.upsert).not.toHaveBeenCalled()

    await writeJobMeterReadings({
      organizationId: 'org-1',
      userId: 'user-1',
      jobId: 'job-1',
      source: 'tech',
      readings: [
        { vehicleMeterId: 'vm-1', value: 4300 },
        { vehicleMeterId: 'vm-2', value: 12.5 },
      ],
    })
    expect(db.$transaction).toHaveBeenCalledTimes(1)
    expect(db.meterReading.upsert).toHaveBeenCalledTimes(2)
  })

  it('refuses a number with more than two decimals, as typed text is refused', async () => {
    await expect(writeJobMeterReading({ ...input, value: 4300.125 })).rejects.toThrow(
      'That is not a reading'
    )
  })

  it('judges against a reading dated by its job as the job is now, not when it was typed', async () => {
    db.vehicleMeter.findMany.mockResolvedValue([
      fitted('vm-1', [
        // Typed on 1 February for a job since moved to 1 April: it now comes
        // after this job (1 March), so it is not "the last reading".
        {
          ...row('moved', 5000, '2026-02-01'),
          serviceRecordId: 'job-2',
          serviceRecord: { startDateTime: null, serviceDate: new Date('2026-04-01T09:00:00Z') },
        },
        { ...row('a', 4000, '2026-01-01'), serviceRecordId: null },
      ]),
    ])
    expect(await writeJobMeterReading({ ...input, value: '4100' })).toMatchObject({
      last: 4000,
      lower: false,
    })
  })
})

describe('a job moved to another vehicle', () => {
  it('leaves its readings in the old vehicle’s history, no longer the job’s', async () => {
    await unlinkJobMeterReadingsFromOtherVehicles(db as never, {
      organizationId: 'org-1',
      jobId: 'job-1',
      vehicleId: 'veh-B',
    })
    expect(db.meterReading.updateMany).toHaveBeenCalledWith({
      where: {
        organizationId: 'org-1',
        serviceRecordId: 'job-1',
        NOT: {
          OR: [
            { vehicleMeter: { vehicleId: 'veh-B' } },
            { vehicleMeter: { equipmentItem: { vehicleId: 'veh-B' } } },
          ],
        },
      },
      data: { serviceRecordId: null },
    })
  })
})

describe('the order of readings taken at the same moment', () => {
  it('is the order they were typed in', async () => {
    const noon = '2026-03-01'
    db.vehicleMeter.findMany.mockResolvedValue([
      {
        id: 'vm-1',
        meterTypeId: 't-engine',
        readings: [
          // Typed second: the new counter after a replacement, at the same moment.
          {
            ...row('new', 12, noon, { replacedFrom: decimal(9800) }),
            createdAt: new Date('2026-03-01T12:05:00Z'),
          },
          { ...row('old', 9800, noon), createdAt: new Date('2026-03-01T12:01:00Z') },
        ],
      },
    ])
    const [meter] = await vehicleMeterViews('org-1', 'veh-1')
    expect(meter.current).toBe(12)
    expect(meter.readings.map((r) => r.id)).toEqual(['new', 'old'])
  })
})

describe('more of the review’s rules', () => {
  it('a job’s reading marked wrong on a locked invoice is refused, as typing it again is', async () => {
    db.meterReading.findFirst.mockResolvedValue({
      id: 'r-1',
      value: decimal(4300),
      serviceRecordId: 'job-1',
      vehicleMeter: { vehicleId: 'veh-1', meterType: { name: 'Engine hours' } },
    })
    vi.mocked(assertInvoiceEditable).mockRejectedValueOnce(new Error('locked'))

    expect(await markMeterReadingWrong({ readingId: 'r-1', wrong: true })).toEqual({
      success: false,
      error: 'locked',
    })
    expect(assertInvoiceEditable).toHaveBeenCalledWith('job-1', 'org-1')
    expect(db.meterReading.updateMany).not.toHaveBeenCalled()
  })

  it('refuses the odometer’s name in every language the app ships', async () => {
    // A workshop in English typing the German odometer name.
    expect((await createMeterType({ name: 'Kilometerstand', unit: 'km' })).success).toBe(false)
    expect((await createMeterType({ name: 'Kilométrage', unit: 'km' })).success).toBe(false)
    expect(db.meterType.create).not.toHaveBeenCalled()
  })

  it('refuses a name that differs from another meter only by case or spacing, on create and rename', async () => {
    db.meterType.findMany.mockImplementation(async (args: { where: Record<string, unknown> }) =>
      'isActive' in args.where ? TYPES : [{ name: 'PTO hours' }]
    )
    expect(await createMeterType({ name: ' pto HOURS ', unit: 'hrs' })).toEqual({
      success: false,
      error: 'duplicateName',
    })
    expect(await updateMeterType({ id: 't-engine', name: 'PTO hours' })).toEqual({
      success: false,
      error: 'duplicateName',
    })
    expect(db.meterType.create).not.toHaveBeenCalled()
  })

  it('logs a reading typed on the vehicle like any change to the vehicle', async () => {
    db.vehicleMeter.findFirst.mockResolvedValue({
      id: 'vm-1',
      vehicleId: 'veh-1',
      meterType: { name: 'Engine hours', isActive: true },
      readings: [],
    })
    audits.length = 0
    await addMeterReading({ vehicleMeterId: 'vm-1', value: '4300' })
    expect(audits).toEqual([
      expect.objectContaining({
        action: 'vehicle.update',
        entityId: 'veh-1',
        details: {
          key: 'vehicle_update',
          params: { name: '2019 Scania R 450 (ZZ19 TST)', fields: 'Engine hours 4300' },
        },
      }),
    ])
  })

  it('logs a reading typed on the work order like any change to the work order', async () => {
    db.serviceRecord.findFirst.mockResolvedValue({
      id: 'job-1',
      vehicleId: 'veh-1',
      startDateTime: null,
      serviceDate: new Date('2026-03-01T09:00:00Z'),
      invoiceNumber: 'WO-1042',
    })
    db.vehicleMeter.findMany.mockResolvedValue([{ id: 'vm-1', readings: [] }])
    audits.length = 0
    await setJobMeterReading({ jobId: 'job-1', vehicleMeterId: 'vm-1', value: '4300' })
    expect(audits).toEqual([
      expect.objectContaining({
        action: 'service.update',
        entityId: 'job-1',
        details: { key: 'service_update', params: { ref: 'WO-1042' } },
      }),
    ])
  })
})

describe('the meters of the equipment a job works on', () => {
  it('can be read on that job, beside the vehicle’s own', async () => {
    db.serviceRecord.findFirst.mockResolvedValue({
      id: 'job-1',
      vehicleId: 'veh-1',
      startDateTime: null,
      serviceDate: new Date('2026-03-01T09:00:00Z'),
    })
    db.equipmentType.findMany.mockResolvedValue([{ id: 'et-crane', name: 'Crane', isActive: true }])
    db.serviceRecordEquipment.findMany.mockResolvedValue([{ itemId: 'item-crane' }])
    db.vehicleMeter.findMany.mockResolvedValue([{ id: 'vm-crane', readings: [] }])
    await writeJobMeterReading({
      organizationId: 'org-1',
      userId: 'user-1',
      jobId: 'job-1',
      vehicleMeterId: 'vm-crane',
      value: '812.5',
      source: 'web',
    })
    expect(db.vehicleMeter.findMany.mock.calls[0][0].where.OR).toEqual([
      { vehicleId: 'veh-1' },
      { equipmentItemId: { in: ['item-crane'] } },
    ])
    // Every item the job works on, wherever it is now: a job keeps what it
    // worked on, and a reading misread then is corrected on that job.
    expect(db.serviceRecordEquipment.findMany.mock.calls[0][0]?.where).toEqual({
      organizationId: 'org-1',
      serviceRecordId: 'job-1',
      item: { organizationId: 'org-1' },
    })
    expect(db.meterReading.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ vehicleMeterId: 'vm-crane', value: 812.5 }),
      })
    )
  })
})

describe('a job whose item has moved to another vehicle since', () => {
  it('still shows that item’s meters with the reading taken on the job', async () => {
    db.equipmentType.findMany.mockResolvedValue([{ id: 'et-crane', name: 'Crane', isActive: true }])
    db.serviceRecordEquipment.findMany.mockResolvedValue([{ itemId: 'item-crane' }])
    db.equipmentItem.findMany.mockResolvedValue([
      // On veh-2 now; the job is on veh-1.
      { id: 'item-crane', make: 'HIAB', model: null, serialNumber: null, type: { name: 'Crane' } },
    ])
    db.vehicleMeter.findMany
      .mockResolvedValueOnce([]) // the vehicle's own meters
      .mockResolvedValueOnce([
        {
          id: 'vm-crane',
          meterTypeId: 't-engine',
          equipmentItemId: 'item-crane',
          readings: [
            row('r-job', 812.5, '2026-03-01', {
              serviceRecordId: 'job-1',
              serviceRecord: {
                id: 'job-1',
                title: 'Crane service',
                invoiceNumber: null,
                vehicleId: 'veh-1',
                startDateTime: null,
                serviceDate: new Date('2026-03-01T09:00:00Z'),
              },
            }),
          ],
        },
      ])
    const views = await jobMeterViews('org-1', {
      id: 'job-1',
      vehicleId: 'veh-1',
      readAt: new Date('2026-03-01T09:00:00Z'),
    })
    expect(views).toEqual([
      expect.objectContaining({
        vehicleMeterId: 'vm-crane',
        value: 812.5,
        item: { id: 'item-crane', label: 'Crane, HIAB' },
      }),
    ])
  })
})
