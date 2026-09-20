/**
 * What each delete hands to the file manager: every file that goes with the
 * rows it deletes (following the schema's cascades), read only from the
 * calling workshop's own rows.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/db', () => ({
  db: {
    serviceAttachment: { findMany: vi.fn() },
    statusReport: { findMany: vi.fn() },
    inspectionItem: { findMany: vi.fn() },
    vehicle: { findMany: vi.fn() },
    quoteAttachment: { findMany: vi.fn() },
    tireSetAttachment: { findMany: vi.fn() },
    storedImage: { findMany: vi.fn() },
    inventoryPart: { findMany: vi.fn() },
  },
}))

import { db } from '@/lib/db'
import {
  inspectionFileUrls,
  inventoryPartFileUrls,
  quoteFileUrls,
  serviceRecordFileUrls,
  tireSetFileUrls,
  vehicleFileUrls,
} from '@/lib/files/collect'

const ORG = 'org-a'
const where = (fn: unknown) =>
  (fn as { mock: { calls: { where: unknown }[][] } }).mock.calls[0][0].where

beforeEach(() => {
  vi.mocked(db.serviceAttachment.findMany)
    .mockReset()
    .mockResolvedValue([
      { fileUrl: 'services/a.jpg' },
      { fileUrl: 'tire-hotel/shared.jpg' },
    ] as never)
  vi.mocked(db.statusReport.findMany)
    .mockReset()
    .mockResolvedValue([{ videoUrl: 'services/v.mp4' }, { videoUrl: null }] as never)
  vi.mocked(db.inspectionItem.findMany)
    .mockReset()
    .mockResolvedValue([{ imageUrls: ['services/i1.jpg', 'services/i2.jpg'] }] as never)
  vi.mocked(db.vehicle.findMany).mockReset()
  vi.mocked(db.quoteAttachment.findMany)
    .mockReset()
    .mockResolvedValue([{ fileUrl: 'quotes/q.pdf' }] as never)
  vi.mocked(db.tireSetAttachment.findMany)
    .mockReset()
    .mockResolvedValue([{ fileUrl: 'tire-hotel/shared.jpg' }] as never)
  vi.mocked(db.storedImage.findMany)
    .mockReset()
    .mockResolvedValue([{ url: 'inventory/m.jpg' }] as never)
  vi.mocked(db.inventoryPart.findMany).mockReset()
})

describe('files that go with a delete', () => {
  it('a work order: its attachments (tire hotel copies included) and status report videos', async () => {
    const urls = await serviceRecordFileUrls(ORG, ['sr-1'])
    expect(urls).toEqual(['services/a.jpg', 'tire-hotel/shared.jpg', 'services/v.mp4', null])
    expect(where(db.serviceAttachment.findMany)).toEqual({
      serviceRecordId: { in: ['sr-1'] },
      serviceRecord: { organizationId: ORG },
    })
    expect(where(db.statusReport.findMany)).toEqual({
      serviceRecordId: { in: ['sr-1'] },
      organizationId: ORG,
    })
  })

  it('an inspection: the photos on its items', async () => {
    expect(await inspectionFileUrls(ORG, ['in-1'])).toEqual(['services/i1.jpg', 'services/i2.jpg'])
    expect(where(db.inspectionItem.findMany)).toEqual({
      inspectionId: { in: ['in-1'] },
      inspection: { organizationId: ORG },
    })
  })

  it('a vehicle: its image, findings, and its jobs and inspections with their files', async () => {
    vi.mocked(db.vehicle.findMany).mockResolvedValue([
      {
        imageUrl: 'vehicles/car.jpg',
        serviceRecords: [{ id: 'sr-1' }],
        inspections: [{ id: 'in-1' }],
        findings: [{ imageUrls: ['services/f.jpg'] }],
      },
    ] as never)

    const urls = await vehicleFileUrls(ORG, ['v-1'])

    expect(urls).toEqual([
      'vehicles/car.jpg',
      'services/f.jpg',
      'services/a.jpg',
      'tire-hotel/shared.jpg',
      'services/v.mp4',
      null,
      'services/i1.jpg',
      'services/i2.jpg',
    ])
    expect(where(db.vehicle.findMany)).toEqual({ id: { in: ['v-1'] }, organizationId: ORG })
    // Only the jobs and inspections of vehicles this workshop owns.
    expect(where(db.serviceAttachment.findMany)).toMatchObject({
      serviceRecordId: { in: ['sr-1'] },
    })
    expect(where(db.inspectionItem.findMany)).toMatchObject({ inspectionId: { in: ['in-1'] } })
  })

  it('a vehicle of another workshop: nothing', async () => {
    vi.mocked(db.vehicle.findMany).mockResolvedValue([])
    expect(await vehicleFileUrls(ORG, ['theirs'])).toEqual([])
    expect(db.serviceAttachment.findMany).not.toHaveBeenCalled()
  })

  it('a quote, a tire set and an inventory part', async () => {
    expect(await quoteFileUrls(ORG, ['q-1'])).toEqual(['quotes/q.pdf'])
    expect(where(db.quoteAttachment.findMany)).toEqual({
      quoteId: { in: ['q-1'] },
      quote: { organizationId: ORG },
    })

    expect(await tireSetFileUrls(ORG, ['t-1'])).toEqual([
      'tire-hotel/shared.jpg',
      'inventory/m.jpg',
    ])
    expect(where(db.tireSetAttachment.findMany)).toEqual({
      tireSetId: { in: ['t-1'] },
      tireSet: { organizationId: ORG },
    })
    expect(where(db.storedImage.findMany)).toEqual({
      tireMeasurement: { tireSetId: { in: ['t-1'] }, tireSet: { organizationId: ORG } },
    })

    vi.mocked(db.inventoryPart.findMany).mockResolvedValue([
      { imageUrl: 'inventory/main.jpg', gallery: [{ url: 'inventory/g.jpg' }] },
    ] as never)
    expect(await inventoryPartFileUrls(ORG, ['p-1'])).toEqual([
      'inventory/main.jpg',
      'inventory/g.jpg',
    ])
    expect(where(db.inventoryPart.findMany)).toEqual({ id: { in: ['p-1'] }, organizationId: ORG })
  })

  it('asks nothing when there is nothing to delete', async () => {
    for (const collect of [
      serviceRecordFileUrls,
      inspectionFileUrls,
      vehicleFileUrls,
      quoteFileUrls,
      tireSetFileUrls,
      inventoryPartFileUrls,
    ]) {
      expect(await collect(ORG, [])).toEqual([])
    }
    expect(db.vehicle.findMany).not.toHaveBeenCalled()
    expect(db.serviceAttachment.findMany).not.toHaveBeenCalled()
  })
})
