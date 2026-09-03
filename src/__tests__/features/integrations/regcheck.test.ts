import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import type { ConnectorContext } from '@/features/integrations/Lib/types'
import {
  type RegCheckVehicle,
  connector,
  engineSize,
  fuelType,
  isoDate,
  mapVehicle,
  normalisePlate,
  vehicleJsonOf,
} from '@/integrations/regcheck/server'

/**
 * Answers recorded from the live service on 3 September 2026 using the
 * vendor's free test plate for every country and Australian state offered,
 * plus one envelope from a real UK lookup. Each country fills a different
 * subset of a shared shape, wraps some values in CurrentTextValue and not
 * others, and the documentation lags the wire in places (the VIN spelling,
 * New South Wales' nested engine capacity). These are the shapes the mapper
 * has to keep reading.
 */
const FIXTURES = path.join(__dirname, 'fixtures/regcheck')
function fixture(name: string): RegCheckVehicle {
  return JSON.parse(fs.readFileSync(path.join(FIXTURES, `${name}.json`), 'utf-8'))
}
function envelope(name: string): string {
  return fs.readFileSync(path.join(FIXTURES, `${name}.xml`), 'utf-8')
}

function context(
  fetchImpl: (url: string, init?: RequestInit) => Promise<Response>,
  settings: Record<string, unknown> = { country: 'IE' },
  credentials: Record<string, unknown> = { username: 'workshop' }
) {
  const log = vi.fn(async () => undefined)
  const ctx = {
    connection: {
      id: 'c1',
      organizationId: 'org',
      connectorId: 'regcheck',
      settings,
      state: {},
      externalAccountId: null,
    },
    credentials,
    http: { fetch: vi.fn(fetchImpl), json: vi.fn() },
    links: { get: vi.fn(), set: vi.fn(), remove: vi.fn(), remoteIds: vi.fn() },
    log,
    saveState: vi.fn(),
    timezone: 'Europe/Dublin',
    appUrl: 'https://app.test',
  } as unknown as ConnectorContext
  return { ctx, log, fetch: ctx.http.fetch as ReturnType<typeof vi.fn> }
}

describe('regcheck mapper, Australia state by state', () => {
  it('NSW: engine capacity nested under extended, NEVDIS code is not a VIN', () => {
    expect(mapVehicle(fixture('AU-NSW'), 'BEW76P')).toEqual({
      make: 'Ford',
      model: 'Fiesta 5D Hatchback',
      year: 2007,
      licensePlate: 'BEW76P',
      transmission: 'manual',
      engineSize: '1.6 L',
      vehicleClass: 'Lx 5-Speed Manual',
    })
  })

  it('WA: the flat capacity the documentation shows', () => {
    expect(mapVehicle(fixture('AU-WA'))).toMatchObject({
      make: 'Mazda',
      model: 'Mazda6 4D Sedan',
      year: 2008,
      transmission: 'manual',
      engineSize: '2.5 L',
    })
    expect(mapVehicle(fixture('AU-WA')).vin).toBeUndefined()
  })

  it('TAS: fuel bare, capacity in the Engine field, engine code', () => {
    expect(mapVehicle(fixture('AU-TAS'))).toEqual({
      make: 'VW',
      model: 'AMAROK',
      year: 2011,
      vin: 'WV1ZZZ2HZEA044303',
      fuelType: 'diesel',
      engineSize: '2.0 L',
      engineCode: 'CNEA|CSHA',
      vehicleClass: 'Ute',
    })
  })

  it('VIC and QLD: VIN and little else, an engine number is not a capacity', () => {
    expect(mapVehicle(fixture('AU-VIC'))).toEqual({
      make: 'Toyota',
      model: 'Hiace',
      year: 2014,
      vin: 'JTFHT02P700145015',
      color: 'White',
    })
    expect(mapVehicle(fixture('AU-QLD'))).toEqual({
      make: 'Hyundai',
      model: 'ACCENT HATCHBACK',
      year: 2011,
      vin: 'KMHCT51DLCU021130',
    })
  })

  it('SA and ACT: empty strings are left out, a net weight is a kerb weight', () => {
    expect(mapVehicle(fixture('AU-SA'))).toEqual({
      make: 'Mitsubishi',
      color: 'White',
      vehicleClass: 'STATION WAGON',
    })
    expect(mapVehicle(fixture('AU-ACT'))).toEqual({
      make: 'Ford',
      model: 'ED FALCON',
      year: 1994,
      color: 'Maroon',
      weights: { kerb: 1514, grossMax: undefined },
    })
  })

  it('NT: the inspection date comes as epoch milliseconds', () => {
    expect(mapVehicle(fixture('AU-NT'))).toEqual({
      make: 'Toyota',
      model: 'FJCRUISER',
      year: 2012,
      color: 'Black',
      inspectionDue: '2017-04-30',
    })
  })
})

describe('regcheck mapper, other countries', () => {
  it('New Zealand: engine size as a number', () => {
    expect(mapVehicle(fixture('NZ'))).toEqual({
      make: 'Toyota',
      model: 'Mark X',
      year: 2008,
      vin: '7AT0H64TX13059294',
      fuelType: 'gasoline',
      engineSize: '2.5 L',
      vehicleClass: 'SEDAN',
    })
  })

  it('United States: engine described in litres', () => {
    expect(mapVehicle(fixture('US'))).toEqual({
      make: 'Kia',
      model: 'Rio Base / LX / SX',
      year: 2009,
      vin: 'KNADE223696445551',
      engineSize: '1.6 L',
      vehicleClass: 'Sedan 4D',
    })
  })

  it('Ireland: VIN under VIN, an empty gearbox is no gearbox', () => {
    expect(mapVehicle(fixture('IE'))).toEqual({
      make: 'Audi',
      model: 'A6',
      year: 2004,
      vin: 'WAUZZZ4BX4N093080',
      fuelType: 'diesel',
      engineSize: '1.9 L',
      vehicleClass: 'SALOON',
    })
  })

  it('Sweden: "1798 cm", Bensin, Manuell, and a bare year that is not a date', () => {
    expect(mapVehicle(fixture('SE'))).toEqual({
      make: 'Ford',
      model: 'Focus 1.8',
      year: 2006,
      vin: 'WF05XXGCD56B24845',
      color: 'Grön',
      fuelType: 'gasoline',
      transmission: 'manual',
      engineSize: '1.8 L',
      vehicleClass: 'Halvkombi',
    })
  })

  it('Denmark: registration, weights and last inspection from the Motorregister block', () => {
    expect(mapVehicle(fixture('DK'))).toEqual({
      make: 'Ferrari',
      model: '348',
      year: 1993,
      vin: 'ZFFKA36B000096243',
      fuelType: 'gasoline',
      engineSize: '3.4 L',
      firstRegistered: '1993-05-03',
      lastInspected: '2025-04-10',
      weights: { kerb: 1440, grossMax: 1680 },
    })
  })

  it('Finland: Automaattinen, engine code, day-first registration date', () => {
    expect(mapVehicle(fixture('FI'))).toEqual({
      make: 'Volkswagen',
      model: 'GOLF',
      year: 2010,
      vin: 'WVWZZZ1KZBW072586',
      fuelType: 'diesel',
      transmission: 'automatic',
      engineSize: '1.6 L',
      engineCode: 'CAYC',
      vehicleClass: 'Car',
      firstRegistered: '2010-09-21',
      weights: { kerb: 1340, grossMax: undefined },
    })
  })

  it('Estonia, Slovakia, Croatia: make, model, VIN and not much more', () => {
    expect(mapVehicle(fixture('EE'))).toEqual({
      make: 'Ford',
      model: 'GALAXY',
      year: 2011,
      vin: 'WF0MXXGBWMAG34779',
      weights: { kerb: undefined, grossMax: 2400 },
    })
    expect(mapVehicle(fixture('SK'))).toEqual({
      make: 'Škoda',
      model: 'OCTAVIA',
      year: 2010,
      vin: 'TMBCK11U4Y2370804',
      color: 'Modrá',
      engineSize: '1.6 L',
    })
    expect(mapVehicle(fixture('HR'))).toEqual({
      make: 'BMW',
      model: 'SERIJA 3, 316I',
      vin: 'WBAAY31080KP02047',
    })
  })

  it('Czechia: fuel as the letter D, bare fields, a weight range that is not a weight', () => {
    expect(mapVehicle(fixture('CZ'))).toEqual({
      make: 'Škoda',
      model: 'OCTAVIA',
      year: 2005,
      vin: 'TMBCS21Z262149586',
      fuelType: 'diesel',
      engineSize: '1.9 L',
      vehicleClass: 'sedan/limuzína',
      firstRegistered: '2005-10-04',
      weights: { kerb: undefined, grossMax: 1970 },
    })
  })

  it('Hungary: lower-case benzin and a dotted date', () => {
    expect(mapVehicle(fixture('HU'))).toEqual({
      make: 'Suzuki',
      model: 'GS500',
      year: 2006,
      vin: 'VTTBK232100104138',
      fuelType: 'gasoline',
      engineSize: '0.5 L',
      firstRegistered: '2006-11-23',
      weights: { kerb: 380, grossMax: 380 },
    })
  })

  it('reads the JSON out of the XML envelope, with the VIN spelt as on the wire', () => {
    const record = vehicleJsonOf(envelope('UK-live'))
    expect(record?.VehicleIdentificationNumber).toBe('VF33CKFUC84922414')
    expect(mapVehicle(record as RegCheckVehicle, 'AB07CDE')).toEqual({
      make: 'Peugeot',
      model: '307 X-LINE',
      year: 2007,
      vin: 'VF33CKFUC84922414',
      licensePlate: 'AB07CDE',
      color: 'Silver',
      fuelType: 'gasoline',
      engineSize: '1.4 L',
      vehicleClass: 'Motorbike',
    })
    expect(vehicleJsonOf(envelope('AU-NSW'))?.State).toBe('NSW')
    expect(vehicleJsonOf('<Vehicle><vehicleJson></vehicleJson></Vehicle>')).toBeNull()
    expect(vehicleJsonOf('<Vehicle />')).toBeNull()
  })

  it('normalises the words and forms the wire uses', () => {
    expect(fuelType('PETROL')).toBe('gasoline')
    expect(fuelType('Bensin')).toBe('gasoline')
    expect(fuelType('benzin')).toBe('gasoline')
    expect(fuelType('DIESEL')).toBe('diesel')
    expect(fuelType('D')).toBe('diesel')
    expect(fuelType('Petrol/Electric')).toBe('hybrid')
    expect(fuelType('LPG')).toBeUndefined()
    expect(engineSize('1798 cm')).toBe('1.8 L')
    expect(engineSize('3405.0')).toBe('3.4 L')
    expect(engineSize('1.6L I4 MPI')).toBe('1.6 L')
    expect(engineSize('2.5', 'L')).toBe('2.5 L')
    expect(engineSize('')).toBeUndefined()
    expect(isoDate('21/09/2010')).toBe('2010-09-21')
    expect(isoDate('2006.11.23')).toBe('2006-11-23')
    expect(isoDate('1993-05-03+02:00')).toBe('1993-05-03')
    expect(isoDate('2006')).toBeUndefined()
    expect(normalisePlate('bew 76p')).toBe('BEW76P')
    expect(normalisePlate('LZF-630')).toBe('LZF630')
  })
})

describe('regcheck connector', () => {
  it('asks the country operation with the username, and the state for Australia', async () => {
    const { ctx, fetch, log } = context(
      async () => new Response(envelope('AU-NSW'), { status: 200 }),
      { country: 'AU', auState: 'NSW' }
    )
    const result = await connector.lookupVehicle?.(ctx, { plate: 'bew 76p' })
    expect(result?.make).toBe('Ford')
    expect(fetch.mock.calls[0][0]).toBe(
      'https://www.regcheck.org.uk/api/reg.asmx/CheckAustralia?RegistrationNumber=BEW76P&State=NSW&username=workshop'
    )
    // The plate is personal data and must not land in the connection log.
    for (const call of log.mock.calls) expect(JSON.stringify(call)).not.toContain('BEW76P')
  })

  it('leaves the state out for countries that do not have one', async () => {
    const { ctx, fetch } = context(async () => new Response(envelope('UK-live'), { status: 200 }), {
      country: 'IE',
    })
    await connector.lookupVehicle?.(ctx, { plate: '04MH8917' })
    expect(fetch.mock.calls[0][0]).toBe(
      'https://www.regcheck.org.uk/api/reg.asmx/CheckIreland?RegistrationNumber=04MH8917&username=workshop'
    )
  })

  it('refuses to guess a country, a state or a username', async () => {
    const answer = async () => new Response(envelope('UK-live'), { status: 200 })
    await expect(
      connector.lookupVehicle?.(context(answer, {}).ctx, { plate: 'X' })
    ).rejects.toThrow(/choose a country/)
    await expect(
      connector.lookupVehicle?.(context(answer, { country: 'AU' }).ctx, { plate: 'X' })
    ).rejects.toThrow(/choose the state/)
    await expect(
      connector.lookupVehicle?.(context(answer, { country: 'US', usState: 'Texas' }).ctx, {
        plate: 'X',
      })
    ).rejects.toThrow(/choose the state/)
    await expect(
      connector.lookupVehicle?.(context(answer, { country: 'IE' }, {}).ctx, { plate: 'X' })
    ).rejects.toThrow(/username is required/)
  })

  it('treats the vendor\'s "Lookup failed" as no vehicle, and a bad username as an error', async () => {
    const missing = context(async () => new Response('UK Lookup failed\n', { status: 500 }))
    expect(await connector.lookupVehicle?.(missing.ctx, { plate: 'ZZ99ZZZ' })).toBeNull()
    const denied = context(async () => new Response('Your username is incorrect', { status: 500 }))
    await expect(connector.lookupVehicle?.(denied.ctx, { plate: 'ZZ99ZZZ' })).rejects.toThrow(
      /rejected the username/
    )
    const other = context(async () => new Response('Service unavailable', { status: 503 }))
    await expect(connector.lookupVehicle?.(other.ctx, { plate: 'ZZ99ZZZ' })).rejects.toThrow(
      /RegCheck: Service unavailable/
    )
  })

  it('finds nothing for a VIN alone and spends no credit on it', async () => {
    const { ctx, fetch } = context(async () => new Response(envelope('UK-live')))
    expect(await connector.lookupVehicle?.(ctx, { vin: 'VF33CKFUC84922414' })).toBeNull()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('tests with the free credit balance, which is 0 for unknown users and empty accounts alike', async () => {
    const funded = context(async () => new Response('10'))
    expect(await connector.test(funded.ctx)).toEqual({ ok: true })
    expect(funded.fetch.mock.calls[0][0]).toBe(
      'https://www.regcheck.org.uk/ajax/getcredits.aspx?username=workshop'
    )
    const empty = context(async () => new Response('0'))
    expect((await connector.test(empty.ctx)).message).toMatch(
      /unknown or its account has no credits/
    )
    const noState = context(async () => new Response('10'), { country: 'AU' })
    expect((await connector.test(noState.ctx)).ok).toBe(false)
    expect(noState.fetch).not.toHaveBeenCalled()
  })
})
