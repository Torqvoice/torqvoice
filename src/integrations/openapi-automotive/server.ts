import type {
  ConnectorContext,
  ConnectorServer,
  VehicleLookupQuery,
  VehicleLookupResult,
} from '@/features/integrations/Lib/types'
import { manifest } from './manifest'

/**
 * Openapi.com Automotive: one GET per vehicle at /<country>-car/<plate>,
 * with the workshop's token as a Bearer. Every 200 is billed to the
 * workshop's wallet, a 404 says no such vehicle, 402 an empty wallet and 406
 * a plate the country's format rejects. Some lookups come back 302 with a
 * request id instead of a record, and /check_id/<id> is polled until the
 * record is ready.
 *
 * Plates are personal data in every country served, so nothing here writes
 * one into the connection log; the log records outcomes only.
 */
const BASE_URL = 'https://automotive.openapi.com'

/** How long the form waits on a lookup that the vendor answers asynchronously. */
const MAX_POLLS = 5
const DEFAULT_POLL_MS = 1000
const MAX_POLL_MS = 3000

/** A request id shaped like the vendor's but never issued, for proving a token without a lookup. */
const PROBE_ID = '000000000000000000000000'

export type Country = 'FR' | 'IT' | 'ES' | 'PT' | 'GB'

const ENDPOINTS: Record<Country, { car: string; bike?: string }> = {
  FR: { car: 'FR-car', bike: 'FR-bike' },
  IT: { car: 'IT-car', bike: 'IT-bike' },
  ES: { car: 'ES-car', bike: 'ES-bike' },
  PT: { car: 'PT-car' },
  GB: { car: 'UK-car', bike: 'UK-bike' },
}

export interface Envelope<T> {
  success?: boolean
  message?: string
  error?: number | null
  data?: T | T[] | null
}

/** What a lookup returns while the vendor is still fetching it. */
export interface Pending {
  state?: string
  id?: string
}

/**
 * The union of what the five car endpoints return. Each country fills a
 * different subset, spells the VIN field differently, and puts the engine
 * in a different unit, so every path is optional and the mapper reads
 * whichever is there.
 */
export interface AutomotiveRecord {
  LicensePlate?: string
  Description?: string
  RegistrationYear?: string
  RegistrationDate?: string
  CarMake?: string
  CarModel?: string
  MakeDescription?: string
  ModelDescription?: string
  /** Cubic centimetres in most countries; France puts its fiscal horsepower here. */
  EngineSize?: string | number
  FuelType?: string
  Fuel?: string
  Transmission?: string
  Colour?: string
  BodyStyle?: string
  VehicleType?: string
  EngineCode?: string
  Vin?: string
  VehicleIdentificationNumber?: string
  /** Spain and Portugal, spelt as the vendor spells it. */
  VechileIdentificationNumber?: string
  GrossWeight?: string
  NetWeight?: string
  /** France only: the SIV record behind the summary. */
  ExtendedData?: {
    EngineCC?: string
    boiteDeVitesse?: string
    numSerieMoteur?: string
    datePremiereMiseCirculation?: string
    genre?: string
  }
}

function isPending(data: unknown): data is Pending {
  return (
    typeof data === 'object' &&
    data !== null &&
    typeof (data as Pending).state === 'string' &&
    typeof (data as Pending).id === 'string'
  )
}

function text(value: unknown): string | undefined {
  if (typeof value === 'number') return String(value)
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed ? trimmed : undefined
}

/** "PEUGEOT" as Peugeot, "alfa romeo" as Alfa Romeo, but BMW, VW and DS stay the initials they are. */
export function titleCase(value: string): string {
  return value
    .split(/(\s+|-)/)
    .map((part) => {
      if (!part.trim() || part === '-') return part
      if (part.length <= 3) return part.toUpperCase()
      return part[0].toUpperCase() + part.slice(1).toLowerCase()
    })
    .join('')
}

/**
 * One fuel for the form's select, from words in five languages. Two fuels
 * named together, such as "Petrol/Electric", make a hybrid; a word the list
 * does not know leaves the field alone rather than guessing.
 */
export function fuelType(value: string | undefined): string | undefined {
  if (!value) return undefined
  const v = value.toLowerCase()
  const hybrid = /hybrid|hybride|ibrid|híbrid|hibrid/.test(v)
  const electric = /electri|électri|elettri|eléctri|elétri/.test(v) || v === 'e'
  const diesel = /diesel|gasoil|gazole|gasóleo|gasoleo|gas-oil/.test(v) || v === 'd'
  const gasoline = /essence|benzin|gasolina|petrol|gasoline|sans plomb/.test(v) || v === 'g'
  if (hybrid || (electric && (diesel || gasoline))) return 'hybrid'
  if (electric) return 'electric'
  if (diesel) return 'diesel'
  if (gasoline) return 'gasoline'
  return undefined
}

export function transmission(value: string | undefined): string | undefined {
  if (!value) return undefined
  const v = value.toLowerCase()
  if (/cvt|variat|variabile|continu/.test(v)) return 'cvt'
  if (/auto/.test(v)) return 'automatic'
  if (/manu|m[ée]cani|meccani|mecáni/.test(v)) return 'manual'
  return undefined
}

/**
 * Displacement as the form shows it, from a value that is cubic centimetres
 * when it is big enough to be. France's top-level EngineSize is fiscal
 * horsepower, a small number, and is left out unless the SIV record gives
 * the real capacity.
 */
export function engineSize(value: string | number | undefined): string | undefined {
  const cc = Number(text(value))
  if (!Number.isFinite(cc) || cc < 100) return undefined
  return `${(cc / 1000).toFixed(1)} L`
}

/** ISO date from the formats the five countries use: 2008-10-22, 17/11/2003, 1/4/2025 and 22102008. */
export function isoDate(value: string | undefined): string | undefined {
  if (!value) return undefined
  const v = value.trim()
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(v)
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(v)
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
  m = /^(\d{2})(\d{2})(\d{4})$/.exec(v)
  if (m) return `${m[3]}-${m[2]}-${m[1]}`
  return undefined
}

function vin(record: AutomotiveRecord): string | undefined {
  for (const candidate of [
    record.Vin,
    record.VehicleIdentificationNumber,
    record.VechileIdentificationNumber,
    record.ExtendedData?.numSerieMoteur,
  ]) {
    const v = text(candidate)?.toUpperCase()
    if (v && /^[A-HJ-NPR-Z0-9]{11,17}$/.test(v)) return v
  }
  return undefined
}

function kilograms(value: string | undefined): number | undefined {
  const n = Number(text(value))
  return Number.isFinite(n) && n > 0 ? n : undefined
}

/** The vendor's record in the app's vocabulary. Exported for the contract test. */
export function mapRecord(record: AutomotiveRecord, plate?: string): VehicleLookupResult {
  const make = text(record.CarMake) ?? text(record.MakeDescription)
  const firstRegistered =
    isoDate(text(record.RegistrationDate)) ??
    isoDate(text(record.ExtendedData?.datePremiereMiseCirculation))
  const yearText = text(record.RegistrationYear) ?? firstRegistered?.slice(0, 4)
  const year = Number(yearText)
  const colour = text(record.Colour)
  const kerb = kilograms(record.NetWeight)
  const grossMax = kilograms(record.GrossWeight)

  const result: VehicleLookupResult = {
    make: make ? titleCase(make) : undefined,
    model: text(record.CarModel) ?? text(record.ModelDescription),
    year: Number.isFinite(year) && year > 1800 ? year : undefined,
    vin: vin(record),
    licensePlate: text(record.LicensePlate) ?? plate,
    color: colour ? titleCase(colour) : undefined,
    fuelType: fuelType(text(record.FuelType) ?? text(record.Fuel)),
    transmission: transmission(
      text(record.Transmission) ?? text(record.ExtendedData?.boiteDeVitesse)
    ),
    engineSize: engineSize(record.ExtendedData?.EngineCC) ?? engineSize(record.EngineSize),
    engineCode: text(record.EngineCode),
    vehicleClass: text(record.BodyStyle),
    firstRegistered,
    weights: kerb || grossMax ? { kerb, grossMax } : undefined,
  }
  // Drop the keys that came back empty so a form's fill-if-empty sees only values.
  for (const key of Object.keys(result) as (keyof VehicleLookupResult)[]) {
    if (result[key] === undefined) delete result[key]
  }
  return result
}

/** Plates are letters and digits; people type them with the spaces and hyphens their country prints. */
export function normalisePlate(plate: string): string {
  return plate.replace(/[\s-]+/g, '').toUpperCase()
}

function token(ctx: ConnectorContext): string {
  return typeof ctx.credentials.token === 'string' ? ctx.credentials.token.trim() : ''
}

function headers(ctx: ConnectorContext): Record<string, string> {
  return { Authorization: `Bearer ${token(ctx)}`, Accept: 'application/json' }
}

/** The country whose registry this connection searches, or null while the setting is unset. */
export function countryOf(ctx: ConnectorContext): Country | null {
  const value = ctx.connection.settings.country
  return typeof value === 'string' && value in ENDPOINTS ? (value as Country) : null
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function pollDelayMs(res: Response): number {
  const header = Number(res.headers.get('retry-after'))
  if (Number.isFinite(header) && header >= 0) return Math.min(header * 1000, MAX_POLL_MS)
  return DEFAULT_POLL_MS
}

/**
 * The vendor's reasons, in words the person at the form can act on. Every
 * status the spec lists is named; anything else is reported as the HTTP
 * status it was.
 */
async function reject(ctx: ConnectorContext, res: Response, what: string): Promise<never> {
  if (res.status === 401 || res.status === 403) {
    await ctx.log('error', `${what}: token rejected`, { status: res.status })
    throw new Error('Openapi rejected the token')
  }
  if (res.status === 402) {
    await ctx.log('error', `${what}: no credit left`, { status: res.status })
    throw new Error('Openapi: the wallet has no credit left, top it up on console.openapi.com')
  }
  if (res.status === 406) {
    await ctx.log('info', `${what}: plate format refused`, { status: res.status })
    throw new Error('Openapi: that is not a valid plate for the chosen country')
  }
  if (res.status === 417) {
    await ctx.log('warn', `${what}: service unavailable`, { status: res.status })
    throw new Error('Openapi: the registry is not available at the moment, try again later')
  }
  await ctx.log('error', `${what} failed`, { status: res.status })
  throw new Error(`Openapi answered HTTP ${res.status}`)
}

/** The record out of an envelope, or null when the vendor says there is none. */
function recordOf(body: Envelope<AutomotiveRecord | Pending>): AutomotiveRecord | Pending | null {
  const data = Array.isArray(body.data) ? body.data[0] : body.data
  if (!data || typeof data !== 'object') return null
  return data
}

/**
 * One vehicle from one endpoint. A 302 or a 200 carrying a request id means
 * the vendor is still fetching, and the status endpoint is asked again after
 * the wait it names, a handful of times, before the lookup gives up.
 */
async function fetchRecord(
  ctx: ConnectorContext,
  endpoint: string,
  plate: string
): Promise<AutomotiveRecord | null> {
  let res = await ctx.http.fetch(`${BASE_URL}/${endpoint}/${encodeURIComponent(plate)}`, {
    headers: headers(ctx),
  })
  for (let poll = 0; ; poll++) {
    if (res.status === 404) return null
    if (!res.ok && res.status !== 302) await reject(ctx, res, 'Vehicle lookup')
    const body = (await res.json()) as Envelope<AutomotiveRecord | Pending>
    const data = recordOf(body)
    if (!data) return null
    if (!isPending(data)) return data
    if (poll >= MAX_POLLS) {
      await ctx.log('warn', 'Vehicle lookup: still pending after polling', { polls: poll })
      throw new Error('Openapi is still fetching the vehicle, try again in a moment')
    }
    await sleep(pollDelayMs(res))
    res = await ctx.http.fetch(`${BASE_URL}/check_id/${encodeURIComponent(data.id as string)}`, {
      headers: headers(ctx),
    })
  }
}

/** One vehicle by plate. This registry has no VIN search, so a VIN alone finds nothing. */
async function lookupVehicle(
  ctx: ConnectorContext,
  query: VehicleLookupQuery
): Promise<VehicleLookupResult | null> {
  const plate = query.plate?.trim() ? normalisePlate(query.plate) : ''
  if (!plate) {
    await ctx.log('info', 'Vehicle lookup: a plate is needed, this registry has no VIN search')
    return null
  }
  const country = countryOf(ctx)
  if (!country) throw new Error('Openapi Automotive: choose a country on the integration page')
  const endpoints = ENDPOINTS[country]
  const car = await fetchRecord(ctx, endpoints.car, plate)
  if (car) {
    await ctx.log('info', 'Vehicle lookup: match', { endpoint: endpoints.car })
    return mapRecord(car, plate)
  }
  if (ctx.connection.settings.bikes === true && endpoints.bike) {
    const bike = await fetchRecord(ctx, endpoints.bike, plate)
    if (bike) {
      await ctx.log('info', 'Vehicle lookup: match', { endpoint: endpoints.bike })
      return mapRecord(bike, plate)
    }
  }
  await ctx.log('info', 'Vehicle lookup: no match', { country })
  return null
}

export const connector: ConnectorServer = {
  manifest,

  async test(ctx) {
    if (!token(ctx)) return { ok: false, message: 'Openapi Automotive: a token is required' }
    if (!countryOf(ctx)) {
      return { ok: false, message: 'Openapi Automotive: choose the country to search' }
    }
    // There is no ping endpoint and every lookup is billed, so the request
    // status endpoint is asked about an id that was never issued: a good
    // token gets "not found" or "not valid", a bad one is turned away.
    const res = await ctx.http.fetch(`${BASE_URL}/check_id/${PROBE_ID}`, { headers: headers(ctx) })
    if (res.status === 401 || res.status === 403) {
      return { ok: false, message: 'Openapi rejected the token' }
    }
    if (!res.ok && ![400, 404, 406].includes(res.status)) {
      return { ok: false, message: `Openapi answered HTTP ${res.status}` }
    }
    return { ok: true }
  },

  lookupVehicle,

  jobs: {},
}
