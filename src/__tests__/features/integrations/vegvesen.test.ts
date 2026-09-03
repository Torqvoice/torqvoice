import { describe, expect, it, vi } from 'vitest'
import type { ConnectorContext } from '@/features/integrations/Lib/types'
import {
  type Kjoretoydata,
  connector,
  mapKjoretoydata,
  normalisePlate,
} from '@/integrations/vegvesen/server'

/**
 * A record shaped the way Vegvesen's enkeltoppslag answers, trimmed to the
 * paths the mapper reads. The shape is the contract: a change to the mapper
 * that stops reading one of these paths shows up here, not on a workshop's
 * empty form.
 */
const RECORD: Kjoretoydata = {
  kjoretoyId: { kjennemerke: 'EV11223', understellsnummer: 'YV1PW10XXH1234567' },
  forstegangsregistrering: { registrertForstegangNorgeDato: '2017-03-21' },
  registrering: { registreringsstatus: { kodeVerdi: 'REGISTRERT', kodeNavn: 'Registrert' } },
  godkjenning: {
    tekniskGodkjenning: {
      kjoretoyklassifisering: { tekniskKode: { kodeVerdi: 'M1', kodeNavn: 'Personbil' } },
      tekniskeData: {
        generelt: { merke: [{ merke: 'VOLVO' }], handelsbetegnelse: ['V90 CROSS COUNTRY'] },
        motorOgDrivverk: {
          motor: [
            {
              drivstoff: [{ drivstoffKode: { kodeVerdi: '2', kodeNavn: 'Diesel' } }],
              slagvolum: 1969,
              motorKode: 'D4204T14',
            },
          ],
          girkassetype: { kodeVerdi: 'A', kodeNavn: 'Automat' },
        },
        karosseriOgLasteplan: { rFarge: [{ kodeVerdi: '01', kodeNavn: 'SVART' }] },
        vekter: { egenvekt: 1938, tekniskTillattTotalvekt: 2500 },
        dekkOgFelg: {
          akselDekkOgFelgKombinasjon: [
            {
              akselDekkOgFelg: [
                {
                  akselId: 1,
                  dekkdimensjon: '235/55R18',
                  felgdimensjon: '8x18',
                  belastningskodeDekk: '104',
                  hastighetskodeDekk: 'V',
                },
                { akselId: 2, dekkdimensjon: '235/55R18', felgdimensjon: '8x18' },
              ],
            },
          ],
        },
      },
    },
  },
  periodiskKjoretoyKontroll: { kontrollfrist: '2027-03-31', sistGodkjent: '2025-02-14' },
}

function context(fetchImpl: (url: string, init?: RequestInit) => Promise<Response>) {
  const log = vi.fn(async () => undefined)
  const ctx = {
    connection: {
      id: 'c1',
      organizationId: 'org',
      connectorId: 'vegvesen',
      settings: {},
      state: {},
      externalAccountId: null,
    },
    credentials: { apiKey: 'secret-key' },
    http: { fetch: vi.fn(fetchImpl), json: vi.fn() },
    links: { get: vi.fn(), set: vi.fn(), remove: vi.fn(), remoteIds: vi.fn() },
    log,
    saveState: vi.fn(),
    timezone: 'Europe/Oslo',
    appUrl: 'https://app.test',
  } as unknown as ConnectorContext
  return { ctx, log, fetch: ctx.http.fetch as ReturnType<typeof vi.fn> }
}

describe('vegvesen mapper', () => {
  it('turns a record into the form fields', () => {
    expect(mapKjoretoydata(RECORD)).toEqual({
      make: 'Volvo',
      model: 'V90 CROSS COUNTRY',
      year: 2017,
      vin: 'YV1PW10XXH1234567',
      licensePlate: 'EV11223',
      color: 'Svart',
      fuelType: 'diesel',
      transmission: 'automatic',
      engineSize: '2.0 L',
      engineCode: 'D4204T14',
      vehicleClass: 'Personbil',
      firstRegistered: '2017-03-21',
      inspectionDue: '2027-03-31',
      lastInspected: '2025-02-14',
      tyres: [
        { axle: 1, tyre: '235/55R18', rim: '8x18', loadIndex: '104', speedRating: 'V' },
        { axle: 2, tyre: '235/55R18', rim: '8x18', loadIndex: undefined, speedRating: undefined },
      ],
      weights: { kerb: 1938, grossMax: 2500 },
      registered: true,
    })
  })

  it('calls a car with an electric motor and a combustion one a hybrid', () => {
    const hybrid: Kjoretoydata = {
      godkjenning: {
        tekniskGodkjenning: {
          tekniskeData: {
            motorOgDrivverk: {
              motor: [
                { drivstoff: [{ drivstoffKode: { kodeVerdi: '1', kodeNavn: 'Bensin' } }] },
                { drivstoff: [{ drivstoffKode: { kodeVerdi: '5', kodeNavn: 'Elektrisk' } }] },
              ],
            },
          },
        },
      },
    }
    expect(mapKjoretoydata(hybrid).fuelType).toBe('hybrid')
    const ev: Kjoretoydata = {
      godkjenning: {
        tekniskGodkjenning: {
          tekniskeData: {
            motorOgDrivverk: {
              motor: [
                { drivstoff: [{ drivstoffKode: { kodeVerdi: '5', kodeNavn: 'Elektrisk' } }] },
              ],
            },
          },
        },
      },
    }
    expect(mapKjoretoydata(ev).fuelType).toBe('electric')
    expect(mapKjoretoydata(ev).transmission).toBeUndefined()
  })

  it('keeps a diesel a diesel when the hybrid category says none', () => {
    const diesel: Kjoretoydata = {
      godkjenning: {
        tekniskGodkjenning: {
          tekniskeData: {
            motorOgDrivverk: {
              motor: [{ drivstoff: [{ drivstoffKode: { kodeVerdi: '2', kodeNavn: 'Diesel' } }] }],
              hybridElektriskKjoretoy: false,
              hybridKategori: { kodeVerdi: '0', kodeNavn: 'Ikke hybrid' },
            },
          },
        },
      },
    }
    expect(mapKjoretoydata(diesel).fuelType).toBe('diesel')
    const phev: Kjoretoydata = {
      godkjenning: {
        tekniskGodkjenning: {
          tekniskeData: {
            motorOgDrivverk: {
              motor: [{ drivstoff: [{ drivstoffKode: { kodeVerdi: '1', kodeNavn: 'Bensin' } }] }],
              hybridKategori: { kodeVerdi: 'OVC-HEV', kodeNavn: 'Ladbar hybrid' },
            },
          },
        },
      },
    }
    expect(mapKjoretoydata(phev).fuelType).toBe('hybrid')
  })

  it('leaves out what the registry did not say', () => {
    expect(mapKjoretoydata({})).toEqual({})
  })

  it('normalises plates the way people type them', () => {
    expect(normalisePlate(' ev 11223 ')).toBe('EV11223')
    expect(normalisePlate('EV-11223')).toBe('EV11223')
  })
})

describe('vegvesen connector', () => {
  it('sends the key in the SVV-Authorization header and maps a match', async () => {
    const { ctx, fetch, log } = context(async () =>
      Response.json({ kjoretoydataListe: [RECORD] }, { status: 200 })
    )
    const result = await connector.lookupVehicle?.(ctx, { plate: 'ev 11223' })
    expect(result?.make).toBe('Volvo')
    const [url, init] = fetch.mock.calls[0]
    expect(url).toBe(
      'https://akfell-datautlevering.atlas.vegvesen.no/enkeltoppslag/kjoretoydata?kjennemerke=EV11223'
    )
    expect((init as RequestInit).headers).toMatchObject({
      'SVV-Authorization': 'Apikey secret-key',
    })
    // The plate is personal data and must not land in the connection log.
    for (const call of log.mock.calls) expect(JSON.stringify(call)).not.toContain('EV11223')
  })

  it('looks up by VIN when no plate is given', async () => {
    const { ctx, fetch } = context(async () => new Response(null, { status: 204 }))
    const result = await connector.lookupVehicle?.(ctx, { vin: 'yv1pw10xxh1234567' })
    expect(result).toBeNull()
    expect(String(fetch.mock.calls[0][0])).toContain('understellsnummer=YV1PW10XXH1234567')
  })

  it('returns null on 204 and throws on a rejected key', async () => {
    const empty = context(async () => new Response(null, { status: 204 }))
    expect(await connector.lookupVehicle?.(empty.ctx, { plate: 'XX00000' })).toBeNull()
    const denied = context(async () => new Response('forbidden', { status: 403 }))
    await expect(connector.lookupVehicle?.(denied.ctx, { plate: 'EV11223' })).rejects.toThrow(
      /rejected the API key/
    )
  })

  it('proves a key with a plate that cannot exist', async () => {
    const good = context(async () => new Response(null, { status: 204 }))
    expect(await connector.test(good.ctx)).toEqual({ ok: true })
    const bad = context(async () => new Response('', { status: 403 }))
    expect((await connector.test(bad.ctx)).ok).toBe(false)
    const missing = context(async () => new Response(null, { status: 204 }))
    missing.ctx.credentials = {}
    expect((await connector.test(missing.ctx)).ok).toBe(false)
    expect(missing.fetch).not.toHaveBeenCalled()
  })
})
