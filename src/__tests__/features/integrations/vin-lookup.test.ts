import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/cached-session', () => ({
  getCachedSession: vi.fn(),
  getCachedMembership: vi.fn(),
}))
vi.mock('@/lib/features', () => ({ getFeatures: vi.fn() }))
vi.mock('@/features/integrations/Lib/inspection-sync', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  recordRegistryAnswer: vi.fn(async () => undefined),
}))
vi.mock('@/features/integrations/Lib/vehicle-lookup', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/integrations/Lib/vehicle-lookup')>()
  return { ...actual, askRegistry: vi.fn() }
})
vi.mock('@/lib/db', () => ({
  db: {
    user: { findUnique: vi.fn(async () => ({ isSuperAdmin: false })) },
    vehicle: { findFirst: vi.fn() },
    integrationConnection: { findMany: vi.fn() },
    appSetting: { findUnique: vi.fn() },
  },
}))

import {
  isVehicleLookupAvailable,
  lookupVehicle,
} from '@/features/integrations/Actions/vehicleLookupActions'
import { recordRegistryAnswer } from '@/features/integrations/Lib/inspection-sync'
import {
  askRegistry,
  countriesForDialCode,
  findLookupConnection,
} from '@/features/integrations/Lib/vehicle-lookup'
import { getCachedMembership, getCachedSession } from '@/lib/cached-session'
import { db } from '@/lib/db'
import { getFeatures } from '@/lib/features'

const VIN = '1HGCM82633A004352'

function connected(...connectorIds: string[]) {
  vi.mocked(db.integrationConnection.findMany).mockResolvedValue(
    connectorIds.map((connectorId) => ({
      id: `conn-${connectorId}`,
      connectorId,
      settings: {},
    })) as never
  )
}

function country(code: string) {
  vi.mocked(db.appSetting.findUnique).mockResolvedValue({ value: code } as never)
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getCachedSession).mockResolvedValue({
    user: { id: 'u1', email: 'a@b.c', name: 'A', isSuperAdmin: false },
  } as never)
  vi.mocked(getCachedMembership).mockResolvedValue({
    organizationId: 'org1',
    role: 'owner',
    roleId: null,
    customRole: null,
  } as never)
  vi.mocked(getFeatures).mockResolvedValue({ integrations: true } as never)
  vi.mocked(db.vehicle.findFirst).mockResolvedValue({ id: 'v1' } as never)
  country('+1')
})

describe('findLookupConnection', () => {
  it('sends a VIN to the decoder and a plate to the registry when a US shop has both', async () => {
    connected('regcheck', 'nhtsa')
    expect(await findLookupConnection('org1', 'vin')).toMatchObject({ connectorId: 'nhtsa' })
    expect(await findLookupConnection('org1', 'plate')).toMatchObject({ connectorId: 'regcheck' })
  })

  it('offers no plate lookup when the only connector decodes VINs', async () => {
    connected('nhtsa')
    expect(await findLookupConnection('org1', 'plate')).toBeNull()
    expect(await findLookupConnection('org1')).toBeNull()
  })

  it('treats a registry that answers to both as either', async () => {
    country('+47')
    connected('vegvesen')
    expect(await findLookupConnection('org1', 'vin')).toMatchObject({ connectorId: 'vegvesen' })
    expect(await findLookupConnection('org1', 'plate')).toMatchObject({ connectorId: 'vegvesen' })
  })

  it("prefers the registry for the workshop's country, read from its phone prefix", async () => {
    connected('vegvesen', 'checkcardetails')
    country('+44')
    expect(await findLookupConnection('org1', 'plate')).toMatchObject({
      connectorId: 'checkcardetails',
    })
    country('+47')
    expect(await findLookupConnection('org1', 'plate')).toMatchObject({ connectorId: 'vegvesen' })
  })

  it('takes the newest of two registries for the same country', async () => {
    country('+44')
    // The query asks for the newest first; the mock returns rows in that order.
    connected('checkcardetails', 'openapi-automotive')
    expect(await findLookupConnection('org1', 'plate')).toMatchObject({
      connectorId: 'checkcardetails',
    })
    expect(db.integrationConnection.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { createdAt: 'desc' } })
    )
  })

  it('matches a multi-country registry on the country chosen in its settings', async () => {
    country('+44')
    // Openapi was connected last, but for France: a British plate belongs to Check Car Details.
    vi.mocked(db.integrationConnection.findMany).mockResolvedValue([
      { id: 'conn-openapi', connectorId: 'openapi-automotive', settings: { country: 'FR' } },
      { id: 'conn-ccd', connectorId: 'checkcardetails', settings: {} },
    ] as never)
    expect(await findLookupConnection('org1', 'plate')).toEqual({
      id: 'conn-ccd',
      connectorId: 'checkcardetails',
    })
    // Set to the United Kingdom, the newer Openapi connection wins the tie.
    vi.mocked(db.integrationConnection.findMany).mockResolvedValue([
      { id: 'conn-openapi', connectorId: 'openapi-automotive', settings: { country: 'GB' } },
      { id: 'conn-ccd', connectorId: 'checkcardetails', settings: {} },
    ] as never)
    expect(await findLookupConnection('org1', 'plate')).toEqual({
      id: 'conn-openapi',
      connectorId: 'openapi-automotive',
    })
  })

  it('reads the phone prefix in the forms people type it', () => {
    expect(countriesForDialCode('+44')).toEqual(['GB'])
    expect(countriesForDialCode('0047')).toEqual(['NO'])
    expect(countriesForDialCode('47')).toEqual(['NO'])
    expect(countriesForDialCode('+999')).toEqual([])
    expect(countriesForDialCode(null)).toEqual([])
  })

  it('offers no VIN lookup for plate-only registries', async () => {
    country('+31')
    connected('rdw', 'openapi-automotive')
    expect(await findLookupConnection('org1', 'vin')).toBeNull()
  })
})

describe('isVehicleLookupAvailable', () => {
  it('reports plate and VIN separately', async () => {
    connected('nhtsa')
    const res = await isVehicleLookupAvailable()
    expect(res).toMatchObject({ success: true, data: { plate: false, vin: true } })
  })

  it('offers neither when the plan has no integrations', async () => {
    vi.mocked(getFeatures).mockResolvedValue({ integrations: false } as never)
    connected('nhtsa', 'regcheck')
    const res = await isVehicleLookupAvailable()
    expect(res).toMatchObject({ success: true, data: { plate: false, vin: false } })
  })
})

describe('lookupVehicle by VIN', () => {
  it('asks the decoder with the VIN alone and records nothing on the vehicle', async () => {
    connected('regcheck', 'nhtsa')
    vi.mocked(askRegistry).mockResolvedValue({
      result: { make: 'Honda', model: 'Accord EX', year: 2003, vin: VIN, engineCode: 'J30A4' },
      source: 'NHTSA (USA)',
      connectorId: 'nhtsa',
    })
    const res = await lookupVehicle({ by: 'vin', value: VIN, vehicleId: 'v1' })
    expect(askRegistry).toHaveBeenCalledWith('conn-nhtsa', { vin: VIN })
    expect(res).toMatchObject({
      success: true,
      data: { make: 'Honda', engineCode: 'J30A4', source: 'NHTSA (USA)' },
    })
    // A decoder has no registration to record, and would overwrite the registry's.
    expect(recordRegistryAnswer).not.toHaveBeenCalled()
  })

  it('still records what a registry says when it was asked by the vehicle’s own VIN', async () => {
    country('+47')
    connected('vegvesen')
    vi.mocked(db.vehicle.findFirst).mockResolvedValue({
      id: 'v1',
      licensePlate: 'AB12345',
      vin: VIN.toLowerCase(),
    } as never)
    vi.mocked(askRegistry).mockResolvedValue({
      result: { make: 'Toyota', vin: VIN, inspectionDue: '2027-04-26' },
      source: 'Statens vegvesen',
      connectorId: 'vegvesen',
    })
    await lookupVehicle({ by: 'vin', value: VIN, vehicleId: 'v1' })
    expect(askRegistry).toHaveBeenCalledWith('conn-vegvesen', { vin: VIN })
    expect(recordRegistryAnswer).toHaveBeenCalledTimes(1)
  })

  it('leaves an answer about some other VIN to the save, which checks the VIN kept', async () => {
    country('+47')
    connected('vegvesen')
    vi.mocked(db.vehicle.findFirst).mockResolvedValue({
      id: 'v1',
      licensePlate: 'AB12345',
      vin: 'WVWZZZ1JZXW000001',
    } as never)
    vi.mocked(askRegistry).mockResolvedValue({
      result: { make: 'Toyota', vin: VIN, inspectionDue: '2027-04-26' },
      source: 'Statens vegvesen',
      connectorId: 'vegvesen',
    })
    const res = await lookupVehicle({ by: 'vin', value: VIN, vehicleId: 'v1' })
    expect(res).toMatchObject({ success: true, data: { make: 'Toyota' } })
    expect(recordRegistryAnswer).not.toHaveBeenCalled()
  })

  it('says so when nothing connected decodes VINs', async () => {
    connected('regcheck')
    const res = await lookupVehicle({ by: 'vin', value: VIN })
    expect(res).toMatchObject({ success: false })
    expect(askRegistry).not.toHaveBeenCalled()
  })

  it('refuses an empty VIN before asking anyone', async () => {
    connected('nhtsa')
    const res = await lookupVehicle({ by: 'vin', value: '   ' })
    expect(res).toMatchObject({ success: false })
    expect(askRegistry).not.toHaveBeenCalled()
  })
})
