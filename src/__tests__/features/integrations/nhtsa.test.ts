import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import type { ConnectorContext } from '@/features/integrations/Lib/types'
import { manifest } from '@/integrations/nhtsa/manifest'
import {
  type NhtsaComplaint,
  type NhtsaRatingDetail,
  type NhtsaRecall,
  type VpicRow,
  complaintComponents,
  decodeFailed,
  decodeToLookup,
  fuelType,
  humanizeComponent,
  isoDate,
  mapRating,
  mapRecall,
  matchModel,
  pickVariant,
  summarizeComplaints,
} from '@/integrations/nhtsa/mapping'
import { connector } from '@/integrations/nhtsa/server'

/**
 * Answers recorded from NHTSA's public services on 5 September 2026 for a
 * 2003 Honda Accord: the vPIC decode of a VIN NHTSA uses in its own
 * examples, three of its recalls, five of its complaints, the rated
 * variants and one variant's ratings, and the models NHTSA files under
 * Honda for that year. The component vocabulary and date formats the
 * mapper reads were taken from those answers, not assumed.
 */
const FIXTURES = path.join(__dirname, 'fixtures/nhtsa')
function fixture<T>(name: string): T {
  return JSON.parse(fs.readFileSync(path.join(FIXTURES, `${name}.json`), 'utf-8')) as T
}
const DECODE = fixture<{ Results: VpicRow[] }>('decode-1HGCM82633A004352').Results[0]
const RECALLS = fixture<{ results: NhtsaRecall[] }>('recalls-accord-2003').results
const COMPLAINTS = fixture<{ results: NhtsaComplaint[] }>('complaints-accord-2003').results
const VARIANTS = fixture<{ Results: { VehicleDescription: string; VehicleId: number }[] }>(
  'ratings-accord-2003'
).Results
const RATING = fixture<{ Results: NhtsaRatingDetail[] }>('rating-4738').Results[0]
const MODELS = fixture<{ results: { model: string }[] }>('models-honda-2003').results.map(
  (m) => m.model
)

describe('NHTSA VIN decode', () => {
  it('fills the form from a clean decode', () => {
    const result = decodeToLookup(DECODE, '1hgcm82633a004352')
    expect(result).toEqual({
      make: 'Honda',
      model: 'Accord EX-V6',
      year: 2003,
      vin: '1HGCM82633A004352',
      fuelType: 'gasoline',
      transmission: 'automatic',
      engineSize: '3.0',
      engineCode: 'J30A4',
      vehicleClass: 'Coupe',
    })
  })

  it('treats a wrong check digit as decoded and invalid characters as not', () => {
    expect(decodeFailed({ ...DECODE, ErrorCode: '1' })).toBe(false)
    expect(decodeFailed({ ErrorCode: '1,5,14,400', Make: 'VOLKSWAGEN', Model: '' })).toBe(true)
    expect(decodeFailed({ ErrorCode: '0', Make: '' })).toBe(true)
    expect(decodeToLookup({ ErrorCode: '400', Make: 'X' }, 'X')).toBeNull()
  })

  it('names the fuel the way the form does', () => {
    expect(fuelType({ FuelTypePrimary: 'Gasoline' })).toBe('gasoline')
    expect(fuelType({ FuelTypePrimary: 'Diesel' })).toBe('diesel')
    expect(
      fuelType({
        FuelTypePrimary: 'Gasoline',
        FuelTypeSecondary: 'Electric',
        ElectrificationLevel: 'Strong HEV (Hybrid Electric Vehicle)',
      })
    ).toBe('hybrid')
    expect(
      fuelType({
        FuelTypePrimary: 'Electric',
        ElectrificationLevel: 'BEV (Battery Electric Vehicle)',
      })
    ).toBe('electric')
    expect(fuelType({ FuelTypePrimary: 'Compressed Natural Gas (CNG)' })).toBe('other')
    expect(fuelType({ FuelTypePrimary: '' })).toBeUndefined()
  })
})

describe('NHTSA recalls and complaints', () => {
  it('maps a recall with its campaign, dates and driving advice', () => {
    const recall = mapRecall(RECALLS[0])
    expect(recall).toMatchObject({
      campaign: '19V182000',
      component: 'AIR BAGS:FRONTAL:DRIVER SIDE:INFLATOR MODULE',
      reported: '2019-06-03',
      parkIt: false,
      parkOutside: false,
      manufacturer: 'Honda (American Honda Motor Co.)',
    })
    expect(recall?.remedy).toContain('free of charge')
    expect(mapRecall({ Component: 'X' })).toBeNull()
    expect(isoDate('6/3/2019')).toBe('2019-06-03')
    expect(isoDate('nope')).toBeNull()
  })

  it('splits the components of a complaint the way NHTSA joins them', () => {
    expect(complaintComponents('SERVICE BRAKES, HYDRAULIC')).toEqual(['SERVICE BRAKES, HYDRAULIC'])
    expect(complaintComponents('AIR BAGS,SEAT BELTS,ENGINE')).toEqual([
      'AIR BAGS',
      'SEAT BELTS',
      'ENGINE',
    ])
    expect(complaintComponents('AIR BAGS,SERVICE BRAKES, HYDRAULIC')).toEqual([
      'AIR BAGS',
      'SERVICE BRAKES, HYDRAULIC',
    ])
    expect(complaintComponents(undefined)).toEqual([])
  })

  it('counts complaints per component with crashes and fires, newest first', () => {
    const summary = summarizeComplaints(COMPLAINTS, 3, 2)
    expect(summary.total).toBe(COMPLAINTS.length)
    expect(summary.crashes).toBe(COMPLAINTS.filter((c) => c.crash).length)
    expect(summary.fires).toBe(COMPLAINTS.filter((c) => c.fire).length)
    expect(summary.byComponent.length).toBeLessThanOrEqual(3)
    const shares = summary.byComponent.map((g) => g.share)
    expect([...shares].sort((a, b) => b - a)).toEqual(shares)
    expect(summary.byComponent[0].count).toBeGreaterThan(0)
    expect(summary.latest).toHaveLength(2)
    expect((summary.latest[0].date ?? '') >= (summary.latest[1].date ?? '')).toBe(true)
  })

  it('writes component paths for people', () => {
    expect(humanizeComponent('AIR BAGS:FRONTAL:DRIVER SIDE:INFLATOR MODULE')).toBe(
      'Air bags, frontal, driver side, inflator module'
    )
    expect(humanizeComponent('SERVICE BRAKES, HYDRAULIC:ANTILOCK')).toBe(
      'Service brakes, hydraulic, antilock'
    )
    expect(humanizeComponent('ELECTRICAL SYSTEM')).toBe('Electrical system')
  })
})

describe('NHTSA ratings and model matching', () => {
  it('reads stars and leaves an unrated field null', () => {
    expect(mapRating(RATING)).toEqual({
      overall: null,
      frontal: 5,
      side: null,
      rollover: 4,
      description: '2003 Honda Accord 4-DR. w/SAB',
    })
    expect(mapRating({ OverallRating: 'Not Rated', VehicleDescription: 'x' })).toBeNull()
  })

  it('picks the rated variant that matches the body', () => {
    expect(pickVariant(VARIANTS, { doors: '2' })?.VehicleDescription).toBe(
      '2003 Honda Accord 2-DR. w/SAB'
    )
    expect(pickVariant(VARIANTS, { doors: '4' })?.VehicleDescription).toBe(
      '2003 Honda Accord 4-DR. w/SAB'
    )
    expect(pickVariant(VARIANTS, {})?.VehicleId).toBe(VARIANTS[0].VehicleId)
    expect(pickVariant([], { doors: '2' })).toBeNull()
  })

  it("finds the workshop's model name in NHTSA's list", () => {
    expect(matchModel('Accord', MODELS)).toBe('ACCORD')
    expect(matchModel('civic gx', MODELS)).toBe('CIVIC GX')
    expect(matchModel('Accord EX-V6', MODELS)).toBe('ACCORD')
    expect(matchModel('CR V', MODELS)).toBe('CR-V')
    expect(matchModel('Corolla', MODELS)).toBeNull()
    expect(matchModel('', MODELS)).toBeNull()
  })
})

function context(routes: Record<string, unknown>) {
  const urls: string[] = []
  const json = vi.fn(async (url: string) => {
    urls.push(url)
    const hit = Object.entries(routes).find(([needle]) => url.includes(needle))
    if (!hit) throw new Error(`unexpected ${url}`)
    return hit[1]
  })
  const ctx = {
    connection: {
      id: 'c1',
      organizationId: 'org',
      connectorId: 'nhtsa',
      settings: {},
      state: {},
      externalAccountId: null,
    },
    credentials: {},
    http: { fetch: vi.fn(), json },
    links: { get: vi.fn(), set: vi.fn(), remove: vi.fn(), remoteIds: vi.fn(), byRemoteId: vi.fn() },
    log: vi.fn(async () => undefined),
    saveState: vi.fn(),
    timezone: 'America/New_York',
    appUrl: 'https://shop.example.com',
  } as unknown as ConnectorContext
  return { ctx, urls }
}

describe('NHTSA connector', () => {
  it('needs no key and joins the safety refresh like every safety source', () => {
    expect(manifest.auth).toEqual({ type: 'api-key', fields: [] })
    expect(manifest.capabilities).toContain('vehicle.lookup')
    expect(manifest.capabilities).toContain('vehicle.safety')
    expect(manifest.schedules?.[0].job).toBe('safety.refresh')
    expect(connector.jobs['safety.refresh']).toBeTypeOf('function')
  })

  it('decodes a VIN and refuses a plate', async () => {
    const { ctx, urls } = context({ DecodeVinValues: { Results: [DECODE] } })
    const result = await connector.lookupVehicle?.(ctx, { vin: '1HGCM82633A004352' })
    expect(result?.make).toBe('Honda')
    expect(urls[0]).toBe(
      'https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/1HGCM82633A004352?format=json'
    )
    await expect(connector.lookupVehicle?.(ctx, { plate: 'ABC 123' })).rejects.toThrow(/VIN/)
    await expect(connector.lookupVehicle?.(ctx, { vin: 'SHORT' })).rejects.toThrow(/17/)
    expect(await connector.test(ctx)).toEqual({ ok: true })
  })

  it('builds the report from the VIN, the model list, recalls, complaints and ratings', async () => {
    const { ctx, urls } = context({
      DecodeVinValues: { Results: [DECODE] },
      '/products/vehicle/models': { results: MODELS.map((model) => ({ model })) },
      '/recalls/recallsByVehicle': { results: [...RECALLS, RECALLS[0]] },
      '/complaints/complaintsByVehicle': { results: COMPLAINTS },
      '/SafetyRatings/VehicleId/': { Results: [RATING] },
      '/SafetyRatings/modelyear/': { Results: VARIANTS },
    })
    const report = await connector.vehicleSafety?.(ctx, {
      make: 'Honda',
      model: 'Accord',
      year: 2003,
      vin: '1HGCM82633A004352',
    })
    expect(report?.matched).toEqual({ make: 'HONDA', model: 'ACCORD', year: 2003 })
    // Duplicated campaign counted once, newest first.
    expect(report?.recalls.map((r) => r.campaign)).toEqual(['19V499000', '19E068000', '19V182000'])
    expect(report?.complaints.total).toBe(COMPLAINTS.length)
    expect(report?.rating?.frontal).toBe(5)
    expect(report?.url).toBe('https://www.nhtsa.gov/vehicle/2003/HONDA/ACCORD')
    const recallsUrl = new URL(urls.find((u) => u.includes('recallsByVehicle')) as string)
    expect(Object.fromEntries(recallsUrl.searchParams)).toEqual({
      make: 'HONDA',
      model: 'ACCORD',
      modelYear: '2003',
    })
    // The coupe's VIN steers the rating to the 2-door variant.
    expect(urls.some((u) => u.endsWith('/SafetyRatings/VehicleId/4739'))).toBe(true)
  })

  it('says so when NHTSA has no such model instead of showing zeros', async () => {
    const { ctx, urls } = context({
      '/products/vehicle/models': { results: MODELS.map((model) => ({ model })) },
    })
    const report = await connector.vehicleSafety?.(ctx, {
      make: 'Honda',
      model: 'Jazz',
      year: 2003,
    })
    expect(report?.matched).toBeNull()
    expect(report?.recalls).toEqual([])
    expect(urls.some((u) => u.includes('recallsByVehicle'))).toBe(false)
  })

  it('keeps the recalls when the ratings service fails', async () => {
    const { ctx } = context({
      '/products/vehicle/models': { results: [{ model: 'ACCORD' }] },
      '/recalls/recallsByVehicle': { results: RECALLS },
      '/complaints/complaintsByVehicle': { results: [] },
    })
    const report = await connector.vehicleSafety?.(ctx, {
      make: 'Honda',
      model: 'Accord',
      year: 2003,
    })
    expect(report?.recalls).toHaveLength(3)
    expect(report?.rating).toBeNull()
    expect(report?.complaints.total).toBe(0)
  })
})
