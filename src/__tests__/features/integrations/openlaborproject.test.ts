import fs from 'node:fs'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ConnectorContext, FluidSpec, LaborTime } from '@/features/integrations/Lib/types'
import {
  confidenceOf,
  connector,
  mapFluidSpec,
  mapLaborTime,
  slug,
  toAnswer,
} from '@/integrations/openlaborproject/server'

/**
 * Replies recorded from the live service on 2 November 2026 with a free
 * key, trimmed to a few engines and jobs: a whole model year (2018 Ford
 * F-150), one job for one variant, the fluids of a 2020 Honda Civic, one
 * fluid system, and the refusal for a model the service does not know.
 */
const FIXTURES = path.join(__dirname, 'fixtures/openlaborproject')
function fixture<T = unknown>(name: string): T {
  return JSON.parse(fs.readFileSync(path.join(FIXTURES, `${name}.json`), 'utf-8'))
}

/** The bad-key refusal, word for word as the live service sent it. */
const BAD_KEY = {
  data: null,
  meta: {},
  error: { code: 'INVALID_API_KEY', message: 'Invalid or revoked API key.' },
}
const MISSING_PARAMS = {
  data: null,
  meta: {},
  error: {
    code: 'MISSING_PARAMS',
    message:
      'Required: make, model, year (YYYY or YYYY-YYYY) — or a vin. Optional: engine, job, q.',
  },
}

const VIN = '1FTFW1E50JFA12345'

function ctx(): ConnectorContext {
  return {
    connection: {
      id: 'c1',
      organizationId: 'org1',
      connectorId: 'openlaborproject',
      settings: {},
      state: {},
      externalAccountId: null,
    },
    credentials: { apiKey: 'test-key' },
    http: { fetch: vi.fn(), json: vi.fn() },
    links: {} as ConnectorContext['links'],
    log: vi.fn(async () => undefined),
    saveState: vi.fn(async () => undefined),
    timezone: 'UTC',
    appUrl: 'http://localhost',
  } as unknown as ConnectorContext
}

function reply(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>()

function urlOf(call: number): URL {
  return new URL(fetchMock.mock.calls[call][0])
}

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('mapping', () => {
  it('reads a whole model year as one variant per engine and drivetrain', () => {
    const answer = toAnswer(
      fixture<{ data: unknown }>('labor-model').data,
      'laborTimes',
      mapLaborTime
    )
    expect(answer?.make).toBe('Ford')
    expect(answer?.model).toBe('F-150')
    expect(answer?.variants.map((v) => [v.engine, v.engineId, v.drivetrain])).toEqual([
      ['2.7L V6 EcoBoost', '2.7l-v6-ecoboost', 'rwd'],
      ['3.0L V6 Power Stroke Diesel', '3.0l-v6-diesel', 'rwd'],
      ['5.0L V8 Coyote', '5.0l-v8-coyote', '4wd'],
    ])
    expect(answer?.variants[2].vehicleId).toBe('92a92bb0-7293-4783-97e9-743c15473972')
  })

  it('keeps the one job a free key unlocks and lists the rest without hours', () => {
    const answer = toAnswer(
      fixture<{ data: unknown }>('labor-model').data,
      'laborTimes',
      mapLaborTime
    )
    const jobs = answer?.variants[0].items as LaborTime[]
    expect(jobs.find((j) => j.id === 'brake-pads-rotors-front')).toEqual({
      id: 'brake-pads-rotors-front',
      name: 'Brake Pads and Rotors - Front',
      category: 'brakes',
      hours: 2.1,
      low: 1.7,
      high: 2.5,
      confidence: 'high',
      locked: false,
    })
    expect(jobs.find((j) => j.id === 'alternator')).toMatchObject({
      hours: null,
      confidence: null,
      locked: true,
    })
  })

  it('reads one job for one variant from the single-vehicle shape', () => {
    const answer = toAnswer(
      fixture<{ data: unknown }>('labor-one-job').data,
      'laborTimes',
      mapLaborTime
    )
    expect(answer?.variants).toHaveLength(1)
    expect(answer?.variants[0]).toMatchObject({
      engineId: '5.0l-v8-coyote',
      drivetrain: 'rwd',
      vehicleId: 'fd9074f5-8d5a-4c74-ad53-d036536690ff',
    })
    expect(answer?.variants[0].items[0]).toMatchObject({
      id: 'water-pump',
      hours: 2.8,
      confidence: 'medium',
      locked: false,
    })
  })

  it('reads fluids, which carry no vehicle id, and the one system a free key unlocks', () => {
    const answer = toAnswer(
      fixture<{ data: unknown }>('fluids-model').data,
      'fluidSpecs',
      mapFluidSpec
    )
    expect(answer?.variants.map((v) => [v.engineId, v.vehicleId])).toEqual([
      ['1.5l-i4-turbo', null],
      ['2.0l-i4', null],
    ])
    const fluids = answer?.variants.flatMap((v) => v.items) as FluidSpec[]
    const oil = fluids.find((f) => !f.locked)
    expect(oil).toMatchObject({
      id: 'engine_oil',
      system: 'Engine Oil',
      fluid: '0W-20 full synthetic',
      capacityLiters: 3.5,
      capacityQuarts: 3.7,
      intervalKm: 8045,
      confidence: 'estimated',
    })
    expect(fluids.filter((f) => f.locked).length).toBeGreaterThan(0)
  })

  it('reads one fluid system', () => {
    const answer = toAnswer(
      fixture<{ data: unknown }>('fluids-one-system').data,
      'fluidSpecs',
      mapFluidSpec
    )
    expect(answer?.variants[0].items[0]).toMatchObject({
      id: 'coolant',
      capacityLiters: 5.58,
      locked: false,
    })
  })

  it('folds the confidence levels into four', () => {
    expect(confidenceOf('oem_matched')).toBe('oem')
    expect(confidenceOf('oem_verified')).toBe('oem')
    expect(confidenceOf('high')).toBe('high')
    expect(confidenceOf('medium')).toBe('medium')
    expect(confidenceOf('estimated')).toBe('estimated')
    expect(confidenceOf(null)).toBeNull()
    expect(confidenceOf('something new')).toBeNull()
  })

  it('spells make and model the way the service does in its URLs', () => {
    expect(slug('F-150')).toBe('f-150')
    expect(slug('Mercedes-Benz')).toBe('mercedes-benz')
    expect(slug('Land Rover')).toBe('land-rover')
    expect(slug('Citroën')).toBe('citroen')
    expect(slug(' 3 Series ')).toBe('3-series')
  })

  it('has no answer for an empty reply', () => {
    expect(toAnswer(null, 'laborTimes', mapLaborTime)).toBeNull()
    expect(toAnswer({ engines: [] }, 'laborTimes', mapLaborTime)).toBeNull()
  })
})

describe('labor times', () => {
  const query = { make: 'Ford', model: 'F-150', year: 2018 }

  it('asks by make, model and year with the key in a header', async () => {
    fetchMock.mockResolvedValueOnce(reply(200, fixture('labor-model')))
    const answer = await connector.laborTimes?.(ctx(), query)
    expect(answer?.variants).toHaveLength(3)
    const url = urlOf(0)
    expect(url.pathname).toBe('/api/v1/labor-times')
    expect(Object.fromEntries(url.searchParams)).toEqual({
      make: 'ford',
      model: 'f-150',
      year: '2018',
    })
    const headers = fetchMock.mock.calls[0][1]?.headers as Record<string, string>
    expect(headers['x-api-key']).toBe('test-key')
    expect(url.searchParams.has('key')).toBe(false)
  })

  it('tries the VIN when the service spells the model differently', async () => {
    fetchMock
      .mockResolvedValueOnce(reply(404, fixture('not-found')))
      .mockResolvedValueOnce(reply(200, fixture('labor-one-job')))
    const c = ctx()
    const answer = await connector.laborTimes?.(c, { ...query, model: 'F150', vin: VIN })
    expect(answer?.variants).toHaveLength(1)
    expect(urlOf(0).searchParams.get('model')).toBe('f150')
    expect(Object.fromEntries(urlOf(1).searchParams)).toEqual({ vin: VIN })
    // The VIN identifies one vehicle; the log has make, model and year only.
    expect(JSON.stringify(vi.mocked(c.log).mock.calls)).not.toContain(VIN)
  })

  it('has no answer for a model it does not know and no VIN to fall back on', async () => {
    fetchMock.mockResolvedValueOnce(reply(404, fixture('not-found')))
    expect(await connector.laborTimes?.(ctx(), { ...query, model: 'Nonexistent' })).toBeNull()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('leaves out a VIN that cannot be one', async () => {
    fetchMock.mockResolvedValueOnce(reply(404, fixture('not-found')))
    expect(await connector.laborTimes?.(ctx(), { ...query, vin: 'NOT-A-VIN' })).toBeNull()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('asks for one job of one variant', async () => {
    fetchMock.mockResolvedValueOnce(reply(200, fixture('labor-one-job')))
    await connector.laborTimes?.(ctx(), {
      ...query,
      variant: {
        engineId: '5.0l-v8-coyote',
        drivetrain: 'rwd',
        vehicleId: 'fd9074f5-8d5a-4c74-ad53-d036536690ff',
      },
      item: 'water-pump',
    })
    expect(Object.fromEntries(urlOf(0).searchParams)).toMatchObject({
      engine: '5.0l-v8-coyote',
      vehicle_id: 'fd9074f5-8d5a-4c74-ad53-d036536690ff',
      job: 'water-pump',
    })
  })

  it('says so when the key is refused', async () => {
    fetchMock.mockResolvedValueOnce(reply(401, BAD_KEY))
    await expect(connector.laborTimes?.(ctx(), query)).rejects.toThrow(
      'Open Labor Project rejected the API key'
    )
  })

  it("passes on the service's own words when the key has used its calls", async () => {
    fetchMock.mockResolvedValueOnce(
      reply(429, { data: null, error: { code: 'RATE_LIMITED', message: 'Daily limit reached.' } })
    )
    await expect(connector.laborTimes?.(ctx(), query)).rejects.toThrow(
      'Open Labor Project: Daily limit reached.'
    )
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('says so when the service cannot be reached', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('fetch failed'))
    await expect(connector.laborTimes?.(ctx(), query)).rejects.toThrow(
      'Open Labor Project could not be reached'
    )
  })
})

describe('fluids', () => {
  it('asks for one system with q', async () => {
    fetchMock.mockResolvedValueOnce(reply(200, fixture('fluids-one-system')))
    const answer = await connector.fluidSpecs?.(ctx(), {
      make: 'Honda',
      model: 'Civic',
      year: 2020,
      variant: { engineId: '2.0l-i4', drivetrain: 'fwd', vehicleId: null },
      item: 'coolant',
    })
    expect(urlOf(0).pathname).toBe('/api/v1/fluid-specs')
    expect(Object.fromEntries(urlOf(0).searchParams)).toEqual({
      make: 'honda',
      model: 'civic',
      year: '2020',
      engine: '2.0l-i4',
      q: 'coolant',
    })
    expect(answer?.variants[0].items[0]).toMatchObject({ id: 'coolant', locked: false })
  })
})

describe('connection test', () => {
  it('takes "what is missing" as proof the key is good', async () => {
    fetchMock.mockResolvedValueOnce(reply(400, MISSING_PARAMS))
    expect(await connector.test(ctx())).toEqual({ ok: true })
  })

  it('fails on a refused key', async () => {
    fetchMock.mockResolvedValueOnce(reply(401, BAD_KEY))
    expect(await connector.test(ctx())).toEqual({
      ok: false,
      message: 'Open Labor Project rejected the API key',
    })
  })

  it('fails without a key, before calling out', async () => {
    const c = ctx()
    c.credentials = {}
    expect((await connector.test(c)).ok).toBe(false)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
