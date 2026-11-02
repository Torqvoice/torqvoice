import type {
  ConnectorContext,
  ConnectorServer,
  FluidSpec,
  LaborTime,
  RepairDataAnswer,
  RepairDataConfidence,
  RepairDataQuery,
  RepairDataVariant,
} from '@/features/integrations/Lib/types'
import { manifest } from './manifest'

/**
 * Open Labor Project: GET /api/v1/labor-times and /api/v1/fluid-specs with
 * the key in an x-api-key header, answered as { data, meta, error }.
 *
 * Verified against the live service on 2 November 2026 with a free key:
 * - make, model (both as the service's lower-case slugs, "ford", "f-150")
 *   and year give every engine and drivetrain of that model year under
 *   data.engines. A vin instead, or an engine slug or vehicle_id beside the
 *   model, gives one variant under data.vehicle with the list beside it.
 * - job=<slug> on labor-times and q=<system> on fluid-specs narrow the list
 *   to that one job or system.
 * - A free key gets every job and system listed but almost all of them
 *   "locked", values null; asking for one alone unlocks it. A paid key gets
 *   every value at once.
 * - A model the service does not know is 404 MODEL_OR_VARIANT_NOT_FOUND, a
 *   bad key 401 INVALID_API_KEY, a call with no vehicle 400 MISSING_PARAMS.
 * - Each row carries a confidence: oem_matched or oem_verified, high, medium,
 *   or estimated, which the service says is AI-derived and not checked
 *   against a maker's guide.
 * - Replies say cache-control: private, no-store, and a free key has ten
 *   calls a day.
 *
 * Requests go out with plain fetch, not the platform's retrying client: a
 * person is waiting on the dialog, and a key that has used its day's calls
 * is not helped by being asked again.
 */
const BASE_URL = 'https://openlaborproject.com/api/v1'
const TIMEOUT_MS = 20_000

interface Envelope {
  data?: unknown
  meta?: Record<string, unknown>
  error?: { code?: string; message?: string } | null
}

/** One engine and drivetrain as the service describes it. */
interface RawVariant {
  vehicleId?: string | null
  make?: string
  model?: string
  engine?: string
  engineSlug?: string
  drivetrain?: string | null
}

export interface RawLaborTime {
  job?: string
  jobSlug?: string
  category?: string
  hours?: number | null
  lowRange?: number | null
  highRange?: number | null
  confidence?: string | null
  locked?: boolean
}

export interface RawFluidSpec {
  system?: string
  systemType?: string
  fluidType?: string | null
  fluidSpec?: string | null
  capacityQuarts?: number | null
  capacityLiters?: number | null
  drainRefillQuarts?: number | null
  drainRefillLiters?: number | null
  changeIntervalMiles?: number | null
  changeIntervalKm?: number | null
  notes?: string | null
  confidence?: string | null
  locked?: boolean
}

/** Make and model as the service spells them in its URLs: "Mercedes-Benz" is mercedes-benz. */
export function slug(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export function confidenceOf(value: unknown): RepairDataConfidence | null {
  if (typeof value !== 'string') return null
  const v = value.toLowerCase()
  if (v.startsWith('oem')) return 'oem'
  if (v === 'high' || v === 'medium') return v
  if (v === 'estimated' || v === 'low') return 'estimated'
  return null
}

function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

export function mapLaborTime(raw: RawLaborTime): LaborTime | null {
  const id = str(raw.jobSlug)
  const name = str(raw.job)
  if (!id || !name) return null
  const hours = num(raw.hours)
  return {
    id,
    name,
    category: str(raw.category) ?? 'misc',
    hours,
    low: num(raw.lowRange),
    high: num(raw.highRange),
    confidence: confidenceOf(raw.confidence),
    locked: raw.locked === true || hours === null,
  }
}

export function mapFluidSpec(raw: RawFluidSpec): FluidSpec | null {
  const id = str(raw.systemType)
  const system = str(raw.system)
  if (!id || !system) return null
  const capacityLiters = num(raw.capacityLiters)
  const capacityQuarts = num(raw.capacityQuarts)
  const fluid = str(raw.fluidType)
  return {
    id,
    system,
    fluid,
    spec: str(raw.fluidSpec),
    capacityLiters,
    capacityQuarts,
    drainRefillLiters: num(raw.drainRefillLiters),
    drainRefillQuarts: num(raw.drainRefillQuarts),
    intervalKm: num(raw.changeIntervalKm),
    intervalMiles: num(raw.changeIntervalMiles),
    notes: str(raw.notes),
    confidence: confidenceOf(raw.confidence),
    locked:
      raw.locked === true || (fluid === null && capacityLiters === null && capacityQuarts === null),
  }
}

/**
 * The engine's id. A one-system fluids reply leaves engineSlug out, so the
 * engine asked for stands in, else the name the way the service writes its
 * slugs ("2.0L I4" is 2.0l-i4).
 */
function engineIdOf(raw: RawVariant, asked: string | undefined): string | null {
  const own = str(raw.engineSlug)
  if (own) return own
  if (asked) return asked
  const name = str(raw.engine)
  return name ? name.toLowerCase().replace(/\s+/g, '-') : null
}

function variantOf<T>(
  raw: RawVariant,
  list: unknown,
  map: (row: never) => T | null,
  askedEngine?: string
): RepairDataVariant<T> | null {
  const engineId = engineIdOf(raw, askedEngine)
  if (!engineId) return null
  const rows = Array.isArray(list) ? list : []
  return {
    engineId,
    drivetrain: str(raw.drivetrain),
    vehicleId: str(raw.vehicleId),
    engine: str(raw.engine) ?? engineId,
    items: rows.map((row) => map(row as never)).filter((x): x is T => x !== null),
  }
}

/**
 * Either shape of reply in one: the whole model year under data.engines, or
 * one variant under data.vehicle. Exported for the contract test.
 */
export function toAnswer<T>(
  data: unknown,
  listKey: 'laborTimes' | 'fluidSpecs',
  map: (row: never) => T | null,
  askedEngine?: string
): RepairDataAnswer<T> | null {
  if (!data || typeof data !== 'object') return null
  const d = data as Record<string, unknown>
  if (Array.isArray(d.engines)) {
    const variants = (d.engines as Record<string, unknown>[])
      .map((e) => variantOf(e as RawVariant, e[listKey], map))
      .filter((v): v is RepairDataVariant<T> => v !== null)
    if (variants.length === 0) return null
    return { make: str(d.make) ?? '', model: str(d.model) ?? '', variants }
  }
  if (d.vehicle && typeof d.vehicle === 'object') {
    const vehicle = d.vehicle as RawVariant
    const variant = variantOf(vehicle, d[listKey], map, askedEngine)
    if (!variant) return null
    return { make: str(vehicle.make) ?? '', model: str(vehicle.model) ?? '', variants: [variant] }
  }
  return null
}

function apiKey(ctx: ConnectorContext): string {
  return typeof ctx.credentials.apiKey === 'string' ? ctx.credentials.apiKey.trim() : ''
}

class NotFound extends Error {}

/**
 * One call. A model the service does not know throws NotFound for the
 * caller to try the VIN; every other refusal is put in words the person at
 * the dialog can act on.
 */
async function call(
  ctx: ConnectorContext,
  path: string,
  params: URLSearchParams
): Promise<Envelope> {
  let res: Response
  try {
    res = await fetch(`${BASE_URL}/${path}?${params}`, {
      headers: { 'x-api-key': apiKey(ctx), Accept: 'application/json' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: 'no-store',
    })
  } catch (err) {
    await ctx.log('error', 'Open Labor Project could not be reached', {
      path,
      error: err instanceof Error ? err.message : String(err),
    })
    throw new Error('Open Labor Project could not be reached, try again in a moment')
  }
  const body = (await res.json().catch(() => ({}))) as Envelope
  if (res.ok) return body
  const code = body.error?.code ?? ''
  const message = body.error?.message?.trim() ?? ''
  if (res.status === 404) throw new NotFound(code || 'not found')
  if (res.status === 401 || code === 'INVALID_API_KEY') {
    await ctx.log('error', 'Open Labor Project rejected the API key', { path })
    throw new Error('Open Labor Project rejected the API key')
  }
  if (res.status === 429) {
    await ctx.log('warn', 'Open Labor Project: call limit reached', { path, code })
    throw new Error(
      message
        ? `Open Labor Project: ${message}`
        : 'Open Labor Project: this key has used all its calls for now, try again later'
    )
  }
  await ctx.log('error', 'Open Labor Project lookup failed', { path, status: res.status, code })
  throw new Error(
    message ? `Open Labor Project: ${message}` : `Open Labor Project answered HTTP ${res.status}`
  )
}

/** The query string: the vehicle, then the variant and the one item when asked for. */
function paramsFor(query: RepairDataQuery, by: 'model' | 'vin', itemParam: 'job' | 'q') {
  const params = new URLSearchParams()
  if (by === 'vin' && query.vin) {
    params.set('vin', query.vin)
  } else {
    params.set('make', slug(query.make))
    params.set('model', slug(query.model))
    params.set('year', String(query.year))
  }
  if (query.variant) {
    params.set('engine', query.variant.engineId)
    if (query.variant.vehicleId) params.set('vehicle_id', query.variant.vehicleId)
  }
  if (query.item) params.set(itemParam, query.item)
  return params
}

/** A plausible VIN, which the service decodes when it cannot find the model by name. */
function vinOf(query: RepairDataQuery): string | null {
  const vin = query.vin?.trim().toUpperCase()
  return vin && /^[A-HJ-NPR-Z0-9]{17}$/.test(vin) ? vin : null
}

/**
 * By model name first, so one call answers for every engine. A model the
 * service spells differently ("F150" for its "f-150") is found from the VIN
 * instead, when the vehicle has one.
 */
async function lookup<T>(
  ctx: ConnectorContext,
  query: RepairDataQuery,
  path: string,
  listKey: 'laborTimes' | 'fluidSpecs',
  itemParam: 'job' | 'q',
  map: (row: never) => T | null
): Promise<RepairDataAnswer<T> | null> {
  const vin = vinOf(query)
  const attempts: ('model' | 'vin')[] = vin ? ['model', 'vin'] : ['model']
  for (const by of attempts) {
    try {
      const body = await call(
        ctx,
        path,
        paramsFor({ ...query, vin: vin ?? undefined }, by, itemParam)
      )
      const answer = toAnswer(body.data, listKey, map, query.variant?.engineId)
      const locked = answer?.variants.reduce(
        (n, v) => n + v.items.filter((i) => (i as { locked?: boolean }).locked).length,
        0
      )
      // Make, model and year only: the VIN identifies one vehicle and stays out of the log.
      await ctx.log('info', answer ? `${path}: match` : `${path}: no match`, {
        by,
        make: query.make,
        model: query.model,
        year: query.year,
        variants: answer?.variants.length ?? 0,
        locked: locked ?? 0,
        item: query.item ?? null,
      })
      if (answer) return answer
    } catch (err) {
      if (!(err instanceof NotFound)) throw err
      await ctx.log('info', `${path}: not found`, {
        by,
        make: query.make,
        model: query.model,
        year: query.year,
      })
    }
  }
  return null
}

export const connector: ConnectorServer = {
  manifest,

  async test(ctx) {
    if (!apiKey(ctx)) return { ok: false, message: 'Open Labor Project: an API key is required' }
    // A call with no vehicle is the cheapest proof there is: a good key is
    // told what is missing, a bad one is turned away before that.
    try {
      const res = await fetch(`${BASE_URL}/labor-times`, {
        headers: { 'x-api-key': apiKey(ctx), Accept: 'application/json' },
        signal: AbortSignal.timeout(TIMEOUT_MS),
        cache: 'no-store',
      })
      if (res.ok || res.status === 400) return { ok: true }
      if (res.status === 401)
        return { ok: false, message: 'Open Labor Project rejected the API key' }
      return { ok: false, message: `Open Labor Project answered HTTP ${res.status}` }
    } catch {
      return { ok: false, message: 'Open Labor Project could not be reached' }
    }
  },

  laborTimes: (ctx, query) =>
    lookup(ctx, query, 'labor-times', 'laborTimes', 'job', (row: RawLaborTime) =>
      mapLaborTime(row)
    ),

  fluidSpecs: (ctx, query) =>
    lookup(ctx, query, 'fluid-specs', 'fluidSpecs', 'q', (row: RawFluidSpec) => mapFluidSpec(row)),

  jobs: {},
}
