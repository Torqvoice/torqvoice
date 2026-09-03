import type {
  ConnectorContext,
  ConnectorServer,
  VehicleLookupQuery,
  VehicleLookupResult,
} from '@/features/integrations/Lib/types'
import { makeCase } from '@/features/integrations/Lib/make-case'
import { inspectionJobs } from '@/features/integrations/Lib/inspection-sync'
import { manifest } from './manifest'

/**
 * RDW open data on the Socrata platform: one row per plate in the vehicle
 * dataset, and one row per fuel in the fuel dataset, both filtered with a
 * plain query parameter. No key is needed; an app token in X-App-Token lifts
 * the anonymous throttle. An empty array means no such vehicle, 403 an app
 * token Socrata does not accept, and 429 the throttle, which the HTTP client
 * retries on its own.
 *
 * A plate is personal data under Dutch law, so nothing here writes one into
 * the connection log; the log records outcomes only.
 */
const VEHICLES_URL = 'https://opendata.rdw.nl/resource/m9d7-ebf2.json'
const FUELS_URL = 'https://opendata.rdw.nl/resource/8ys7-d773.json'

/** The slice of the vehicle row the app reads. Every field is a string in Socrata's JSON, and optional in the wild. */
export interface RdwVehicle {
  kenteken?: string
  voertuigsoort?: string
  merk?: string
  handelsbenaming?: string
  vervaldatum_apk?: string
  datum_eerste_toelating?: string
  eerste_kleur?: string
  cilinderinhoud?: string
  massa_ledig_voertuig?: string
  toegestane_maximum_massa_voertuig?: string
  export_indicator?: string
}

export interface RdwFuel {
  kenteken?: string
  brandstof_volgnummer?: string
  brandstof_omschrijving?: string
  klasse_hybride_elektrisch_voertuig?: string
}

function text(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed ? trimmed : undefined
}

/** RDW writes dates as YYYYMMDD. */
export function isoDate(value: string | undefined): string | undefined {
  const m = value ? /^(\d{4})(\d{2})(\d{2})$/.exec(value.trim()) : null
  return m ? `${m[1]}-${m[2]}-${m[3]}` : undefined
}

/**
 * One fuel for the form's select from RDW's fuel rows. The dataset names
 * eight fuels (Benzine, Diesel, Elektriciteit, LPG, CNG, LNG, Alcohol,
 * Waterstof) and four hybrid classes (NOVC-HEV, OVC-HEV and the fuel-cell
 * pair NOVC-FCHV, OVC-FCHV). An electric row beside a combustion row is a
 * hybrid, as is a combustion car in a HEV class; a hydrogen car is neither
 * of the form's words and is left as other, as are LPG, CNG and LNG alone.
 */
export function fuelType(fuels: RdwFuel[]): string | undefined {
  const names = new Set<string>()
  let hev = false
  for (const row of fuels) {
    const name = text(row.brandstof_omschrijving)?.toLowerCase()
    if (name) names.add(name)
    if (/^(N?OVC-)?HEV$/i.test(text(row.klasse_hybride_elektrisch_voertuig) ?? '')) hev = true
  }
  if (names.size === 0) return undefined
  if (names.has('waterstof')) return 'other'
  const electric = names.has('elektriciteit')
  const diesel = names.has('diesel')
  const gasoline = names.has('benzine') || names.has('alcohol')
  if ((electric && (diesel || gasoline)) || ((diesel || gasoline) && hev)) return 'hybrid'
  if (electric) return 'electric'
  if (diesel) return 'diesel'
  if (gasoline) return 'gasoline'
  return 'other'
}

/** Colours RDW records for vehicles that have none, or has not recorded. */
const NO_COLOUR = new Set(['n.v.t.', 'niet geregistreerd', 'diversen'])

/** Displacement as the form shows it: litres with one decimal, from cubic centimetres. */
function engineSize(value: string | undefined): string | undefined {
  const cc = Number(value)
  if (!Number.isFinite(cc) || cc <= 0) return undefined
  return `${(cc / 1000).toFixed(1)} L`
}

function kilograms(value: string | undefined): number | undefined {
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? n : undefined
}

/** RDW's rows in the app's vocabulary. Exported for the contract test. */
export function mapVehicle(vehicle: RdwVehicle, fuels: RdwFuel[]): VehicleLookupResult {
  const make = text(vehicle.merk)
  const model = text(vehicle.handelsbenaming)
  const firstRegistered = isoDate(vehicle.datum_eerste_toelating)
  const colour = text(vehicle.eerste_kleur)
  const kerb = kilograms(vehicle.massa_ledig_voertuig)
  const grossMax = kilograms(vehicle.toegestane_maximum_massa_voertuig)
  const exported = text(vehicle.export_indicator)?.toLowerCase()

  const result: VehicleLookupResult = {
    make: make ? makeCase(make) : undefined,
    // RDW often repeats the make in the trade name ("TOYOTA PRIUS PLUS").
    model:
      model && make && model.toUpperCase().startsWith(`${make.toUpperCase()} `)
        ? model.slice(make.length + 1)
        : model,
    year: firstRegistered ? Number(firstRegistered.slice(0, 4)) : undefined,
    licensePlate: text(vehicle.kenteken),
    color: colour && !NO_COLOUR.has(colour.toLowerCase()) ? makeCase(colour) : undefined,
    fuelType: fuelType(fuels),
    engineSize: engineSize(vehicle.cilinderinhoud),
    vehicleClass: text(vehicle.voertuigsoort),
    firstRegistered,
    inspectionDue: isoDate(vehicle.vervaldatum_apk),
    weights: kerb || grossMax ? { kerb, grossMax } : undefined,
    registered: exported === 'nee' ? true : exported === 'ja' ? false : undefined,
  }
  // Drop the keys that came back empty so a form's fill-if-empty sees only values.
  for (const key of Object.keys(result) as (keyof VehicleLookupResult)[]) {
    if (result[key] === undefined) delete result[key]
  }
  return result
}

/** Dutch plates are printed with hyphens, SK-209-X; RDW stores them without. */
export function normalisePlate(plate: string): string {
  return plate.replace(/[\s-]+/g, '').toUpperCase()
}

function appToken(ctx: ConnectorContext): string {
  return typeof ctx.credentials.appToken === 'string' ? ctx.credentials.appToken.trim() : ''
}

function headers(ctx: ConnectorContext): Record<string, string> {
  const token = appToken(ctx)
  return token
    ? { 'X-App-Token': token, Accept: 'application/json' }
    : { Accept: 'application/json' }
}

async function rows<T>(ctx: ConnectorContext, url: string, what: string): Promise<T[]> {
  const res = await ctx.http.fetch(url, { headers: headers(ctx) })
  if (res.status === 401 || res.status === 403) {
    await ctx.log('error', `${what}: app token rejected`, { status: res.status })
    throw new Error('RDW rejected the app token')
  }
  if (res.status === 429) {
    await ctx.log('warn', `${what}: throttled`, { status: res.status })
    throw new Error('RDW is throttling requests, add an app token or try again in a minute')
  }
  if (!res.ok) {
    await ctx.log('error', `${what} failed`, { status: res.status })
    throw new Error(`RDW answered HTTP ${res.status}`)
  }
  const body = (await res.json()) as unknown
  return Array.isArray(body) ? (body as T[]) : []
}

function byPlate(url: string, plate: string): string {
  const u = new URL(url)
  u.searchParams.set('kenteken', plate)
  return u.toString()
}

/**
 * One vehicle by plate. RDW's open data carries no chassis number, so a VIN
 * alone finds nothing. The fuel rows are fetched only once the vehicle row
 * exists, so a miss costs one request.
 */
async function lookupVehicle(
  ctx: ConnectorContext,
  query: VehicleLookupQuery
): Promise<VehicleLookupResult | null> {
  const plate = query.plate?.trim() ? normalisePlate(query.plate) : ''
  if (!plate) {
    await ctx.log('info', 'Vehicle lookup: a plate is needed, RDW open data has no VIN')
    return null
  }
  const vehicles = await rows<RdwVehicle>(ctx, byPlate(VEHICLES_URL, plate), 'Vehicle lookup')
  const vehicle = vehicles[0]
  if (!vehicle) {
    await ctx.log('info', 'Vehicle lookup: no match')
    return null
  }
  const fuels = await rows<RdwFuel>(ctx, byPlate(FUELS_URL, plate), 'Fuel lookup')
  await ctx.log('info', 'Vehicle lookup: match', {
    fuels: fuels.map((f) => f.brandstof_omschrijving ?? '?'),
  })
  return mapVehicle(vehicle, fuels)
}

export const connector: ConnectorServer = {
  manifest,

  async test(ctx) {
    // The data is public, so the test is one row from the dataset. With a
    // token set, Socrata answers 403 to one it does not know, which is the
    // only thing here that can be wrong.
    const res = await ctx.http.fetch(`${VEHICLES_URL}?$limit=1`, { headers: headers(ctx) })
    if (res.status === 401 || res.status === 403) {
      return { ok: false, message: 'RDW rejected the app token' }
    }
    if (!res.ok) return { ok: false, message: `RDW answered HTTP ${res.status}` }
    return { ok: true }
  },

  lookupVehicle,

  jobs: inspectionJobs((ctx, query) => lookupVehicle(ctx, query)),
}
