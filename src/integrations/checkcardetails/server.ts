import { inspectionJobs } from '@/features/integrations/Lib/inspection-sync'
import { makeCase } from '@/features/integrations/Lib/make-case'
import type {
  ConnectorContext,
  ConnectorServer,
  VehicleLookupQuery,
  VehicleLookupResult,
} from '@/features/integrations/Lib/types'
import { manifest } from './manifest'

/**
 * Check Car Details: GET /vehicledata/<data point>?apikey=..&vrm=.. (or
 * &vin=..), answered with the record as bare JSON. Only a successful lookup
 * is billed.
 *
 * Verified against the live service on 28 October 2026:
 * - A plate the register does not know is 404; a VIN it does not know is
 *   400, both with "Vehicle with the provided parameters was not found".
 * - A bad key is 403 "The api key is missing or invalid", no key 400.
 * - A data point the account has not been given is 403 "You are not
 *   authorised to access this data point", in a fifth of a second.
 * - A test key only answers plates and VINs that contain the letter A, and
 *   refuses the rest with 400 "Test API key limitation".
 * - Plates are matched without regard to spaces or case.
 *
 * Plates are personal data, so nothing here writes one into the connection
 * log; the log records outcomes only.
 */
const BASE_URL = 'https://api.checkcardetails.co.uk/vehicledata'

/** On every account: make, model, colour, fuel, engine capacity, tax and MOT. */
const REGISTRATION = 'vehicleregistration'
/** Turned on by the vendor on request: adds the VIN, transmission and weights. */
const FULL = 'ukvehicledata'

/** A plate in the shape of a current one that has never been issued, for proving a key free of charge. */
const PROBE_PLATE = 'AA00AAA'

/** Vehicle Registration, as the live service sends it. */
export interface RegistrationRecord {
  registrationNumber?: string
  make?: string
  model?: string
  colour?: string
  fuelType?: string
  engineCapacity?: number | string
  yearOfManufacture?: number | string
  wheelplan?: string
  typeApproval?: string
  tax?: { taxStatus?: string; taxDueDate?: string }
  mot?: { motStatus?: string; motDueDate?: string }
}

/** The parts of UK Vehicle Data this app stores. */
export interface FullRecord {
  VehicleRegistration?: {
    Vrm?: string
    Vin?: string
    Make?: string
    Model?: string
    Colour?: string
    FuelType?: string
    EngineCapacity?: string | number
    YearOfManufacture?: string | number
    DateFirstRegistered?: string
    Transmission?: string
    TransmissionType?: string
    VehicleClass?: string
    GrossWeight?: number
    Scrapped?: boolean
    Exported?: boolean
  }
  Dimensions?: {
    KerbWeight?: number | null
    GrossVehicleWeight?: number | null
  }
}

function text(value: unknown): string | undefined {
  if (typeof value === 'number') return String(value)
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed ? trimmed : undefined
}

/** The DVLA's fuel words onto the form's options. Gas and steam have no option and are left alone. */
export function fuelType(value: string | undefined): string | undefined {
  if (!value) return undefined
  const v = value.toLowerCase()
  const electric = /electri/.test(v)
  const diesel = /diesel/.test(v)
  const petrol = /petrol/.test(v)
  if (/hybrid/.test(v) || (electric && (diesel || petrol))) return 'hybrid'
  if (electric) return 'electric'
  if (diesel) return 'diesel'
  if (petrol) return 'gasoline'
  return undefined
}

export function transmission(value: string | undefined): string | undefined {
  if (!value) return undefined
  const v = value.toLowerCase()
  if (/cvt|variable|continu/.test(v)) return 'cvt'
  if (/auto/.test(v)) return 'automatic'
  if (/manual/.test(v)) return 'manual'
  return undefined
}

/** Displacement as the form shows it, from cubic centimetres. */
export function engineSize(value: string | number | undefined): string | undefined {
  const cc = Number(text(value))
  if (!Number.isFinite(cc) || cc < 30) return undefined
  return `${(cc / 1000).toFixed(1)} L`
}

/** The date part of 2027-01-26 or 2007-05-14T00:00:00. */
export function isoDate(value: string | undefined): string | undefined {
  const m = value ? /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim()) : null
  return m ? `${m[1]}-${m[2]}-${m[3]}` : undefined
}

/**
 * What the type approval says the vehicle is. The register files cars and
 * motorcycles together, so this is the one place a lookup tells them apart
 * when the account has Vehicle Registration alone.
 */
export function vehicleClass(typeApproval: string | undefined): string | undefined {
  const code = text(typeApproval)?.toUpperCase()
  if (!code) return undefined
  if (code === 'M1') return 'Car'
  if (code === 'M2' || code === 'M3') return 'Bus'
  if (code === 'N1') return 'Light goods vehicle'
  if (code === 'N2' || code === 'N3') return 'Goods vehicle'
  if (/^L[12]E?/.test(code)) return 'Moped'
  if (/^L[34]E?/.test(code)) return 'Motorcycle'
  if (/^L5E?/.test(code)) return 'Tricycle'
  if (/^L[67]E?/.test(code)) return 'Quadricycle'
  return code
}

function year(value: unknown): number | undefined {
  const n = Number(text(value))
  return Number.isFinite(n) && n > 1800 ? n : undefined
}

function kilograms(value: unknown): number | undefined {
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? n : undefined
}

function validVin(value: string | undefined): string | undefined {
  const v = value?.trim().toUpperCase()
  return v && /^[A-HJ-NPR-Z0-9]{11,17}$/.test(v) ? v : undefined
}

function withoutEmpty(result: VehicleLookupResult): VehicleLookupResult {
  // Drop the keys that came back empty so a form's fill-if-empty sees only values.
  for (const key of Object.keys(result) as (keyof VehicleLookupResult)[]) {
    if (result[key] === undefined) delete result[key]
  }
  return result
}

/** Vehicle Registration in the app's vocabulary. Exported for the contract test. */
export function mapRegistration(record: RegistrationRecord): VehicleLookupResult {
  const make = text(record.make)
  const colour = text(record.colour)
  return withoutEmpty({
    make: make ? makeCase(make) : undefined,
    model: text(record.model),
    year: year(record.yearOfManufacture),
    licensePlate: text(record.registrationNumber),
    color: colour ? makeCase(colour) : undefined,
    fuelType: fuelType(text(record.fuelType)),
    engineSize: engineSize(record.engineCapacity),
    vehicleClass: vehicleClass(record.typeApproval),
    inspectionDue: isoDate(text(record.mot?.motDueDate)),
  })
}

/** UK Vehicle Data in the app's vocabulary. Exported for the contract test. */
export function mapFull(record: FullRecord): VehicleLookupResult {
  const reg = record.VehicleRegistration ?? {}
  const make = text(reg.Make)
  const colour = text(reg.Colour)
  const kerb = kilograms(record.Dimensions?.KerbWeight)
  const grossMax = kilograms(record.Dimensions?.GrossVehicleWeight) ?? kilograms(reg.GrossWeight)
  return withoutEmpty({
    make: make ? makeCase(make) : undefined,
    model: text(reg.Model),
    year: year(reg.YearOfManufacture),
    vin: validVin(text(reg.Vin)),
    licensePlate: text(reg.Vrm),
    color: colour ? makeCase(colour) : undefined,
    fuelType: fuelType(text(reg.FuelType)),
    transmission: transmission(text(reg.TransmissionType) ?? text(reg.Transmission)),
    engineSize: engineSize(reg.EngineCapacity),
    vehicleClass: text(reg.VehicleClass),
    firstRegistered: isoDate(text(reg.DateFirstRegistered)),
    weights: kerb || grossMax ? { kerb, grossMax } : undefined,
    registered: reg.Scrapped === true || reg.Exported === true ? false : undefined,
  })
}

/**
 * One vehicle from both answers. Vehicle Registration is the DVLA's current
 * record and has the MOT date, so it leads; UK Vehicle Data fills what it
 * lacks, the VIN above all.
 */
export function merge(
  registration: VehicleLookupResult | null,
  full: VehicleLookupResult | null
): VehicleLookupResult | null {
  if (!registration) return full
  if (!full) return registration
  return withoutEmpty({ ...full, ...registration, vin: full.vin ?? registration.vin })
}

/** Plates are letters and digits; people type them with spaces. */
export function normalisePlate(plate: string): string {
  return plate.replace(/[\s-]+/g, '').toUpperCase()
}

function apiKey(ctx: ConnectorContext): string {
  return typeof ctx.credentials.apiKey === 'string' ? ctx.credentials.apiKey.trim() : ''
}

function url(ctx: ConnectorContext, dataPoint: string, query: { vrm?: string; vin?: string }) {
  const params = new URLSearchParams({ apikey: apiKey(ctx) })
  if (query.vrm) params.set('vrm', query.vrm)
  if (query.vin) params.set('vin', query.vin)
  return `${BASE_URL}/${dataPoint}?${params}`
}

/** The vendor's own words, from a JSON body or a plain one. */
async function messageOf(res: Response): Promise<string> {
  const body = await res.text().catch(() => '')
  try {
    const parsed = JSON.parse(body) as { message?: unknown }
    if (typeof parsed.message === 'string') return parsed.message
  } catch {
    // A plain body, such as "Invalid Request".
  }
  return body.trim()
}

/** How one data point answered: a record, no such vehicle, or not on this account. */
type Answer<T> = { kind: 'record'; record: T } | { kind: 'none' } | { kind: 'not-enabled' }

/**
 * One data point, with every refusal the documentation lists put in words
 * the person at the form can act on. A data point the account has not been
 * given comes back as 'not-enabled' for the caller to decide about.
 */
async function ask<T>(
  ctx: ConnectorContext,
  dataPoint: string,
  query: { vrm?: string; vin?: string }
): Promise<Answer<T>> {
  const res = await ctx.http.fetch(url(ctx, dataPoint, query), {
    headers: { Accept: 'application/json' },
  })
  if (res.ok) return { kind: 'record', record: (await res.json()) as T }
  const message = await messageOf(res)
  const said = message.toLowerCase()
  if (res.status === 404 || said.includes('not found')) return { kind: 'none' }
  if (said.includes('not authorised to access this data point')) return { kind: 'not-enabled' }
  if (said.includes('test api key limitation')) {
    await ctx.log('info', 'Vehicle lookup: refused by the test key', { dataPoint })
    throw new Error(
      'Check Car Details: a test key only looks up plates and VINs that contain the letter A'
    )
  }
  if (said.includes('daily limit')) {
    await ctx.log('warn', 'Vehicle lookup: daily limit reached', { dataPoint })
    throw new Error(
      'Check Car Details: the daily lookup limit is reached, ask Check Car Details support to raise it'
    )
  }
  if (res.status === 400 || res.status === 403) {
    await ctx.log('error', 'Vehicle lookup: API key rejected', { status: res.status, dataPoint })
    throw new Error('Check Car Details rejected the API key')
  }
  await ctx.log('error', 'Vehicle lookup failed', { status: res.status, dataPoint })
  throw new Error(`Check Car Details answered HTTP ${res.status}`)
}

/** The query as the vendor takes it: a plate when there is one, the VIN otherwise. */
function vendorQuery(query: VehicleLookupQuery): { vrm?: string; vin?: string } | null {
  const plate = query.plate?.trim() ? normalisePlate(query.plate) : ''
  if (plate) return { vrm: plate }
  const vin = query.vin?.trim().toUpperCase()
  return vin ? { vin } : null
}

/**
 * Vehicle Registration alone. Enough for the MOT date, which is all the
 * inspection sync needs, at a fifth of the price of the full record.
 */
export async function lookupRegistration(
  ctx: ConnectorContext,
  query: VehicleLookupQuery
): Promise<VehicleLookupResult | null> {
  const q = vendorQuery(query)
  if (!q) return null
  const answer = await ask<RegistrationRecord>(ctx, REGISTRATION, q)
  if (answer.kind === 'not-enabled') {
    throw new Error('Check Car Details: Vehicle Registration is not enabled on this account')
  }
  return answer.kind === 'record' ? mapRegistration(answer.record) : null
}

/**
 * One vehicle by plate or VIN. Both data points are asked side by side, so
 * the full record costs no waiting; an account without UK Vehicle Data is
 * refused that half free of charge and gets the registration record alone.
 */
async function lookupVehicle(
  ctx: ConnectorContext,
  query: VehicleLookupQuery
): Promise<VehicleLookupResult | null> {
  const q = vendorQuery(query)
  if (!q) return null
  const [registration, full] = await Promise.all([
    ask<RegistrationRecord>(ctx, REGISTRATION, q),
    // The full record is extra: when it fails for any other reason, the
    // registration record still fills the form, and its own failure says why.
    ask<FullRecord>(ctx, FULL, q).catch(async (err): Promise<Answer<FullRecord>> => {
      await ctx.log('warn', 'Vehicle lookup: UK Vehicle Data failed', {
        error: err instanceof Error ? err.message : String(err),
      })
      return { kind: 'none' }
    }),
  ])
  if (registration.kind === 'not-enabled' && full.kind !== 'record') {
    throw new Error('Check Car Details: Vehicle Registration is not enabled on this account')
  }
  const result = merge(
    registration.kind === 'record' ? mapRegistration(registration.record) : null,
    full.kind === 'record' ? mapFull(full.record) : null
  )
  await ctx.log('info', result ? 'Vehicle lookup: match' : 'Vehicle lookup: no match', {
    by: q.vrm ? 'plate' : 'vin',
    fullData: full.kind === 'record' ? 'yes' : full.kind === 'not-enabled' ? 'not enabled' : 'no',
  })
  if (result && q.vrm && !result.licensePlate) result.licensePlate = q.vrm
  return result
}

export const connector: ConnectorServer = {
  manifest,

  async test(ctx) {
    if (!apiKey(ctx)) return { ok: false, message: 'Check Car Details: an API key is required' }
    // Every successful lookup is billed, so the key is proved on a plate
    // that was never issued: a good key is told "not found", a bad one is
    // turned away. The plate has an A in it, so a test key passes too.
    try {
      await ask(ctx, REGISTRATION, { vrm: PROBE_PLATE })
      return { ok: true }
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : 'Connection test failed' }
    }
  },

  lookupVehicle,

  // The sync only needs the MOT date, which the cheaper data point has.
  jobs: inspectionJobs(lookupRegistration),
}
