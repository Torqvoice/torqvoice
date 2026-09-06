import type {
  ConnectorContext,
  ConnectorServer,
  VehicleLookupQuery,
  VehicleLookupResult,
} from '@/features/integrations/Lib/types'
import { inspectionJobs } from '@/features/integrations/Lib/inspection-sync'
import { manifest } from './manifest'

/**
 * Statens vegvesen "enkeltoppslag": one GET per vehicle, by plate or VIN,
 * authenticated with the workshop's own key in the SVV-Authorization
 * header. 204 means no such vehicle, 403 a key Vegvesen does not accept, and
 * the quota is 50 000 calls per key per day.
 *
 * Plates and VINs count as personal data under Norwegian law, so nothing
 * here writes either into the connection log; the log records outcomes only.
 */
const LOOKUP_URL = 'https://akfell-datautlevering.atlas.vegvesen.no/enkeltoppslag/kjoretoydata'

/** A plate that cannot exist in the Norwegian series, for proving a key without a vehicle. */
const PROBE_PLATE = 'XX00000'

interface Kode {
  kodeVerdi?: string
  kodeNavn?: string
  kodeBeskrivelse?: string
}

interface Motor {
  drivstoff?: { drivstoffKode?: Kode }[]
  slagvolum?: number
  motorKode?: string
}

interface AkselDekkOgFelg {
  akselId?: number
  dekkdimensjon?: string
  felgdimensjon?: string
  belastningskodeDekk?: string
  hastighetskodeDekk?: string
}

/** The slice of Vegvesen's record the app reads. Every path is optional in the wild. */
export interface Kjoretoydata {
  kjoretoyId?: { kjennemerke?: string; understellsnummer?: string }
  forstegangsregistrering?: { registrertForstegangNorgeDato?: string }
  registrering?: { registreringsstatus?: Kode }
  godkjenning?: {
    tekniskGodkjenning?: {
      kjoretoyklassifisering?: { tekniskKode?: Kode; beskrivelse?: string }
      tekniskeData?: {
        generelt?: { merke?: { merke?: string }[]; handelsbetegnelse?: string[] }
        motorOgDrivverk?: {
          motor?: Motor[]
          girkassetype?: Kode
          hybridElektriskKjoretoy?: boolean
          hybridKategori?: Kode
        }
        karosseriOgLasteplan?: { rFarge?: Kode[] }
        vekter?: { egenvekt?: number; tekniskTillattTotalvekt?: number }
        dekkOgFelg?: { akselDekkOgFelgKombinasjon?: { akselDekkOgFelg?: AkselDekkOgFelg[] }[] }
      }
    }
  }
  periodiskKjoretoyKontroll?: { kontrollfrist?: string; sistGodkjent?: string }
}

export interface KjoretoydataResponse {
  feilmelding?: string
  kjoretoydataListe?: Kjoretoydata[]
}

/** Vegvesen's drivstoffKode values, from the code list the API publishes. */
const FUEL_BY_CODE: Record<string, string> = {
  '1': 'gasoline',
  '2': 'diesel',
  '5': 'electric',
}

function fuelFromKode(kode: Kode | undefined): string | null {
  if (!kode) return null
  const byCode = kode.kodeVerdi ? FUEL_BY_CODE[kode.kodeVerdi] : undefined
  if (byCode) return byCode
  const name = `${kode.kodeNavn ?? ''} ${kode.kodeBeskrivelse ?? ''}`.toLowerCase()
  if (name.includes('bensin')) return 'gasoline'
  if (name.includes('diesel')) return 'diesel'
  if (name.includes('elektr')) return 'electric'
  return null
}

/** Fuel codes as Vegvesen sent them, for the log: codes are not personal data. */
export function fuelCodes(data: Kjoretoydata): string[] {
  const motor = data.godkjenning?.tekniskGodkjenning?.tekniskeData?.motorOgDrivverk
  const out: string[] = []
  for (const m of motor?.motor ?? []) {
    for (const d of m.drivstoff ?? []) {
      const k = d.drivstoffKode
      if (k) out.push(`${k.kodeVerdi ?? '?'}:${k.kodeNavn ?? k.kodeBeskrivelse ?? ''}`)
    }
  }
  const h = motor?.hybridKategori
  if (motor?.hybridElektriskKjoretoy !== undefined || h)
    out.push(
      `hybrid=${motor?.hybridElektriskKjoretoy ?? ''}:${h?.kodeVerdi ?? ''}:${h?.kodeNavn ?? ''}`
    )
  return out
}

/**
 * Whether Vegvesen's hybrid fields say yes. The category code is present on
 * plain diesels too, with a value meaning "none", so only a category that
 * names a hybrid counts, and a flag that is explicitly true.
 */
function flaggedHybrid(
  motor: NonNullable<
    NonNullable<NonNullable<Kjoretoydata['godkjenning']>['tekniskGodkjenning']>['tekniskeData']
  >['motorOgDrivverk']
): boolean {
  if (motor?.hybridElektriskKjoretoy === true) return true
  const k = motor?.hybridKategori
  if (!k) return false
  const text = `${k.kodeVerdi ?? ''} ${k.kodeNavn ?? ''} ${k.kodeBeskrivelse ?? ''}`.toLowerCase()
  if (/\b(ikke|ingen|nei|none|no)\b/.test(text)) return false
  return /hev|phev|hybrid/.test(text)
}

/**
 * One fuel for the form's select. A vehicle with both an electric motor and a
 * combustion one is a hybrid; otherwise the fuels decide, and the hybrid
 * fields only when they clearly say so.
 */
function fuelType(
  drivverk: NonNullable<Kjoretoydata['godkjenning']>['tekniskGodkjenning']
): string | undefined {
  const motor = drivverk?.tekniskeData?.motorOgDrivverk
  if (!motor) return undefined
  const fuels = new Set<string>()
  for (const m of motor.motor ?? []) {
    for (const d of m.drivstoff ?? []) {
      const f = fuelFromKode(d.drivstoffKode)
      if (f) fuels.add(f)
    }
  }
  const combustion = fuels.has('gasoline') || fuels.has('diesel')
  if ((fuels.has('electric') && combustion) || (combustion && flaggedHybrid(motor))) return 'hybrid'
  if (fuels.size === 0) return flaggedHybrid(motor) ? 'hybrid' : undefined
  if (fuels.has('electric')) return 'electric'
  if (fuels.has('diesel')) return 'diesel'
  if (fuels.has('gasoline')) return 'gasoline'
  return 'other'
}

function transmission(kode: Kode | undefined): string | undefined {
  if (!kode) return undefined
  const name = `${kode.kodeVerdi ?? ''} ${kode.kodeNavn ?? ''}`.toLowerCase()
  if (name.includes('trinnl') || name.includes('cvt')) return 'cvt'
  if (name.includes('manu') || kode.kodeVerdi === 'M') return 'manual'
  if (name.includes('auto') || kode.kodeVerdi === 'A') return 'automatic'
  return undefined
}

/** Displacement as the form shows it: litres with one decimal, from cubic centimetres. */
function engineSize(cc: number | undefined): string | undefined {
  if (!cc || cc <= 0) return undefined
  return `${(cc / 1000).toFixed(1)} L`
}

function titleCase(value: string): string {
  return value
    .toLowerCase()
    .split(/(\s+|-)/)
    .map((part) => (part.trim() && part !== '-' ? part[0].toUpperCase() + part.slice(1) : part))
    .join('')
}

/** Vegvesen's record in the app's vocabulary. Exported for the contract test. */
export function mapKjoretoydata(data: Kjoretoydata): VehicleLookupResult {
  const godkjenning = data.godkjenning?.tekniskGodkjenning
  const tekniske = godkjenning?.tekniskeData
  const firstRegistered = data.forstegangsregistrering?.registrertForstegangNorgeDato
  const year = firstRegistered ? Number(firstRegistered.slice(0, 4)) : Number.NaN
  const motor = tekniske?.motorOgDrivverk?.motor?.[0]
  const make = tekniske?.generelt?.merke?.[0]?.merke
  const model = tekniske?.generelt?.handelsbetegnelse?.[0]
  const status = data.registrering?.registreringsstatus?.kodeVerdi

  const tyres = (tekniske?.dekkOgFelg?.akselDekkOgFelgKombinasjon?.[0]?.akselDekkOgFelg ?? [])
    .map((a, i) => ({
      axle: a.akselId ?? i + 1,
      tyre: a.dekkdimensjon || undefined,
      rim: a.felgdimensjon || undefined,
      loadIndex: a.belastningskodeDekk || undefined,
      speedRating: a.hastighetskodeDekk || undefined,
    }))
    .filter((t) => t.tyre || t.rim)

  const weights = tekniske?.vekter
  const result: VehicleLookupResult = {
    make: make ? titleCase(make) : undefined,
    model: model || undefined,
    year: Number.isFinite(year) ? year : undefined,
    vin: data.kjoretoyId?.understellsnummer || undefined,
    licensePlate: data.kjoretoyId?.kjennemerke || undefined,
    color: tekniske?.karosseriOgLasteplan?.rFarge?.[0]?.kodeNavn
      ? titleCase(tekniske.karosseriOgLasteplan.rFarge[0].kodeNavn as string)
      : undefined,
    fuelType: fuelType(godkjenning),
    transmission: transmission(tekniske?.motorOgDrivverk?.girkassetype),
    engineSize: engineSize(motor?.slagvolum),
    engineCode: motor?.motorKode || undefined,
    vehicleClass:
      godkjenning?.kjoretoyklassifisering?.tekniskKode?.kodeNavn ||
      godkjenning?.kjoretoyklassifisering?.beskrivelse ||
      undefined,
    firstRegistered: firstRegistered || undefined,
    inspectionDue: data.periodiskKjoretoyKontroll?.kontrollfrist || undefined,
    lastInspected: data.periodiskKjoretoyKontroll?.sistGodkjent || undefined,
    tyres: tyres.length > 0 ? tyres : undefined,
    weights:
      weights?.egenvekt || weights?.tekniskTillattTotalvekt
        ? { kerb: weights.egenvekt, grossMax: weights.tekniskTillattTotalvekt }
        : undefined,
    registered: status ? status.toUpperCase() === 'REGISTRERT' : undefined,
  }
  // Drop the keys that came back empty so a form's fill-if-empty sees only values.
  for (const key of Object.keys(result) as (keyof VehicleLookupResult)[]) {
    if (result[key] === undefined) delete result[key]
  }
  return result
}

/** Norwegian plates are letters and digits; people type them with spaces and hyphens. */
export function normalisePlate(plate: string): string {
  return plate.replace(/[\s-]+/g, '').toUpperCase()
}

function headers(ctx: ConnectorContext): Record<string, string> {
  const key = typeof ctx.credentials.apiKey === 'string' ? ctx.credentials.apiKey.trim() : ''
  return { 'SVV-Authorization': `Apikey ${key}`, Accept: 'application/json' }
}

function urlFor(query: VehicleLookupQuery): string | null {
  const url = new URL(LOOKUP_URL)
  if (query.plate?.trim()) url.searchParams.set('kjennemerke', normalisePlate(query.plate))
  else if (query.vin?.trim())
    url.searchParams.set('understellsnummer', query.vin.trim().toUpperCase())
  else return null
  return url.toString()
}

/** One vehicle, by plate or VIN. Shared by the form's lookup button and the inspection sync. */
async function lookupVehicle(
  ctx: ConnectorContext,
  query: VehicleLookupQuery
): Promise<VehicleLookupResult | null> {
  const url = urlFor(query)
  if (!url) return null
  const res = await ctx.http.fetch(url, { headers: headers(ctx) })
  if (res.status === 204 || res.status === 404) {
    await ctx.log('info', 'Vehicle lookup: no match')
    return null
  }
  if (res.status === 401 || res.status === 403) {
    await ctx.log('error', 'Vehicle lookup: API key rejected', { status: res.status })
    throw new Error('Statens vegvesen rejected the API key')
  }
  if (res.status === 429) {
    await ctx.log('warn', 'Vehicle lookup: daily quota used up')
    throw new Error('Statens vegvesen: daily quota for this key is used up')
  }
  if (!res.ok) {
    await ctx.log('error', 'Vehicle lookup failed', { status: res.status })
    throw new Error(`Statens vegvesen answered HTTP ${res.status}`)
  }
  const body = (await res.json()) as KjoretoydataResponse
  const first = body.kjoretoydataListe?.[0]
  if (!first) {
    await ctx.log(
      'info',
      'Vehicle lookup: no match',
      body.feilmelding ? { reason: body.feilmelding } : undefined
    )
    return null
  }
  await ctx.log('info', 'Vehicle lookup: match', { fuel: fuelCodes(first) })
  return mapKjoretoydata(first)
}

export const connector: ConnectorServer = {
  manifest,

  async test(ctx) {
    if (!headers(ctx)['SVV-Authorization'].slice('Apikey '.length)) {
      return { ok: false, message: 'Statens vegvesen: an API key is required' }
    }
    // There is no ping endpoint. A plate outside the Norwegian series gets a
    // 204 with a good key and a 403 with a bad one, which is all the answer
    // a test needs.
    const res = await ctx.http.fetch(`${LOOKUP_URL}?kjennemerke=${PROBE_PLATE}`, {
      headers: headers(ctx),
    })
    if (res.status === 401 || res.status === 403) {
      return { ok: false, message: 'Statens vegvesen rejected the API key' }
    }
    if (res.status === 429) {
      return { ok: false, message: 'Statens vegvesen: daily quota for this key is used up' }
    }
    if (!res.ok && res.status !== 204 && res.status !== 400) {
      return { ok: false, message: `Statens vegvesen answered HTTP ${res.status}` }
    }
    return { ok: true }
  },

  lookupVehicle,

  jobs: inspectionJobs((ctx, query) => lookupVehicle(ctx, query)),
}
