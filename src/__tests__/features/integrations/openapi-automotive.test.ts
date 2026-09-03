import { describe, expect, it, vi } from 'vitest'
import type { ConnectorContext } from '@/features/integrations/Lib/types'
import {
  type AutomotiveRecord,
  connector,
  engineSize,
  fuelType,
  isoDate,
  mapRecord,
  normalisePlate,
  transmission,
} from '@/integrations/openapi-automotive/server'

/**
 * Records shaped the way each country's endpoint answers, taken from the
 * vendor's published examples. The shapes are the contract: France hides
 * the capacity and VIN in ExtendedData, Spain misspells its VIN field, the
 * United Kingdom is the only one that names the gearbox and engine code.
 */
const FRANCE: AutomotiveRecord = {
  LicensePlate: 'GQ478ZV',
  Description: 'PEUGEOT 207',
  RegistrationYear: '2008',
  CarMake: 'PEUGEOT',
  CarModel: '207',
  EngineSize: '7',
  FuelType: 'ESSENCE',
  MakeDescription: 'PEUGEOT',
  ModelDescription: '207',
  BodyStyle: 'BERLINE',
  RegistrationDate: '2008-10-22',
  ExtendedData: {
    EngineCC: '1598',
    boiteDeVitesse: 'MECANIQUE',
    numSerieMoteur: 'VF3WA5FWF34246147',
    datePremiereMiseCirculation: '22102008',
    genre: 'VP',
  },
}

const UNITED_KINGDOM: AutomotiveRecord = {
  LicensePlate: 'LT17MLE',
  RegistrationYear: '2017',
  CarMake: 'Maserati',
  CarModel: 'Levante D V6 Auto',
  BodyStyle: 'SUV',
  EngineSize: '2987',
  Transmission: 'Automatic',
  FuelType: 'Diesel',
  VehicleIdentificationNumber: 'ZN6TU61C00X248858',
  EngineCode: 'B630WM',
  Colour: 'Black',
}

const SPAIN: AutomotiveRecord = {
  LicensePlate: '5776CNS',
  CarMake: 'AUDI',
  CarModel: 'A3',
  EngineSize: '1595',
  VechileIdentificationNumber: 'WAUZZZ8P0XA123456',
  RegistrationYear: '2003',
  RegistrationDate: '17/11/2003',
  Fuel: 'Gasolina',
}

const PORTUGAL: AutomotiveRecord = {
  LicensePlate: 'AA-00-AA',
  RegistrationYear: '2025',
  CarMake: 'VOLKSWAGEN',
  CarModel: 'ID.4',
  EngineSize: '0',
  FuelType: 'E',
  GrossWeight: '2660',
  NetWeight: '2124',
  RegistrationDate: '01/4/2025',
}

function envelope(data: unknown, status = 200, headers?: Record<string, string>) {
  return Response.json({ data, success: true, message: '', error: null }, { status, headers })
}

function context(
  fetchImpl: (url: string, init?: RequestInit) => Promise<Response>,
  settings: Record<string, unknown> = { country: 'FR' }
) {
  const log = vi.fn(async () => undefined)
  const ctx = {
    connection: {
      id: 'c1',
      organizationId: 'org',
      connectorId: 'openapi-automotive',
      settings,
      state: {},
      externalAccountId: null,
    },
    credentials: { token: 'secret-token' },
    http: { fetch: vi.fn(fetchImpl), json: vi.fn() },
    links: { get: vi.fn(), set: vi.fn(), remove: vi.fn(), remoteIds: vi.fn() },
    log,
    saveState: vi.fn(),
    timezone: 'Europe/Paris',
    appUrl: 'https://app.test',
  } as unknown as ConnectorContext
  return { ctx, log, fetch: ctx.http.fetch as ReturnType<typeof vi.fn> }
}

describe('openapi automotive mapper', () => {
  it('reads a French record, capacity and VIN from the SIV extension', () => {
    expect(mapRecord(FRANCE)).toEqual({
      make: 'Peugeot',
      model: '207',
      year: 2008,
      vin: 'VF3WA5FWF34246147',
      licensePlate: 'GQ478ZV',
      fuelType: 'gasoline',
      transmission: 'manual',
      engineSize: '1.6 L',
      vehicleClass: 'BERLINE',
      firstRegistered: '2008-10-22',
    })
  })

  it('reads a British record with gearbox, engine code and colour', () => {
    expect(mapRecord(UNITED_KINGDOM)).toEqual({
      make: 'Maserati',
      model: 'Levante D V6 Auto',
      year: 2017,
      vin: 'ZN6TU61C00X248858',
      licensePlate: 'LT17MLE',
      color: 'Black',
      fuelType: 'diesel',
      transmission: 'automatic',
      engineSize: '3.0 L',
      engineCode: 'B630WM',
      vehicleClass: 'SUV',
    })
  })

  it('reads a Spanish record with its day-first date and misspelt VIN field', () => {
    expect(mapRecord(SPAIN)).toMatchObject({
      make: 'Audi',
      model: 'A3',
      year: 2003,
      vin: 'WAUZZZ8P0XA123456',
      fuelType: 'gasoline',
      engineSize: '1.6 L',
      firstRegistered: '2003-11-17',
    })
  })

  it('reads a Portuguese electric car with weights and no engine size', () => {
    const result = mapRecord(PORTUGAL)
    expect(result).toMatchObject({
      make: 'Volkswagen',
      model: 'ID.4',
      year: 2025,
      fuelType: 'electric',
      firstRegistered: '2025-04-01',
      weights: { kerb: 2124, grossMax: 2660 },
    })
    expect(result.engineSize).toBeUndefined()
    expect(result.vin).toBeUndefined()
  })

  it('leaves out what the registry did not say, keeping the plate asked for', () => {
    expect(mapRecord({})).toEqual({})
    expect(mapRecord({}, 'AB123CD')).toEqual({ licensePlate: 'AB123CD' })
  })

  it('names fuels in five languages and calls two fuels a hybrid', () => {
    expect(fuelType('ESSENCE')).toBe('gasoline')
    expect(fuelType('Benzina')).toBe('gasoline')
    expect(fuelType('Petrol')).toBe('gasoline')
    expect(fuelType('Gasóleo')).toBe('diesel')
    expect(fuelType('Elettrica')).toBe('electric')
    expect(fuelType('Hybrid Electric')).toBe('hybrid')
    expect(fuelType('Petrol/Electric')).toBe('hybrid')
    expect(fuelType('Híbrido enchufable')).toBe('hybrid')
    expect(fuelType('GPL')).toBeUndefined()
    expect(fuelType('')).toBeUndefined()
  })

  it('normalises gearboxes, capacities and dates', () => {
    expect(transmission('AUTOMATIQUE')).toBe('automatic')
    expect(transmission('Manuale')).toBe('manual')
    expect(transmission('CVT')).toBe('cvt')
    expect(transmission('')).toBeUndefined()
    expect(engineSize('1598')).toBe('1.6 L')
    expect(engineSize(1281)).toBe('1.3 L')
    // French fiscal horsepower lives in EngineSize and is not a capacity.
    expect(engineSize('7')).toBeUndefined()
    expect(engineSize('0')).toBeUndefined()
    expect(isoDate('2008-10-22')).toBe('2008-10-22')
    expect(isoDate('17/11/2003')).toBe('2003-11-17')
    expect(isoDate('1/4/2025')).toBe('2025-04-01')
    expect(isoDate('22102008')).toBe('2008-10-22')
    expect(isoDate('yesterday')).toBeUndefined()
  })

  it('normalises plates the way each country prints them', () => {
    expect(normalisePlate('ab-123-cd')).toBe('AB123CD')
    expect(normalisePlate('90-27-QL')).toBe('9027QL')
    expect(normalisePlate('LT17 MLE')).toBe('LT17MLE')
    expect(normalisePlate(' 5776 cns ')).toBe('5776CNS')
  })
})

describe('openapi automotive connector', () => {
  it('asks the country endpoint with a Bearer token and maps a match', async () => {
    const { ctx, fetch, log } = context(async () => envelope(FRANCE))
    const result = await connector.lookupVehicle?.(ctx, { plate: 'gq-478-zv' })
    expect(result?.make).toBe('Peugeot')
    const [url, init] = fetch.mock.calls[0]
    expect(url).toBe('https://automotive.openapi.com/FR-car/GQ478ZV')
    expect((init as RequestInit).headers).toMatchObject({
      Authorization: 'Bearer secret-token',
    })
    // The plate is personal data and must not land in the connection log.
    for (const call of log.mock.calls) expect(JSON.stringify(call)).not.toContain('GQ478ZV')
  })

  it('picks the endpoint from the country setting', async () => {
    const { ctx, fetch } = context(async () => envelope(UNITED_KINGDOM), { country: 'GB' })
    await connector.lookupVehicle?.(ctx, { plate: 'LT17 MLE' })
    expect(fetch.mock.calls[0][0]).toBe('https://automotive.openapi.com/UK-car/LT17MLE')
  })

  it('refuses to guess when no country is set', async () => {
    const { ctx, fetch } = context(async () => envelope(FRANCE), {})
    await expect(connector.lookupVehicle?.(ctx, { plate: 'GQ478ZV' })).rejects.toThrow(
      /choose a country/
    )
    expect(fetch).not.toHaveBeenCalled()
  })

  it('finds nothing for a VIN alone and spends no lookup on it', async () => {
    const { ctx, fetch } = context(async () => envelope(FRANCE))
    expect(await connector.lookupVehicle?.(ctx, { vin: 'VF3WA5FWF34246147' })).toBeNull()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('returns null on 404 and on an empty answer', async () => {
    const notFound = context(async () =>
      Response.json({ data: [], success: true, message: 'car not found' }, { status: 404 })
    )
    expect(await connector.lookupVehicle?.(notFound.ctx, { plate: 'GQ478ZV' })).toBeNull()
    const empty = context(async () => envelope([]))
    expect(await connector.lookupVehicle?.(empty.ctx, { plate: 'GQ478ZV' })).toBeNull()
  })

  it('tries the motorcycle endpoint after a miss only when asked to', async () => {
    const bike: AutomotiveRecord = { CarMake: 'BMW', CarModel: 'R 1200', FuelType: 'ESSENCE' }
    const answer = async (url: string) =>
      url.includes('FR-bike')
        ? envelope(bike)
        : Response.json({ data: [], success: true, message: 'car not found' }, { status: 404 })
    const on = context(answer, { country: 'FR', bikes: true })
    const found = await connector.lookupVehicle?.(on.ctx, { plate: 'DJ455BR' })
    expect(found?.model).toBe('R 1200')
    expect(on.fetch.mock.calls.map((c) => c[0])).toEqual([
      'https://automotive.openapi.com/FR-car/DJ455BR',
      'https://automotive.openapi.com/FR-bike/DJ455BR',
    ])
    const off = context(answer, { country: 'FR' })
    expect(await connector.lookupVehicle?.(off.ctx, { plate: 'DJ455BR' })).toBeNull()
    expect(off.fetch).toHaveBeenCalledTimes(1)
    // Portugal has no motorcycle endpoint, so the setting changes nothing there.
    const pt = context(answer, { country: 'PT', bikes: true })
    expect(await connector.lookupVehicle?.(pt.ctx, { plate: '9027QL' })).toBeNull()
    expect(pt.fetch).toHaveBeenCalledTimes(1)
  })

  it('polls the status endpoint while the vendor is still fetching', async () => {
    const pending = { state: 'PENDING', id: '66a8ed9b82cf2ae627012068' }
    let polls = 0
    const { ctx, fetch } = context(async (url) => {
      if (url.includes('check_id')) {
        polls += 1
        return polls < 2 ? envelope(pending, 200, { 'Retry-After': '0' }) : envelope(UNITED_KINGDOM)
      }
      return envelope(pending, 302, { 'Retry-After': '0' })
    })
    ctx.connection.settings = { country: 'GB' }
    const result = await connector.lookupVehicle?.(ctx, { plate: 'LT17MLE' })
    expect(result?.make).toBe('Maserati')
    expect(fetch.mock.calls.map((c) => c[0])).toEqual([
      'https://automotive.openapi.com/UK-car/LT17MLE',
      'https://automotive.openapi.com/check_id/66a8ed9b82cf2ae627012068',
      'https://automotive.openapi.com/check_id/66a8ed9b82cf2ae627012068',
    ])
  })

  it('gives up on a lookup that stays pending', async () => {
    const pending = { state: 'PENDING', id: 'abc' }
    const { ctx, fetch } = context(async () => envelope(pending, 200, { 'Retry-After': '0' }))
    await expect(connector.lookupVehicle?.(ctx, { plate: 'GQ478ZV' })).rejects.toThrow(
      /still fetching/
    )
    expect(fetch.mock.calls.length).toBe(6)
  })

  it('explains a rejected token, an empty wallet and a bad plate format', async () => {
    const denied = context(async () => Response.json({ success: false }, { status: 401 }))
    await expect(connector.lookupVehicle?.(denied.ctx, { plate: 'GQ478ZV' })).rejects.toThrow(
      /rejected the token/
    )
    const broke = context(async () => Response.json({ success: false }, { status: 402 }))
    await expect(connector.lookupVehicle?.(broke.ctx, { plate: 'GQ478ZV' })).rejects.toThrow(
      /no credit/
    )
    const format = context(async () => Response.json({ success: false }, { status: 406 }))
    await expect(connector.lookupVehicle?.(format.ctx, { plate: 'GQ478ZV' })).rejects.toThrow(
      /not a valid plate/
    )
  })

  it('proves a token against the status endpoint without buying a lookup', async () => {
    const good = context(async () =>
      Response.json({ success: false, message: 'id not valid', error: 801 }, { status: 406 })
    )
    expect(await connector.test(good.ctx)).toEqual({ ok: true })
    expect(good.fetch.mock.calls[0][0]).toBe(
      'https://automotive.openapi.com/check_id/000000000000000000000000'
    )
    const bad = context(async () => Response.json({ success: false }, { status: 401 }))
    expect((await connector.test(bad.ctx)).ok).toBe(false)
    const noToken = context(async () => envelope({}))
    noToken.ctx.credentials = {}
    expect((await connector.test(noToken.ctx)).ok).toBe(false)
    expect(noToken.fetch).not.toHaveBeenCalled()
    const noCountry = context(async () => envelope({}), {})
    expect((await connector.test(noCountry.ctx)).message).toMatch(/country/)
    expect(noCountry.fetch).not.toHaveBeenCalled()
  })
})
