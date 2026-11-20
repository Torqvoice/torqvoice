/**
 * @vitest-environment node
 *
 * Equipment on the server: nothing at all for a workshop without it, every
 * read and write inside the caller's own workshop, an item that moves keeps
 * its history and leaves the old vehicle's jobs, and "Work on" only points at
 * the job's own vehicle's equipment.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const db = vi.hoisted(() => ({
  equipmentType: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(async () => ({ id: 'et-new', name: 'Crane' })),
    updateMany: vi.fn(async () => ({ count: 1 })),
    deleteMany: vi.fn(async () => ({ count: 1 })),
    aggregate: vi.fn(async () => ({ _max: { sortOrder: 0 } })),
  },
  equipmentItem: {
    findMany: vi.fn(async () => [] as unknown[]),
    findFirst: vi.fn(),
    count: vi.fn(async () => 0),
    create: vi.fn(async (_args: { data: Record<string, unknown> }) => ({ id: 'item-new' })),
    updateMany: vi.fn(async () => ({ count: 1 })),
    deleteMany: vi.fn(async () => ({ count: 1 })),
  },
  equipmentFitting: {
    findMany: vi.fn(async () => [] as unknown[]),
    create: vi.fn(),
    updateMany: vi.fn(async () => ({ count: 1 })),
  },
  serviceRecordEquipment: {
    findMany: vi.fn(async () => [] as unknown[]),
    deleteMany: vi.fn(),
    createMany: vi.fn(),
  },
  quoteEquipment: {
    findMany: vi.fn(async () => [] as unknown[]),
    deleteMany: vi.fn(),
    createMany: vi.fn(),
  },
  quote: { findFirst: vi.fn() },
  meterType: { findMany: vi.fn(async () => [] as unknown[]) },
  vehicleMeter: { findMany: vi.fn(async () => [] as unknown[]) },
  meterReading: { findMany: vi.fn(async () => [] as unknown[]), updateMany: vi.fn() },
  vehicle: {
    count: vi.fn(async () => 1),
    findFirst: vi.fn(async () => ({
      year: 2019,
      make: 'Scania',
      model: 'R 450',
      licensePlate: 'ZZ19 TST',
    })),
  },
  serviceRecord: { findFirst: vi.fn(), updateMany: vi.fn() },
  // The row lock a job's or quote's list is read under: what it is on now.
  $queryRaw: vi.fn(async () => [{ mileage: null, vehicleId: 'veh-A' }] as unknown[]),
  $transaction: vi.fn(async (arg: unknown) =>
    typeof arg === 'function'
      ? (arg as (tx: unknown) => unknown)(db)
      : Promise.all(arg as unknown[])
  ),
}))
vi.mock('@/lib/db', () => ({ db }))
vi.mock('@/lib/features', () => ({ getFeatures: vi.fn(), requireFeature: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/realtime/publish.server', () => ({ publishRecordChange: vi.fn() }))
vi.mock('next-intl/server', () => ({ getTranslations: async () => (key: string) => key }))
vi.mock('@/lib/workshop-timezone', () => ({
  workshopTimeZone: vi.fn(async () => 'Pacific/Auckland'),
}))
vi.mock('@/lib/document-lock.server', () => ({
  assertInvoiceEditable: vi.fn(),
  assertQuoteEditable: vi.fn(),
}))
vi.mock('@/lib/files/manager', async () => {
  const actual = await vi.importActual<typeof import('@/lib/files/manager')>('@/lib/files/manager')
  return {
    parseStoredFileUrl: actual.parseStoredFileUrl,
    isGeneratedName: actual.isGeneratedName,
    releaseFiles: vi.fn(),
  }
})
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
import { releaseFiles } from '@/lib/files/manager'
import { equipmentTypes } from '@/features/equipment/Lib/equipmentGate.server'
import { vehicleEquipmentView, jobEquipmentView } from '@/features/equipment/Lib/equipment.server'
import { NO_EQUIPMENT, printableEquipment } from '@/features/equipment/Lib/equipmentPrint.server'
import { copyQuoteEquipmentToJob } from '@/features/equipment/Lib/equipmentWorkOn.server'
import {
  addEquipmentItem,
  deleteEquipmentItem,
  discardEquipmentReport,
  moveEquipmentItem,
  removeEquipmentItem,
  updateEquipmentItem,
} from '@/features/equipment/Actions/equipmentItemActions'
import {
  createEquipmentType,
  deleteEquipmentType,
  reorderEquipmentTypes,
  updateEquipmentType,
} from '@/features/equipment/Actions/equipmentTypeActions'
import { setJobEquipment, setQuoteEquipment } from '@/features/equipment/Actions/workOnActions'
import { quoteEquipmentView } from '@/features/equipment/Lib/equipment.server'

const plan = (customFields: boolean) =>
  vi.mocked(getFeatures).mockResolvedValue({ customFields } as never)
const TYPES = [
  { id: 'et-crane', name: 'Crane', isActive: true },
  { id: 'et-old', name: 'Snow plough', isActive: false },
]
const REPORT = { url: '/api/protected/files/org-1/vehicles/report.pdf', name: 'LOLER.pdf' }
const item = (extra: Record<string, unknown> = {}) => ({
  id: 'item-1',
  vehicleId: 'veh-A',
  removedAt: null,
  reportFileUrl: null,
  make: 'HIAB',
  model: 'X-HiPro 192',
  serialNumber: '4471',
  type: { name: 'Crane' },
  ...extra,
})

beforeEach(() => {
  vi.clearAllMocks()
  plan(true)
  db.equipmentType.findMany.mockResolvedValue(TYPES)
  db.equipmentItem.findFirst.mockResolvedValue(item())
})

describe('a workshop without equipment', () => {
  it('on a plan without custom fields is not even asked about it', async () => {
    plan(false)
    expect(await equipmentTypes('org-1')).toEqual([])
    expect(await vehicleEquipmentView('org-1', 'veh-A')).toBeNull()
    expect(await jobEquipmentView('org-1', { id: 'job-1', vehicleId: 'veh-A' })).toBeNull()
    expect(await printableEquipment('org-1', { jobId: 'job-1', vehicleId: 'veh-A' })).toEqual(
      NO_EQUIPMENT
    )
    expect(db.equipmentType.findMany).not.toHaveBeenCalled()
    expect(db.equipmentItem.findMany).not.toHaveBeenCalled()
  })

  it('with no type defined shows nothing and reads no items', async () => {
    db.equipmentType.findMany.mockResolvedValue([])
    expect(await vehicleEquipmentView('org-1', 'veh-A')).toBeNull()
    expect(await printableEquipment('org-1', { vehicleId: 'veh-A' })).toEqual(NO_EQUIPMENT)
    expect(db.equipmentItem.findMany).not.toHaveBeenCalled()
  })

  it('carries nothing from a quote to its job', async () => {
    db.equipmentType.findMany.mockResolvedValue([])
    await copyQuoteEquipmentToJob(db as never, {
      organizationId: 'org-1',
      quoteId: 'q-1',
      jobId: 'job-1',
      vehicleId: 'veh-A',
    })
    expect(db.quoteEquipment.findMany).not.toHaveBeenCalled()
    expect(db.serviceRecordEquipment.createMany).not.toHaveBeenCalled()
  })
})

describe('the workshop’s list of types', () => {
  it('refuses a name that differs from another only by case or spacing', async () => {
    db.equipmentType.findMany.mockResolvedValue([{ name: 'Tail lift' }])
    expect(await createEquipmentType({ name: ' tail  LIFT ' })).toEqual({
      success: false,
      error: 'duplicateName',
    })
    expect(db.equipmentType.create).not.toHaveBeenCalled()
  })

  it('renames and hides inside the workshop only', async () => {
    db.equipmentType.findMany.mockResolvedValue([])
    db.equipmentType.findFirst.mockResolvedValue(null)
    await updateEquipmentType({ id: 'et-crane', isActive: false })
    expect(db.equipmentType.updateMany).toHaveBeenCalledWith({
      where: { id: 'et-crane', organizationId: 'org-1' },
      data: { isActive: false },
    })
  })

  it('is put in the order given, and only as a whole', async () => {
    db.equipmentType.findMany.mockResolvedValue([{ id: 'a' }, { id: 'b' }])
    expect((await reorderEquipmentTypes({ ids: ['b'] })).success).toBe(false)
    expect((await reorderEquipmentTypes({ ids: ['b', 'x'] })).success).toBe(false)
    expect((await reorderEquipmentTypes({ ids: ['b', 'a'] })).success).toBe(true)
    expect(db.equipmentType.updateMany).toHaveBeenCalledWith({
      where: { id: 'b', organizationId: 'org-1' },
      data: { sortOrder: 0 },
    })
  })

  it('cannot delete a type that has items, even removed ones', async () => {
    db.equipmentType.findFirst.mockResolvedValue({
      id: 'et-crane',
      name: 'Crane',
      _count: { items: 1 },
    })
    expect(await deleteEquipmentType('et-crane')).toEqual({ success: false, error: 'hasItems' })
    expect(db.equipmentType.deleteMany).not.toHaveBeenCalled()
  })
})

describe('an item', () => {
  const base = { vehicleId: 'veh-A', typeId: 'et-crane' }

  it('takes a year of manufacture alone, or a full date, and stores its year either way', async () => {
    await addEquipmentItem({ ...base, manufacture: '2019' })
    expect(db.equipmentItem.create.mock.calls[0][0].data).toMatchObject({
      manufactureYear: 2019,
      manufactureDate: null,
    })
    await addEquipmentItem({ ...base, manufacture: '2019-05-14', installDate: '2020-01-31' })
    expect(db.equipmentItem.create.mock.calls[1][0].data).toMatchObject({
      manufactureYear: 2019,
      manufactureDate: new Date('2019-05-14T00:00:00.000Z'),
      // A day is stored as that day, whatever the workshop's clock.
      installDate: new Date('2020-01-31T00:00:00.000Z'),
    })
  })

  it('refuses a manufacture that is neither, a year in the future and a day that does not exist', async () => {
    expect((await addEquipmentItem({ ...base, manufacture: '19' })).success).toBe(false)
    expect((await addEquipmentItem({ ...base, manufacture: '2999' })).error).toBe(
      'manufactureFuture'
    )
    expect((await addEquipmentItem({ ...base, installDate: '2026-02-30' })).success).toBe(false)
    expect(db.equipmentItem.create).not.toHaveBeenCalled()
  })

  it('starts its history on the vehicle it is added to', async () => {
    await addEquipmentItem(base)
    expect(db.equipmentFitting.create).toHaveBeenCalledWith({
      data: { itemId: 'item-new', vehicleId: 'veh-A', organizationId: 'org-1' },
    })
  })

  it('takes no new item of a hidden type, and none on another workshop’s vehicle', async () => {
    expect((await addEquipmentItem({ ...base, typeId: 'et-old' })).success).toBe(false)
    db.vehicle.count.mockResolvedValueOnce(0)
    expect((await addEquipmentItem(base)).success).toBe(false)
    expect(db.equipmentItem.create).not.toHaveBeenCalled()
  })

  it('refuses a report file that is not this workshop’s upload', async () => {
    const other = { url: '/api/protected/files/org-2/vehicles/report.pdf', name: 'x.pdf' }
    expect((await addEquipmentItem({ ...base, report: other })).error).toBe('Not a report file')
    expect((await addEquipmentItem({ ...base, report: REPORT })).success).toBe(true)
  })

  it('lets go of a report file once it is replaced, and of its file when deleted', async () => {
    db.equipmentItem.findFirst.mockResolvedValueOnce({
      id: 'item-1',
      typeId: 'et-crane',
      vehicleId: 'veh-A',
      reportFileUrl: '/api/protected/files/org-1/vehicles/old.pdf',
    })
    await updateEquipmentItem({ id: 'item-1', typeId: 'et-crane', report: REPORT })
    expect(releaseFiles).toHaveBeenCalledWith(['/api/protected/files/org-1/vehicles/old.pdf'], {
      organizationId: 'org-1',
      reason: 'equipment report replaced',
    })
    db.equipmentItem.findFirst.mockResolvedValue(item({ reportFileUrl: REPORT.url }))
    await deleteEquipmentItem('item-1')
    expect(db.equipmentItem.deleteMany).toHaveBeenCalledWith({
      where: { id: 'item-1', organizationId: 'org-1' },
    })
    expect(releaseFiles).toHaveBeenLastCalledWith([REPORT.url], {
      organizationId: 'org-1',
      reason: 'equipment deleted',
    })
  })

  it('keeps an item of a type hidden since, when it is edited', async () => {
    db.equipmentItem.findFirst.mockResolvedValueOnce({
      id: 'item-1',
      typeId: 'et-old',
      vehicleId: 'veh-A',
      reportFileUrl: null,
    })
    expect((await updateEquipmentItem({ id: 'item-1', typeId: 'et-old' })).success).toBe(true)
  })
})

describe('an item moved to another vehicle', () => {
  it('closes its time on the old vehicle, starts one on the new, and stays on the old jobs', async () => {
    const result = await moveEquipmentItem({ id: 'item-1', vehicleId: 'veh-B' })
    expect(result.success).toBe(true)
    expect(db.equipmentFitting.updateMany).toHaveBeenCalledWith({
      where: { organizationId: 'org-1', itemId: 'item-1', endedAt: null },
      data: { endedAt: expect.any(Date), endReason: 'moved' },
    })
    expect(db.equipmentItem.updateMany).toHaveBeenCalledWith({
      where: { id: 'item-1', organizationId: 'org-1' },
      data: { vehicleId: 'veh-B', removedAt: null },
    })
    expect(db.equipmentFitting.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ itemId: 'item-1', vehicleId: 'veh-B' }),
    })
    // A job keeps what it worked on: the old vehicle's jobs keep the item
    // and the readings taken on them, locked or not.
    expect(db.meterReading.updateMany).not.toHaveBeenCalled()
    expect(db.serviceRecordEquipment.deleteMany).not.toHaveBeenCalled()
  })

  it('cannot go to another workshop’s vehicle', async () => {
    db.vehicle.count.mockResolvedValueOnce(0)
    expect((await moveEquipmentItem({ id: 'item-1', vehicleId: 'veh-X' })).success).toBe(false)
    expect(db.equipmentItem.updateMany).not.toHaveBeenCalled()
  })
})

describe('an item taken off', () => {
  it('keeps its removed date and stays in the vehicle’s history', async () => {
    await removeEquipmentItem('item-1')
    expect(db.equipmentItem.updateMany).toHaveBeenCalledWith({
      where: { id: 'item-1', organizationId: 'org-1' },
      data: { removedAt: expect.any(Date) },
    })
    expect(db.equipmentFitting.updateMany).toHaveBeenCalledWith({
      where: { organizationId: 'org-1', itemId: 'item-1', endedAt: null },
      data: { endedAt: expect.any(Date), endReason: 'removed' },
    })
    // The jobs that worked on it keep it and their readings of it.
    expect(db.meterReading.updateMany).not.toHaveBeenCalled()
    expect(db.serviceRecordEquipment.deleteMany).not.toHaveBeenCalled()
  })
})

describe('what a work order works on', () => {
  beforeEach(() => {
    db.serviceRecord.findFirst.mockResolvedValue({
      id: 'job-1',
      vehicleId: 'veh-A',
      invoiceNumber: 'WO-1',
    })
    db.serviceRecordEquipment.findMany.mockResolvedValue([])
  })

  it('newly picks only the job’s vehicle’s equipment, inside the workshop', async () => {
    db.equipmentItem.findMany.mockResolvedValue([])
    expect((await setJobEquipment({ id: 'job-1', itemIds: ['item-gone'] })).success).toBe(false)
    expect(db.equipmentItem.findMany).toHaveBeenCalledWith({
      where: { organizationId: 'org-1', id: { in: ['item-gone'] } },
      select: { id: true, vehicleId: true, removedAt: true },
    })
    // On another of the workshop's vehicles: not this job's to pick.
    db.equipmentItem.findMany.mockResolvedValue([
      { id: 'item-elsewhere', vehicleId: 'veh-B', removedAt: null },
    ])
    expect((await setJobEquipment({ id: 'job-1', itemIds: ['item-elsewhere'] })).success).toBe(
      false
    )
    expect(db.serviceRecordEquipment.createMany).not.toHaveBeenCalled()
  })

  it('keeps an item it already works on that has moved or been taken off since', async () => {
    db.serviceRecordEquipment.findMany.mockResolvedValue([
      { itemId: 'item-moved' },
      { itemId: 'item-off' },
    ])
    db.equipmentItem.findMany.mockResolvedValue([
      { id: 'item-moved', vehicleId: 'veh-B', removedAt: null },
      { id: 'item-off', vehicleId: 'veh-A', removedAt: new Date() },
      { id: 'item-new', vehicleId: 'veh-A', removedAt: null },
    ])
    const result = await setJobEquipment({
      id: 'job-1',
      itemIds: ['item-moved', 'item-off', 'item-new'],
    })
    expect(result).toMatchObject({
      success: true,
      data: { itemIds: ['item-moved', 'item-off', 'item-new'] },
    })
    expect(db.serviceRecordEquipment.deleteMany).not.toHaveBeenCalled()
    expect(db.serviceRecordEquipment.createMany).toHaveBeenCalledWith({
      data: [{ serviceRecordId: 'job-1', itemId: 'item-new', organizationId: 'org-1' }],
      skipDuplicates: true,
    })
  })

  it('reads what the job had inside its transaction, after the job’s row is locked', async () => {
    const order: string[] = []
    let inTransaction = false
    db.$transaction.mockImplementationOnce(async (arg: unknown) => {
      inTransaction = true
      try {
        return await (arg as (tx: unknown) => unknown)(db)
      } finally {
        inTransaction = false
      }
    })
    db.$queryRaw.mockImplementationOnce(async (...args: unknown[]) => {
      order.push(`lock:${inTransaction}:${String((args[0] as string[]).join('?'))}`)
      return [{ mileage: null, vehicleId: 'veh-A' }]
    })
    db.serviceRecordEquipment.findMany.mockImplementationOnce(async () => {
      order.push(`read:${inTransaction}`)
      return [{ itemId: 'item-1' }]
    })
    db.equipmentItem.findMany.mockResolvedValue([])
    expect((await setJobEquipment({ id: 'job-1', itemIds: [] })).success).toBe(true)
    expect(order).toHaveLength(2)
    expect(order[0]).toMatch(/^lock:true:[\s\S]*"service_records"[\s\S]*FOR UPDATE/)
    expect(order[1]).toBe('read:true')
  })

  it('takes an item’s readings on the job away with it when it is taken off the list', async () => {
    db.serviceRecordEquipment.findMany.mockResolvedValue([
      { itemId: 'item-1' },
      { itemId: 'item-2' },
    ])
    db.equipmentItem.findMany.mockResolvedValue([
      { id: 'item-2', vehicleId: 'veh-A', removedAt: null },
    ])
    expect((await setJobEquipment({ id: 'job-1', itemIds: ['item-2'] })).success).toBe(true)
    expect(db.serviceRecordEquipment.deleteMany).toHaveBeenCalledWith({
      where: { organizationId: 'org-1', serviceRecordId: 'job-1', itemId: { in: ['item-1'] } },
    })
    expect(db.meterReading.updateMany).toHaveBeenCalledWith({
      where: {
        organizationId: 'org-1',
        vehicleMeter: { equipmentItemId: { in: ['item-1'] } },
        serviceRecordId: { in: ['job-1'] },
      },
      data: { serviceRecordId: null },
    })
  })

  it('is frozen with a locked invoice', async () => {
    vi.mocked(assertInvoiceEditable).mockRejectedValueOnce(new Error('locked'))
    expect(await setJobEquipment({ id: 'job-1', itemIds: [] })).toEqual({
      success: false,
      error: 'locked',
    })
  })

  it('cannot newly pick an item that was removed', async () => {
    db.serviceRecordEquipment.findMany.mockResolvedValue([])
    db.equipmentItem.findMany.mockResolvedValue([
      { id: 'item-1', vehicleId: 'veh-A', removedAt: new Date() },
    ])
    expect((await setJobEquipment({ id: 'job-1', itemIds: ['item-1'] })).success).toBe(false)
  })
})

/** An item as ITEM_SELECT reads it. */
const itemRow = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  typeId: 'et-crane',
  make: 'HIAB',
  model: null,
  serialNumber: id,
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
  removedAt: null,
  vehicleId: 'veh-A',
  createdAt: new Date('2026-01-01T00:00:00Z'),
  type: { name: 'Crane', sortOrder: 0 },
  ...extra,
})

describe('a job that worked on an item moved or taken off since', () => {
  it('still shows it on its picker, marked, beside what is on its vehicle now', async () => {
    db.serviceRecordEquipment.findMany.mockResolvedValue([
      { itemId: 'moved' },
      { itemId: 'off' },
      { itemId: 'here' },
    ])
    db.equipmentItem.findMany
      .mockResolvedValueOnce([itemRow('here'), itemRow('free')])
      .mockResolvedValueOnce([
        itemRow('moved', { vehicleId: 'veh-B' }),
        itemRow('off', { removedAt: new Date('2026-06-01T00:00:00Z') }),
      ])
    const view = await jobEquipmentView('org-1', { id: 'job-1', vehicleId: 'veh-A' })
    // Read by the job alone, not by where its items are now.
    expect((db.serviceRecordEquipment.findMany.mock.calls[0] as unknown[])[0]).toMatchObject({
      where: {
        organizationId: 'org-1',
        serviceRecordId: 'job-1',
        item: { organizationId: 'org-1' },
      },
    })
    expect(view?.selected).toEqual(['moved', 'off', 'here'])
    expect(Object.fromEntries(view?.items.map((i) => [i.id, i.state]) ?? [])).toEqual({
      here: null,
      free: null,
      moved: 'moved',
      off: 'removed',
    })
  })

  it('still prints it, with the readings taken on the job', async () => {
    db.serviceRecordEquipment.findMany.mockResolvedValue([{ itemId: 'moved' }])
    db.equipmentItem.findMany.mockResolvedValue([itemRow('moved', { vehicleId: 'veh-B' })])
    const lists = await printableEquipment('org-1', { jobId: 'job-1', vehicleId: 'veh-A' })
    expect(lists.job.map((i) => i.serialNumber)).toEqual(['moved'])
    expect(lists.vehicle).toEqual([])
  })
})

describe('a quote’s equipment', () => {
  beforeEach(() => {
    db.quote.findFirst.mockResolvedValue({ id: 'q-1', vehicleId: 'veh-A', quoteNumber: 'Q-1' })
  })

  it('keeps an item it already has after the item moved, on its picker and its print', async () => {
    db.quoteEquipment.findMany.mockResolvedValue([{ itemId: 'moved' }])
    db.equipmentItem.findMany
      .mockResolvedValueOnce([itemRow('here')])
      .mockResolvedValueOnce([itemRow('moved', { vehicleId: 'veh-B' })])
    const view = await quoteEquipmentView('org-1', { id: 'q-1', vehicleId: 'veh-A' })
    expect((db.quoteEquipment.findMany.mock.calls[0] as unknown[])[0]).toMatchObject({
      where: { organizationId: 'org-1', quoteId: 'q-1', item: { organizationId: 'org-1' } },
    })
    expect(view?.selected).toEqual(['moved'])
    expect(view?.items.find((i) => i.id === 'moved')?.state).toBe('moved')

    db.equipmentItem.findMany.mockResolvedValue([itemRow('moved', { vehicleId: 'veh-B' })])
    const lists = await printableEquipment('org-1', { quoteId: 'q-1', vehicleId: 'veh-A' })
    expect(lists.job.map((i) => i.serialNumber)).toEqual(['moved'])
  })

  it('reads what the quote had inside its transaction, after the quote’s row is locked', async () => {
    const order: string[] = []
    let inTransaction = false
    db.$transaction.mockImplementationOnce(async (arg: unknown) => {
      inTransaction = true
      try {
        return await (arg as (tx: unknown) => unknown)(db)
      } finally {
        inTransaction = false
      }
    })
    db.$queryRaw.mockImplementationOnce(async (...args: unknown[]) => {
      order.push(`lock:${inTransaction}:${(args[0] as string[]).join('?')}`)
      return [{ vehicleId: 'veh-A' }]
    })
    db.quoteEquipment.findMany.mockImplementationOnce(async () => {
      order.push(`read:${inTransaction}`)
      return [{ itemId: 'item-1' }]
    })
    db.equipmentItem.findMany.mockResolvedValue([
      { id: 'item-2', vehicleId: 'veh-A', removedAt: null },
    ])
    const result = await setQuoteEquipment({ id: 'q-1', itemIds: ['item-2'] })
    expect(result).toMatchObject({ success: true, data: { itemIds: ['item-2'] } })
    expect(order).toHaveLength(2)
    expect(order[0]).toMatch(/^lock:true:[\s\S]*"quotes"[\s\S]*FOR UPDATE/)
    expect(order[1]).toBe('read:true')
    expect(db.quoteEquipment.deleteMany).toHaveBeenCalledWith({
      where: { organizationId: 'org-1', quoteId: 'q-1', itemId: { in: ['item-1'] } },
    })
  })

  it('newly picks only an item on the quote’s vehicle now', async () => {
    db.quoteEquipment.findMany.mockResolvedValue([])
    db.equipmentItem.findMany.mockResolvedValue([
      { id: 'moved', vehicleId: 'veh-B', removedAt: null },
    ])
    expect((await setQuoteEquipment({ id: 'q-1', itemIds: ['moved'] })).success).toBe(false)
    expect(db.quoteEquipment.createMany).not.toHaveBeenCalled()
  })
})

describe('a vehicle’s equipment history', () => {
  const fitting = (id: string, endedAt: string, endReason: string, item: unknown) => ({
    id,
    fittedAt: new Date('2026-01-01T00:00:00Z'),
    endedAt: new Date(endedAt),
    endReason,
    item,
  })

  it('says where a moved item went at the time, even after it came back', async () => {
    // The crane went from truck A to truck B in March, and came back in June.
    const crane = itemRow('crane', { vehicleId: 'veh-A' })
    db.equipmentItem.findMany.mockResolvedValue([{ ...crane, _count: { jobs: 0 } }])
    db.equipmentFitting.findMany
      .mockResolvedValueOnce([fitting('f-1', '2026-03-01T10:00:00Z', 'moved', crane)])
      .mockResolvedValueOnce([
        {
          itemId: 'crane',
          fittedAt: new Date('2026-01-01T00:00:00Z'),
          vehicle: { id: 'veh-A', year: 2019, make: 'Volvo', model: 'FH', licensePlate: 'A1' },
        },
        {
          itemId: 'crane',
          fittedAt: new Date('2026-06-01T00:00:00Z'),
          vehicle: { id: 'veh-A', year: 2019, make: 'Volvo', model: 'FH', licensePlate: 'A1' },
        },
        {
          itemId: 'crane',
          fittedAt: new Date('2026-03-01T10:00:00Z'),
          vehicle: { id: 'veh-B', year: 2021, make: 'Scania', model: 'R 450', licensePlate: 'B2' },
        },
      ])
    const view = await vehicleEquipmentView('org-1', 'veh-A')
    expect(view?.history).toEqual([
      expect.objectContaining({
        fittingId: 'f-1',
        endReason: 'moved',
        movedTo: { id: 'veh-B', name: '2021 Scania R 450 (B2)' },
      }),
    ])
  })

  it('says removed for an item taken off, and no vehicle', async () => {
    const crane = itemRow('crane', { removedAt: new Date('2026-03-01T10:00:00Z') })
    db.equipmentItem.findMany.mockResolvedValue([])
    db.equipmentFitting.findMany.mockResolvedValueOnce([
      fitting('f-1', '2026-03-01T10:00:00Z', 'removed', crane),
    ])
    const view = await vehicleEquipmentView('org-1', 'veh-A')
    expect(view?.history[0]).toMatchObject({ endReason: 'removed', movedTo: null })
  })

  it('tells how many work orders work on each item, for the delete question', async () => {
    db.equipmentItem.findMany.mockResolvedValue([{ ...itemRow('crane'), _count: { jobs: 3 } }])
    const view = await vehicleEquipmentView('org-1', 'veh-A')
    expect(view?.items[0].jobCount).toBe(3)
  })
})

describe('an item deleted for good', () => {
  it('leaves the jobs themselves alone, and with them what issued invoices froze', async () => {
    await deleteEquipmentItem('item-1')
    expect(db.equipmentItem.deleteMany).toHaveBeenCalledTimes(1)
    expect(db.serviceRecord.updateMany).not.toHaveBeenCalled()
  })
})

describe('a report uploaded and never saved', () => {
  const FRESH = '/api/protected/files/org-1/vehicles/0b6c8f8e-6d1f-4c7e-9a43-2f1d7c9b0a11.pdf'

  it('is let go of through the file manager once no item points at it', async () => {
    vi.mocked(releaseFiles).mockResolvedValueOnce({ removed: [FRESH], kept: [], skipped: [] })
    expect(await discardEquipmentReport(FRESH)).toEqual({
      success: true,
      data: { discarded: true },
    })
    expect(db.equipmentItem.count).toHaveBeenCalledWith({
      where: { organizationId: 'org-1', reportFileUrl: FRESH },
    })
    expect(releaseFiles).toHaveBeenCalledWith([FRESH], {
      organizationId: 'org-1',
      reason: 'equipment report not saved',
    })
  })

  it('is kept while an item points at it', async () => {
    db.equipmentItem.count.mockResolvedValueOnce(1)
    expect(await discardEquipmentReport(FRESH)).toEqual({
      success: true,
      data: { discarded: false },
    })
    expect(releaseFiles).not.toHaveBeenCalled()
  })

  it('touches nothing of another workshop, another folder or a file the upload did not name', async () => {
    for (const url of [
      '/api/protected/files/org-2/vehicles/0b6c8f8e-6d1f-4c7e-9a43-2f1d7c9b0a11.pdf',
      '/api/protected/files/org-1/services/0b6c8f8e-6d1f-4c7e-9a43-2f1d7c9b0a11.pdf',
      '/api/protected/files/org-1/vehicles/seed-photo.jpg',
      'https://example.com/x.pdf',
    ]) {
      expect((await discardEquipmentReport(url)).success).toBe(false)
    }
    expect(releaseFiles).not.toHaveBeenCalled()
  })
})
