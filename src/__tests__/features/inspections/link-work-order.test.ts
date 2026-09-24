/**
 * An inspection lands on a booked job rather than beside it: the jobs it may
 * be linked to, what linking writes, and starting a checklist from a job.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { db, tx } = vi.hoisted(() => {
  const tx = {
    serviceRecord: { update: vi.fn() },
    serviceLabor: { createMany: vi.fn() },
    inspection: { create: vi.fn() },
    inspectionItem: { createMany: vi.fn() },
  }
  const db = {
    inspection: { findFirst: vi.fn() },
    serviceRecord: { findFirst: vi.fn(), findMany: vi.fn() },
    appSetting: { findUnique: vi.fn() },
    vehicle: { findFirst: vi.fn() },
    inspectionTemplate: { findFirst: vi.fn() },
    technician: { findFirst: vi.fn() },
    $transaction: vi.fn(async (fn: (client: typeof tx) => Promise<unknown>) => fn(tx)),
  }
  return { db, tx }
})
vi.mock('@/lib/db', () => ({ db }))
vi.mock('@/lib/with-auth', () => ({
  withAuth: async (fn: (ctx: { organizationId: string; userId: string }) => Promise<unknown>) => {
    try {
      return { success: true, data: await fn({ organizationId: 'org', userId: 'user' }) }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  },
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next-intl/server', () => ({ getTranslations: async () => (key: string) => key }))
vi.mock('@/features/vehicles/Lib/retotalServiceRecord', () => ({
  retotalServiceRecord: vi.fn(async () => undefined),
}))
vi.mock('@/lib/files/manager', () => ({ releaseFiles: vi.fn() }))
vi.mock('@/lib/files/collect', () => ({ inspectionFileUrls: vi.fn(async () => []) }))
vi.mock('@/lib/workshop-timezone', () => ({ workshopTimeZone: async () => 'UTC' }))

import {
  createInspection,
  getLinkableWorkOrders,
  linkWorkOrderToInspection,
} from '@/features/inspections/Actions/inspectionActions'
import { retotalServiceRecord } from '@/features/vehicles/Lib/retotalServiceRecord'

const INSPECTION = {
  id: 'insp-1',
  vehicleId: 'veh-1',
  mileage: 120000,
  template: { name: 'Annual test' },
  items: [
    { name: 'Wipers', code: null, notes: null, condition: 'pass', sortOrder: 0 },
    { name: 'Brake hose', code: '1.1.13', notes: 'Chafed', condition: 'dangerous', sortOrder: 1 },
    { name: 'Tyres', code: null, notes: null, condition: 'attention', sortOrder: 2 },
  ],
}

beforeEach(() => {
  vi.clearAllMocks()
  db.inspection.findFirst.mockResolvedValue(INSPECTION)
  db.appSetting.findUnique.mockResolvedValue({ value: '950' })
  tx.serviceRecord.update.mockResolvedValue({})
  tx.serviceLabor.createMany.mockResolvedValue({})
})

describe('the jobs an inspection can land on', () => {
  it("offers this car's open jobs that have no inspection yet", async () => {
    db.serviceRecord.findMany.mockResolvedValue([])
    await getLinkableWorkOrders('insp-1')
    expect(db.serviceRecord.findMany.mock.calls[0][0].where).toEqual({
      organizationId: 'org',
      vehicleId: 'veh-1',
      inspectionId: null,
      status: { in: ['pending', 'in-progress', 'waiting-parts', 'scheduled'] },
    })
  })
})

describe('linking to a booked job', () => {
  it('links the job and adds the inspection line and the defects, worst first', async () => {
    db.serviceRecord.findFirst.mockResolvedValue({
      id: 'job-1',
      vehicleId: 'veh-1',
      invoiceNumber: '2026-1007',
      inspectionId: null,
      laborItems: [],
    })
    const result = await linkWorkOrderToInspection('insp-1', 'job-1', { includeDefects: true })
    expect(result.success).toBe(true)
    expect(tx.serviceRecord.update).toHaveBeenCalledWith({
      where: { id: 'job-1' },
      data: { inspectionId: 'insp-1', mileage: 120000 },
    })
    expect(
      tx.serviceLabor.createMany.mock.calls[0][0].data.map(
        (l: { description: string }) => l.description
      )
    ).toEqual(['Annual test', '1.1.13 Brake hose: Chafed', 'Tyres'])
    expect(tx.serviceLabor.createMany.mock.calls[0][0].data[0]).toMatchObject({
      rate: 950,
      hours: 0,
    })
    expect(retotalServiceRecord).toHaveBeenCalledWith('job-1', tx)
  })

  it('does not repeat the inspection line a booked job already carries', async () => {
    db.serviceRecord.findFirst.mockResolvedValue({
      id: 'job-1',
      vehicleId: 'veh-1',
      invoiceNumber: null,
      inspectionId: null,
      laborItems: [{ description: 'Annual test' }],
    })
    await linkWorkOrderToInspection('insp-1', 'job-1', { includeDefects: false })
    expect(tx.serviceRecord.update).toHaveBeenCalled()
    expect(tx.serviceLabor.createMany).not.toHaveBeenCalled()
    expect(retotalServiceRecord).not.toHaveBeenCalled()
  })

  it("refuses a job that is another inspection's, or another car's", async () => {
    db.serviceRecord.findFirst.mockResolvedValue({
      id: 'job-1',
      vehicleId: 'veh-1',
      invoiceNumber: null,
      inspectionId: 'insp-other',
      laborItems: [],
    })
    expect((await linkWorkOrderToInspection('insp-1', 'job-1')).success).toBe(false)

    db.serviceRecord.findFirst.mockResolvedValue(null)
    const result = await linkWorkOrderToInspection('insp-1', 'job-2')
    expect(result.success).toBe(false)
    expect(db.serviceRecord.findFirst.mock.calls.at(-1)?.[0].where).toMatchObject({
      id: 'job-2',
      organizationId: 'org',
      vehicleId: 'veh-1',
    })
    expect(tx.serviceRecord.update).not.toHaveBeenCalled()
  })
})

describe('starting an inspection from a booked job', () => {
  beforeEach(() => {
    db.vehicle.findFirst.mockResolvedValue({ id: 'veh-1' })
    db.inspectionTemplate.findFirst.mockResolvedValue({
      id: 'tpl-1',
      severityScale: 'eu',
      country: 'NO',
      sections: [],
    })
    db.technician.findFirst.mockResolvedValue(null)
    tx.inspection.create.mockResolvedValue({ id: 'insp-new' })
  })

  it('creates the checklist and puts it on the job', async () => {
    db.serviceRecord.findFirst.mockResolvedValue({ id: 'job-1', inspectionId: null })
    const result = await createInspection({
      vehicleId: 'veh-1',
      templateId: 'tpl-1',
      serviceRecordId: 'job-1',
    })
    expect(result.success).toBe(true)
    expect(db.serviceRecord.findFirst.mock.calls[0][0].where).toEqual({
      id: 'job-1',
      organizationId: 'org',
      vehicleId: 'veh-1',
    })
    expect(tx.serviceRecord.update).toHaveBeenCalledWith({
      where: { id: 'job-1' },
      data: { inspectionId: 'insp-new' },
    })
  })

  it('refuses a job that already has an inspection', async () => {
    db.serviceRecord.findFirst.mockResolvedValue({ id: 'job-1', inspectionId: 'insp-old' })
    const result = await createInspection({
      vehicleId: 'veh-1',
      templateId: 'tpl-1',
      serviceRecordId: 'job-1',
    })
    expect(result.success).toBe(false)
    expect(tx.inspection.create).not.toHaveBeenCalled()
  })
})
