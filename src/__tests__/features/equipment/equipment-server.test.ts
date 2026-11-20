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
  quoteEquipment: { findMany: vi.fn(async () => [] as unknown[]) },
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
  serviceRecord: { findFirst: vi.fn() },
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
  return { parseStoredFileUrl: actual.parseStoredFileUrl, releaseFiles: vi.fn() }
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
import { setJobEquipment } from '@/features/equipment/Actions/workOnActions'

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
  it('closes its time on the old vehicle, starts one on the new, and leaves the old jobs', async () => {
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
    // Its readings on the old vehicle's jobs stay in its history, no longer those jobs'.
    expect(db.meterReading.updateMany).toHaveBeenCalledWith({
      where: {
        organizationId: 'org-1',
        vehicleMeter: { equipmentItemId: { in: ['item-1'] } },
        serviceRecordId: { not: null },
        serviceRecord: { vehicleId: { not: 'veh-B' } },
      },
      data: { serviceRecordId: null },
    })
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

  it('is only the job’s vehicle’s equipment, inside the workshop', async () => {
    db.equipmentItem.findMany.mockResolvedValue([])
    expect((await setJobEquipment({ id: 'job-1', itemIds: ['item-elsewhere'] })).success).toBe(
      false
    )
    expect(db.equipmentItem.findMany).toHaveBeenCalledWith({
      where: { organizationId: 'org-1', vehicleId: 'veh-A', id: { in: ['item-elsewhere'] } },
      select: { id: true, removedAt: true },
    })
    expect(db.serviceRecordEquipment.createMany).not.toHaveBeenCalled()
  })

  it('takes an item’s readings on the job away with it when it is taken off the list', async () => {
    db.serviceRecordEquipment.findMany.mockResolvedValue([
      { itemId: 'item-1' },
      { itemId: 'item-2' },
    ])
    db.equipmentItem.findMany.mockResolvedValue([{ id: 'item-2', removedAt: null }])
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
    db.equipmentItem.findMany.mockResolvedValue([{ id: 'item-1', removedAt: new Date() }])
    expect((await setJobEquipment({ id: 'job-1', itemIds: ['item-1'] })).success).toBe(false)
  })
})
