import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/cached-session', () => ({
  getCachedSession: vi.fn(),
  getCachedMembership: vi.fn(),
}))
vi.mock('@/lib/features', () => ({ getFeatures: vi.fn() }))
vi.mock('@/features/integrations/Lib/vehicle-lookup', () => ({
  findLookupConnection: vi.fn(),
  askRegistry: vi.fn(),
  withinLookupBudget: vi.fn(() => true),
}))
vi.mock('@/features/integrations/Lib/inspection-sync', () => ({
  recordRegistryAnswer: vi.fn(async () => undefined),
}))
vi.mock('@/lib/db', () => ({
  db: {
    $queryRaw: vi.fn(),
    user: { findUnique: vi.fn(async () => ({ isSuperAdmin: false })) },
    vehicle: { findUnique: vi.fn(), findFirst: vi.fn() },
  },
}))

import { recordRegistryAnswer } from '@/features/integrations/Lib/inspection-sync'
import { askRegistry, findLookupConnection } from '@/features/integrations/Lib/vehicle-lookup'
import { lookupPlate } from '@/features/vehicles/Actions/plateLookupActions'
import { compactPlate, looksLikePlate } from '@/features/vehicles/Lib/plate'
import { getCachedMembership, getCachedSession } from '@/lib/cached-session'
import { db } from '@/lib/db'
import { getFeatures } from '@/lib/features'

const ROW = {
  id: 'v1',
  make: 'Toyota',
  model: 'Prius+',
  year: 2018,
  licensePlate: 'SK-209-X',
  vin: 'JTDZN3EU0E3298500',
  color: 'Zwart',
  mileage: 84210,
  imageUrl: null,
  isArchived: false,
  customer: { id: 'c1', name: 'Anna de Vries', company: null, phone: '+31 6 1234' },
  inspectionStatus: { dueAt: new Date('2027-04-26T00:00:00Z') },
  _count: { serviceRecords: 3 },
  serviceRecords: [{ serviceDate: new Date('2026-05-02T09:00:00Z') }],
}

const REGISTRY = {
  result: { make: 'Toyota', model: 'PRIUS PLUS', year: 2018, vin: 'JTDZN3EU0E3298500' },
  source: 'RDW Open Data',
  connectorId: 'rdw',
}

function signIn() {
  vi.mocked(getCachedSession).mockResolvedValue({
    user: { id: 'u1', email: 'a@b.c', name: 'A', isSuperAdmin: false },
  } as never)
  vi.mocked(getCachedMembership).mockResolvedValue({
    organizationId: 'org1',
    role: 'owner',
    roleId: null,
    customRole: null,
  } as never)
}

describe('plate helpers', () => {
  it('compacts what people type to what registries and comparisons take', () => {
    expect(compactPlate('sk-209-x')).toBe('SK209X')
    expect(compactPlate(' AB 123 CD ')).toBe('AB123CD')
    expect(compactPlate('90-27-QL')).toBe('9027QL')
  })

  it('knows a plate from a stray keystroke', () => {
    expect(looksLikePlate('SK209X')).toBe(true)
    expect(looksLikePlate('a')).toBe(false)
    expect(looksLikePlate('')).toBe(false)
    expect(looksLikePlate('ABCDEFGHIJKLM')).toBe(false)
  })
})

describe('lookupPlate', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    signIn()
    vi.mocked(getFeatures).mockResolvedValue({ integrations: true } as never)
    vi.mocked(findLookupConnection).mockResolvedValue({ id: 'conn1', connectorId: 'rdw' })
    vi.mocked(askRegistry).mockResolvedValue(REGISTRY)
    vi.mocked(db.$queryRaw).mockResolvedValue([])
    vi.mocked(db.vehicle.findUnique).mockResolvedValue(null)
    vi.mocked(db.vehicle.findFirst).mockResolvedValue(null)
  })

  it('finds the workshop vehicle by compacted plate and records the registry answer on it', async () => {
    vi.mocked(db.$queryRaw).mockResolvedValue([{ id: 'v1' }])
    vi.mocked(db.vehicle.findUnique).mockResolvedValue(ROW as never)
    const res = await lookupPlate({ plate: 'sk 209 x' })
    expect(res.success).toBe(true)
    const data = res.data
    expect(data?.plate).toBe('SK209X')
    expect(data?.vehicle).toMatchObject({
      id: 'v1',
      make: 'Toyota',
      customer: { name: 'Anna de Vries' },
      inspectionDueAt: '2027-04-26T00:00:00.000Z',
      serviceCount: 3,
      lastServiceAt: '2026-05-02T09:00:00.000Z',
    })
    expect(data?.registry).toMatchObject({ make: 'Toyota', source: 'RDW Open Data' })
    expect(askRegistry).toHaveBeenCalledWith('conn1', { plate: 'SK209X' })
    // The compacted plate, not the typed one, is what the SQL compares against.
    const sql = vi.mocked(db.$queryRaw).mock.calls[0]
    expect(sql.slice(1)).toContain('SK209X')
    expect(recordRegistryAnswer).toHaveBeenCalledWith(
      expect.objectContaining({ vehicleId: 'v1', source: 'rdw', result: REGISTRY.result })
    )
  })

  it('falls back to the registry VIN when the plate is new to the workshop', async () => {
    vi.mocked(db.vehicle.findFirst).mockResolvedValue({
      ...ROW,
      licensePlate: 'OLD-PLATE',
    } as never)
    const res = await lookupPlate({ plate: 'SK209X' })
    expect(res.data?.vehicle?.licensePlate).toBe('OLD-PLATE')
    expect(db.vehicle.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          vin: { equals: 'JTDZN3EU0E3298500', mode: 'insensitive' },
        }),
      })
    )
  })

  it('still answers from the workshop when the registry fails, and says why', async () => {
    vi.mocked(db.$queryRaw).mockResolvedValue([{ id: 'v1' }])
    vi.mocked(db.vehicle.findUnique).mockResolvedValue(ROW as never)
    vi.mocked(askRegistry).mockRejectedValue(new Error('RDW is throttling requests'))
    const res = await lookupPlate({ plate: 'SK209X' })
    expect(res.data?.vehicle?.id).toBe('v1')
    expect(res.data?.registry).toBeNull()
    expect(res.data?.registryError).toBe('RDW is throttling requests')
    expect(recordRegistryAnswer).not.toHaveBeenCalled()
  })

  it('reports a miss on both sides without an error', async () => {
    vi.mocked(askRegistry).mockResolvedValue({ ...REGISTRY, result: null })
    const res = await lookupPlate({ plate: 'ZZ99ZZZ' })
    expect(res.data).toMatchObject({
      plate: 'ZZ99ZZZ',
      vehicle: null,
      registry: null,
      registryError: null,
      source: 'RDW Open Data',
    })
  })

  it('leaves the registry alone when none is connected or the plan has no integrations', async () => {
    vi.mocked(findLookupConnection).mockResolvedValue(null)
    const res = await lookupPlate({ plate: 'SK209X' })
    expect(res.data?.source).toBeNull()
    expect(askRegistry).not.toHaveBeenCalled()
    vi.mocked(getFeatures).mockResolvedValue({ integrations: false } as never)
    await lookupPlate({ plate: 'SK209X' })
    expect(findLookupConnection).toHaveBeenCalledTimes(1)
  })

  it('refuses something that is not a plate', async () => {
    const res = await lookupPlate({ plate: '?' })
    expect(res.success).toBe(false)
    expect(res.error).toMatch(/not look like a plate/)
    expect(db.$queryRaw).not.toHaveBeenCalled()
  })
})
