import { beforeEach, describe, expect, it, vi } from 'vitest'
import { type EntryRow, toSheetEntries } from '@/features/time-tracking/Lib/serialize'
import { db } from '@/lib/db'

vi.mock('@/lib/db', () => ({
  db: { user: { findMany: vi.fn() } },
}))

function entryRow(overrides: Partial<EntryRow> = {}): EntryRow {
  return {
    id: 'e1',
    startedAt: new Date('2026-09-07T06:00:00Z'),
    endedAt: new Date('2026-09-07T07:00:00Z'),
    durationMinutes: 60,
    note: null,
    source: 'app',
    editedAt: null,
    editedByUserId: null,
    technicianId: 't1',
    technician: { id: 't1', name: 'Kari', color: '#3b82f6' },
    serviceRecord: {
      id: 'j1',
      title: 'Brakes',
      status: 'in-progress',
      vehicleId: 'v1',
      customer: { name: 'Direct customer' },
      vehicle: {
        make: 'Volvo',
        model: 'V70',
        licensePlate: 'AB12345',
        customer: { name: 'Vehicle customer' },
      },
    },
    ...overrides,
  }
}

describe('toSheetEntries', () => {
  beforeEach(() => {
    vi.mocked(db.user.findMany).mockReset()
    vi.mocked(db.user.findMany).mockResolvedValue([])
  })

  it('uses the vehicle customer instead of the direct customer and serializes dates', async () => {
    const row = entryRow()

    expect(await toSheetEntries([row])).toEqual([
      {
        id: 'e1',
        startedAt: '2026-09-07T06:00:00.000Z',
        endedAt: '2026-09-07T07:00:00.000Z',
        durationMinutes: 60,
        note: null,
        source: 'app',
        editedAt: null,
        editedByName: null,
        technicianId: 't1',
        technicianName: 'Kari',
        technicianColor: '#3b82f6',
        job: {
          id: 'j1',
          title: 'Brakes',
          status: 'in-progress',
          vehicleId: 'v1',
          vehicleLabel: 'Volvo V70',
          licensePlate: 'AB12345',
          clientName: 'Vehicle customer',
        },
      },
    ])
    expect(db.user.findMany).not.toHaveBeenCalled()
  })

  it('uses the direct customer for a counter sale without a vehicle', async () => {
    const row = entryRow()
    row.serviceRecord = {
      ...row.serviceRecord,
      title: 'Counter sale',
      vehicleId: null,
      vehicle: null,
      customer: { name: 'Counter customer' },
    }

    const [serialized] = await toSheetEntries([row])

    expect(serialized.job).toEqual({
      id: 'j1',
      title: 'Counter sale',
      status: 'in-progress',
      vehicleId: null,
      vehicleLabel: null,
      licensePlate: null,
      clientName: 'Counter customer',
    })
  })

  it.each([
    null,
    undefined,
  ])('leaves an unassigned job with a %s customer unnamed', async (customer) => {
    const row = entryRow({ endedAt: null, durationMinutes: null })
    row.serviceRecord = { ...row.serviceRecord, vehicleId: null, vehicle: null, customer }

    const [serialized] = await toSheetEntries([row])

    expect(serialized.job.clientName).toBeNull()
    expect(serialized.job.vehicleLabel).toBeNull()
    expect(serialized.job.licensePlate).toBeNull()
    expect(serialized.endedAt).toBeNull()
    expect(serialized.durationMinutes).toBeNull()
  })

  it.each([
    null,
    undefined,
  ])('does not fall back to the direct customer when a vehicle has a %s customer', async (customer) => {
    const row = entryRow()
    row.serviceRecord.vehicle = { make: 'Volvo', model: 'V70', licensePlate: null, customer }

    const [serialized] = await toSheetEntries([row])

    expect(serialized.job.clientName).toBeNull()
    expect(serialized.job.vehicleLabel).toBe('Volvo V70')
    expect(serialized.job.licensePlate).toBeNull()
  })

  it('batches unique editor ids and resolves names, email fallbacks, and missing editors', async () => {
    vi.mocked(db.user.findMany).mockResolvedValue([
      { id: 'u1', name: 'Manager', email: 'manager@example.com' },
      { id: 'u2', name: null, email: 'editor@example.com' },
    ] as Awaited<ReturnType<typeof db.user.findMany>>)
    const editedAt = new Date('2026-09-08T10:00:00Z')
    const rows = [
      entryRow({ id: 'e1', editedByUserId: 'u1', editedAt }),
      entryRow({ id: 'e2', editedByUserId: 'u1', editedAt }),
      entryRow({ id: 'e3', editedByUserId: 'u2', editedAt }),
      entryRow({ id: 'e4', editedByUserId: 'missing', editedAt }),
      entryRow({ id: 'e5' }),
    ]

    const serialized = await toSheetEntries(rows)

    expect(db.user.findMany).toHaveBeenCalledExactlyOnceWith({
      where: { id: { in: ['u1', 'u2', 'missing'] } },
      select: { id: true, name: true, email: true },
    })
    expect(serialized.map((e) => e.editedByName)).toEqual([
      'Manager',
      'Manager',
      'editor@example.com',
      null,
      null,
    ])
    expect(serialized.map((e) => e.editedAt)).toEqual([
      '2026-09-08T10:00:00.000Z',
      '2026-09-08T10:00:00.000Z',
      '2026-09-08T10:00:00.000Z',
      '2026-09-08T10:00:00.000Z',
      null,
    ])
  })

  it('returns an empty sheet without querying editors for an empty batch', async () => {
    expect(await toSheetEntries([])).toEqual([])
    expect(db.user.findMany).not.toHaveBeenCalled()
  })
})
