import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { RegistryQuotaError } from '@/features/integrations/Lib/inspection-sync'
import type { ConnectorContext } from '@/features/integrations/Lib/types'
import {
  connector,
  engineSize,
  type FullRecord,
  fuelType,
  lookupRegistration,
  mapFull,
  mapRegistration,
  merge,
  normalisePlate,
  type RegistrationRecord,
  vehicleClass,
} from '@/integrations/checkcardetails/server'

/**
 * Vehicle Registration answers recorded from the live service on 28 October
 * 2026 with a test key, which answers real DVLA records for plates that
 * contain an A. UK Vehicle Data is the vendor's documented sample: the test
 * account was not given that data point, and the live service refuses it
 * with the 403 recorded below.
 */
const FIXTURES = path.join(__dirname, 'fixtures/checkcardetails')
function fixture<T>(name: string): T {
  return JSON.parse(fs.readFileSync(path.join(FIXTURES, `${name}.json`), 'utf-8'))
}

/** The vendor's refusals, word for word as the live service sent them. */
const NOT_FOUND = { message: 'Vehicle with the provided parameters was not found.' }
const VIN_NOT_FOUND = { message: 'Vehicle with the provided parameters was not found' }
const NOT_AUTHORISED = {
  message:
    'You are not authorised to access this data point. Please request access on https://api.checkcardetails.co.uk/support/premiumdatarequest or contact support. https://api.checkcardetails.co.uk/support',
}
const BAD_KEY = { message: 'The api key is missing or invalid' }
const TEST_KEY_LIMIT = {
  message: "Test API key limitation: Key value for VRM must contain the letter 'A'",
}
const DAILY_LIMIT = {
  message:
    "You have reached your daily limit. Please contact support to increase your account's daily limit. https://api.checkcardetails.co.uk/support",
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

/** A vendor that answers each data point from a table, by the data point named in the path. */
function vendor(answers: Record<string, () => Response>) {
  return async (url: string) => {
    const point = new URL(url).pathname.split('/').pop() as string
    const answer = answers[point]
    if (!answer) throw new Error(`unexpected data point ${point}`)
    return answer()
  }
}

function context(fetchImpl: (url: string) => Promise<Response>, apiKey = 'k3y') {
  const log = vi.fn(async () => undefined)
  const ctx = {
    connection: {
      id: 'c1',
      organizationId: 'org',
      connectorId: 'checkcardetails',
      settings: {},
      state: {},
      externalAccountId: null,
    },
    credentials: { apiKey },
    http: { fetch: vi.fn(fetchImpl), json: vi.fn() },
    links: { get: vi.fn(), set: vi.fn(), remove: vi.fn(), remoteIds: vi.fn() },
    log,
    saveState: vi.fn(),
    timezone: 'Europe/London',
    appUrl: 'https://app.test',
  } as unknown as ConnectorContext
  return { ctx, log, fetch: ctx.http.fetch as ReturnType<typeof vi.fn> }
}

const registration = fixture<RegistrationRecord>('vehicleregistration-EA65AMX')
const full = fixture<FullRecord>('ukvehicledata-sample')

describe('checkcardetails mapping', () => {
  it('reads Vehicle Registration, MOT date included', () => {
    expect(mapRegistration(registration)).toEqual({
      make: 'Audi',
      model: 'A7',
      year: 2015,
      licensePlate: 'EA65AMX',
      color: 'Black',
      fuelType: 'diesel',
      engineSize: '3.0 L',
      vehicleClass: 'Car',
      inspectionDue: '2027-01-26',
    })
  })

  it('reads UK Vehicle Data: VIN, transmission, first registration and weights', () => {
    expect(mapFull(full)).toEqual({
      make: 'Mini',
      model: 'COOPER S AUTO',
      year: 2007,
      vin: 'WMWMF72060TL55555',
      licensePlate: 'SAMPLE',
      color: 'Black',
      fuelType: 'gasoline',
      transmission: 'automatic',
      engineSize: '1.6 L',
      vehicleClass: 'Car',
      firstRegistered: '2007-05-14',
      weights: { kerb: 1155, grossMax: 1605 },
    })
  })

  it('keeps the registration record in front and takes the VIN from the full one', () => {
    const merged = merge(mapRegistration(registration), mapFull(full))
    expect(merged).toMatchObject({
      make: 'Audi',
      licensePlate: 'EA65AMX',
      inspectionDue: '2027-01-26',
      vin: 'WMWMF72060TL55555',
      transmission: 'automatic',
      firstRegistered: '2007-05-14',
    })
  })

  it('marks a scrapped or exported vehicle as no longer registered', () => {
    const scrapped = { VehicleRegistration: { ...full.VehicleRegistration, Scrapped: true } }
    expect(mapFull(scrapped).registered).toBe(false)
    expect(mapFull(full).registered).toBeUndefined()
  })

  it('maps the DVLA fuel words onto the form options', () => {
    expect(fuelType('PETROL')).toBe('gasoline')
    expect(fuelType('DIESEL')).toBe('diesel')
    expect(fuelType('ELECTRICITY')).toBe('electric')
    expect(fuelType('HYBRID ELECTRIC')).toBe('hybrid')
    expect(fuelType('ELECTRIC DIESEL')).toBe('hybrid')
    expect(fuelType('GAS BI-FUEL')).toBeUndefined()
  })

  it('tells motorcycles from cars by type approval', () => {
    expect(vehicleClass('M1')).toBe('Car')
    expect(vehicleClass('L3e')).toBe('Motorcycle')
    expect(vehicleClass('L1e')).toBe('Moped')
    expect(vehicleClass('N1')).toBe('Light goods vehicle')
    expect(vehicleClass('XYZ')).toBe('XYZ')
  })

  it('keeps small engines exact instead of rounding them to zero', () => {
    expect(engineSize(49)).toBe('0.049 L')
    expect(engineSize(125)).toBe('0.125 L')
    expect(engineSize('649')).toBe('0.649 L')
    expect(engineSize(2993)).toBe('3.0 L')
    expect(engineSize(0)).toBeUndefined()
  })

  it('sends plates without spaces', () => {
    expect(normalisePlate('ea65 amx')).toBe('EA65AMX')
  })
})

describe('checkcardetails lookup', () => {
  it('asks both data points with the plate and the key, and merges the answers', async () => {
    const { ctx, fetch } = context(
      vendor({
        vehicleregistration: () => json(registration),
        ukvehicledata: () => json(full),
      })
    )
    const result = await connector.lookupVehicle?.(ctx, { plate: 'ea65 amx' })
    expect(result).toMatchObject({ make: 'Audi', vin: 'WMWMF72060TL55555' })
    const urls = fetch.mock.calls.map(([url]) => new URL(url as string))
    expect(urls.map((u) => u.pathname).sort()).toEqual([
      '/vehicledata/ukvehicledata',
      '/vehicledata/vehicleregistration',
    ])
    for (const u of urls) {
      expect(u.searchParams.get('vrm')).toBe('EA65AMX')
      expect(u.searchParams.get('apikey')).toBe('k3y')
    }
  })

  it('answers from Vehicle Registration alone when UK Vehicle Data is not on the account', async () => {
    const { ctx, log } = context(
      vendor({
        vehicleregistration: () => json(registration),
        ukvehicledata: () => json(NOT_AUTHORISED, 403),
      })
    )
    const result = await connector.lookupVehicle?.(ctx, { plate: 'EA65AMX' })
    expect(result?.make).toBe('Audi')
    expect(result?.vin).toBeUndefined()
    expect(log).toHaveBeenCalledWith('info', 'Vehicle lookup: match', {
      by: 'plate',
      fullData: 'not enabled',
    })
  })

  it('still answers when UK Vehicle Data fails for another reason', async () => {
    const { ctx } = context(
      vendor({
        vehicleregistration: () => json(registration),
        ukvehicledata: () => new Response('Internal Server Error', { status: 500 }),
      })
    )
    expect((await connector.lookupVehicle?.(ctx, { plate: 'EA65AMX' }))?.make).toBe('Audi')
  })

  it('looks up by VIN when there is no plate, and a VIN it does not know is no match', async () => {
    const { ctx, fetch } = context(
      vendor({
        vehicleregistration: () => json(VIN_NOT_FOUND, 400),
        ukvehicledata: () => json(VIN_NOT_FOUND, 400),
      })
    )
    expect(await connector.lookupVehicle?.(ctx, { vin: 'wauzzz4g1fn000000' })).toBeNull()
    const u = new URL(fetch.mock.calls[0][0] as string)
    expect(u.searchParams.get('vin')).toBe('WAUZZZ4G1FN000000')
    expect(u.searchParams.get('vrm')).toBeNull()
  })

  it('reports a plate the register does not know as no match', async () => {
    const { ctx } = context(
      vendor({
        vehicleregistration: () => json(NOT_FOUND, 404),
        ukvehicledata: () => json(NOT_AUTHORISED, 403),
      })
    )
    expect(await connector.lookupVehicle?.(ctx, { plate: 'AA00AAA' })).toBeNull()
  })

  it('says what a test key cannot do', async () => {
    const { ctx } = context(
      vendor({
        vehicleregistration: () => json(TEST_KEY_LIMIT, 400),
        ukvehicledata: () => json(NOT_AUTHORISED, 403),
      })
    )
    await expect(connector.lookupVehicle?.(ctx, { plate: 'BN12XYZ' })).rejects.toThrow(
      /test key only looks up plates and VINs that contain the letter A/
    )
  })

  it('says when the key is wrong and when the daily limit is reached', async () => {
    const bad = context(
      vendor({
        vehicleregistration: () => json(BAD_KEY, 403),
        ukvehicledata: () => json(BAD_KEY, 403),
      })
    )
    await expect(connector.lookupVehicle?.(bad.ctx, { plate: 'EA65AMX' })).rejects.toThrow(
      'Check Car Details rejected the API key'
    )
    const limited = context(
      vendor({
        vehicleregistration: () => json(DAILY_LIMIT, 403),
        ukvehicledata: () => json(NOT_AUTHORISED, 403),
      })
    )
    // A typed error, so the MOT sync stops instead of marking the rest checked.
    await expect(connector.lookupVehicle?.(limited.ctx, { plate: 'EA65AMX' })).rejects.toThrow(
      RegistryQuotaError
    )
  })

  it('never writes the plate or the key into the log', async () => {
    const { ctx, log } = context(
      vendor({
        vehicleregistration: () => json(registration),
        ukvehicledata: () => json(NOT_AUTHORISED, 403),
      })
    )
    await connector.lookupVehicle?.(ctx, { plate: 'EA65AMX' })
    expect(JSON.stringify(log.mock.calls)).not.toMatch(/EA65AMX|k3y/)
  })
})

describe('checkcardetails MOT sync', () => {
  it('asks Vehicle Registration only, which is all the MOT date needs', async () => {
    const { ctx, fetch } = context(vendor({ vehicleregistration: () => json(registration) }))
    const result = await lookupRegistration(ctx, { plate: 'EA65AMX' })
    expect(result?.inspectionDue).toBe('2027-01-26')
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(new URL(fetch.mock.calls[0][0] as string).pathname).toBe(
      '/vehicledata/vehicleregistration'
    )
  })

  it('offers the MOT sync as an inspection connector', () => {
    expect(connector.manifest.capabilities).toContain('vehicle.inspection')
    expect(Object.keys(connector.jobs)).toHaveLength(1)
  })
})

describe('checkcardetails connection test', () => {
  it('proves a key on a plate that was never issued, free of charge', async () => {
    const { ctx, fetch } = context(vendor({ vehicleregistration: () => json(NOT_FOUND, 404) }))
    expect(await connector.test(ctx)).toEqual({ ok: true })
    const u = new URL(fetch.mock.calls[0][0] as string)
    expect(u.pathname).toBe('/vehicledata/vehicleregistration')
    expect(u.searchParams.get('vrm')).toBe('AA00AAA')
  })

  it('refuses a bad key and an empty one', async () => {
    const bad = context(vendor({ vehicleregistration: () => json(BAD_KEY, 403) }))
    expect(await connector.test(bad.ctx)).toEqual({
      ok: false,
      message: 'Check Car Details rejected the API key',
    })
    const empty = context(vendor({}), '')
    expect(await connector.test(empty.ctx)).toEqual({
      ok: false,
      message: 'Check Car Details: an API key is required',
    })
  })
})
