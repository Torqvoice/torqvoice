import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import type { ConnectorContext } from '@/features/integrations/Lib/types'
import {
  type RdwFuel,
  type RdwVehicle,
  connector,
  fuelType,
  isoDate,
  mapVehicle,
  normalisePlate,
} from '@/integrations/rdw/server'

/**
 * Rows recorded from opendata.rdw.nl on 3 September 2026: a Toyota Prius+
 * (petrol and electric, NOVC-HEV) and a Volkswagen Polo (petrol). The
 * vocabulary the mapper reads (fuel names, hybrid classes, export flags,
 * the colours that mean "none") was taken from the datasets' own value
 * counts the same day, not assumed.
 */
const FIXTURES = path.join(__dirname, 'fixtures/rdw')
function fixture<T>(name: string): T[] {
  return JSON.parse(fs.readFileSync(path.join(FIXTURES, `${name}.json`), 'utf-8')) as T[]
}
const PRIUS = fixture<RdwVehicle>('SK209X-main')[0]
const PRIUS_FUELS = fixture<RdwFuel>('SK209X-fuel')
const POLO = fixture<RdwVehicle>('G317PG-main')[0]
const POLO_FUELS = fixture<RdwFuel>('G317PG-fuel')

function context(
  fetchImpl: (url: string, init?: RequestInit) => Promise<Response>,
  credentials: Record<string, unknown> = {}
) {
  const log = vi.fn(async () => undefined)
  const ctx = {
    connection: {
      id: 'c1',
      organizationId: 'org',
      connectorId: 'rdw',
      settings: {},
      state: {},
      externalAccountId: null,
    },
    credentials,
    http: { fetch: vi.fn(fetchImpl), json: vi.fn() },
    links: { get: vi.fn(), set: vi.fn(), remove: vi.fn(), remoteIds: vi.fn() },
    log,
    saveState: vi.fn(),
    timezone: 'Europe/Amsterdam',
    appUrl: 'https://app.test',
  } as unknown as ConnectorContext
  return { ctx, log, fetch: ctx.http.fetch as ReturnType<typeof vi.fn> }
}

/** Answers the vehicle and fuel datasets from the fixtures, by plate in the query string. */
function datasets(url: string): Promise<Response> {
  const u = new URL(url)
  const plate = u.searchParams.get('kenteken')
  const fuel = u.pathname.includes('8ys7-d773')
  if (plate === 'SK209X') return Promise.resolve(Response.json(fuel ? PRIUS_FUELS : [PRIUS]))
  if (plate === 'G317PG') return Promise.resolve(Response.json(fuel ? POLO_FUELS : [POLO]))
  return Promise.resolve(Response.json([]))
}

describe('rdw mapper', () => {
  it('reads a hybrid from its electric and petrol rows, with the APK date', () => {
    expect(mapVehicle(PRIUS, PRIUS_FUELS)).toEqual({
      make: 'Toyota',
      model: 'PRIUS PLUS',
      year: 2018,
      licensePlate: 'SK209X',
      color: 'Zwart',
      fuelType: 'hybrid',
      engineSize: '1.8 L',
      vehicleClass: 'Personenauto',
      firstRegistered: '2018-04-26',
      inspectionDue: '2027-04-26',
      weights: { kerb: 1475, grossMax: 2115 },
      registered: true,
    })
  })

  it('reads a petrol car and keeps the trade name when it does not repeat the make', () => {
    expect(mapVehicle(POLO, POLO_FUELS)).toEqual({
      make: 'Volkswagen',
      model: 'POLO',
      year: 2010,
      licensePlate: 'G317PG',
      color: 'Zwart',
      fuelType: 'gasoline',
      engineSize: '1.2 L',
      vehicleClass: 'Personenauto',
      firstRegistered: '2010-05-06',
      inspectionDue: '2027-09-30',
      weights: { kerb: 988, grossMax: 1570 },
      registered: true,
    })
  })

  it('names every fuel the dataset uses', () => {
    const rows = (...names: string[]) => names.map((n) => ({ brandstof_omschrijving: n }))
    expect(fuelType(rows('Benzine'))).toBe('gasoline')
    expect(fuelType(rows('Alcohol'))).toBe('gasoline')
    expect(fuelType(rows('Diesel'))).toBe('diesel')
    expect(fuelType(rows('Elektriciteit'))).toBe('electric')
    expect(fuelType(rows('Elektriciteit', 'Benzine'))).toBe('hybrid')
    expect(fuelType(rows('Diesel', 'Elektriciteit'))).toBe('hybrid')
    expect(fuelType(rows('Benzine', 'LPG'))).toBe('gasoline')
    expect(fuelType(rows('LPG'))).toBe('other')
    expect(fuelType(rows('CNG'))).toBe('other')
    expect(fuelType(rows('LNG'))).toBe('other')
    // A fuel-cell car runs on hydrogen; the form has no word for it.
    expect(
      fuelType([
        { brandstof_omschrijving: 'Waterstof', klasse_hybride_elektrisch_voertuig: 'NOVC-FCHV' },
        {
          brandstof_omschrijving: 'Elektriciteit',
          klasse_hybride_elektrisch_voertuig: 'NOVC-FCHV',
        },
      ])
    ).toBe('other')
    // A petrol car in a HEV class is a hybrid even when only one fuel row is present.
    expect(
      fuelType([
        { brandstof_omschrijving: 'Benzine', klasse_hybride_elektrisch_voertuig: 'OVC-HEV' },
      ])
    ).toBe('hybrid')
    expect(fuelType([])).toBeUndefined()
  })

  it('leaves out colours RDW records for "none", and an exported vehicle is not registered', () => {
    for (const colour of ['N.v.t.', 'Niet geregistreerd', 'DIVERSEN']) {
      expect(mapVehicle({ eerste_kleur: colour }, []).color).toBeUndefined()
    }
    expect(mapVehicle({ eerste_kleur: 'GRIJS' }, []).color).toBe('Grijs')
    expect(mapVehicle({ export_indicator: 'Ja' }, []).registered).toBe(false)
    expect(mapVehicle({ export_indicator: 'Nee' }, []).registered).toBe(true)
    expect(mapVehicle({}, []).registered).toBeUndefined()
  })

  it('leaves out what the register did not say, and reads RDW dates', () => {
    expect(mapVehicle({}, [])).toEqual({})
    expect(mapVehicle({ cilinderinhoud: '0' }, []).engineSize).toBeUndefined()
    expect(isoDate('20270426')).toBe('2027-04-26')
    expect(isoDate('2027-04-26')).toBeUndefined()
    expect(isoDate(undefined)).toBeUndefined()
  })

  it('normalises plates the way they are printed', () => {
    expect(normalisePlate('SK-209-X')).toBe('SK209X')
    expect(normalisePlate('sk 209 x')).toBe('SK209X')
    expect(normalisePlate(' g-317-pg ')).toBe('G317PG')
  })
})

describe('rdw connector', () => {
  it('asks the vehicle dataset then the fuel dataset by plate, without a token', async () => {
    const { ctx, fetch, log } = context(datasets)
    const result = await connector.lookupVehicle?.(ctx, { plate: 'sk-209-x' })
    expect(result?.fuelType).toBe('hybrid')
    expect(result?.inspectionDue).toBe('2027-04-26')
    expect(fetch.mock.calls.map((c) => c[0])).toEqual([
      'https://opendata.rdw.nl/resource/m9d7-ebf2.json?kenteken=SK209X',
      'https://opendata.rdw.nl/resource/8ys7-d773.json?kenteken=SK209X',
    ])
    expect((fetch.mock.calls[0][1] as RequestInit).headers).not.toHaveProperty('X-App-Token')
    // The plate is personal data and must not land in the connection log.
    for (const call of log.mock.calls) expect(JSON.stringify(call)).not.toContain('SK209X')
  })

  it('sends the app token when the workshop has one', async () => {
    const { ctx, fetch } = context(datasets, { appToken: 'abc123' })
    await connector.lookupVehicle?.(ctx, { plate: 'G317PG' })
    expect((fetch.mock.calls[0][1] as RequestInit).headers).toMatchObject({
      'X-App-Token': 'abc123',
    })
  })

  it('returns null on an empty answer and spends no second request on it', async () => {
    const { ctx, fetch } = context(datasets)
    expect(await connector.lookupVehicle?.(ctx, { plate: 'XX-000-X' })).toBeNull()
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('finds nothing for a VIN alone, since the open data has none', async () => {
    const { ctx, fetch } = context(datasets)
    expect(await connector.lookupVehicle?.(ctx, { vin: 'JTDZN3EU0E3298500' })).toBeNull()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('explains a rejected token and a throttle', async () => {
    const denied = context(async () => new Response('Invalid app_token', { status: 403 }))
    await expect(connector.lookupVehicle?.(denied.ctx, { plate: 'SK209X' })).rejects.toThrow(
      /rejected the app token/
    )
    const throttled = context(async () => new Response('', { status: 429 }))
    await expect(connector.lookupVehicle?.(throttled.ctx, { plate: 'SK209X' })).rejects.toThrow(
      /throttling/
    )
  })

  it('tests with one public row, and fails only on a bad token', async () => {
    const good = context(async () => Response.json([POLO]), { appToken: 'abc123' })
    expect(await connector.test(good.ctx)).toEqual({ ok: true })
    expect(good.fetch.mock.calls[0][0]).toBe(
      'https://opendata.rdw.nl/resource/m9d7-ebf2.json?$limit=1'
    )
    const bad = context(async () => new Response('', { status: 403 }), { appToken: 'nope' })
    expect((await connector.test(bad.ctx)).ok).toBe(false)
    const anonymous = context(async () => Response.json([POLO]))
    expect(await connector.test(anonymous.ctx)).toEqual({ ok: true })
  })
})
