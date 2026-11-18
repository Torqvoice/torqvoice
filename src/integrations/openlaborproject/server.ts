import { repairDataJobs, settleKeyCheck } from '@/features/integrations/Lib/repair-data'
import {
  type ConnectorContext,
  type ConnectorServer,
  type FluidSpec,
  type LaborTime,
  type RepairDataAnswer,
  type RepairDataConfidence,
  RepairDataKeyRejected,
  type RepairDataQuery,
  type RepairDataReply,
  type RepairDataVariant,
} from '@/features/integrations/Lib/types'
import { manifest, SERVER_KEY_ENV } from './manifest'

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
 *   calls a day. Chris at Open Labor Project confirmed on 3 November 2026
 *   that every paid plan may keep what it fetched for as long as it stays
 *   subscribed.
 * - Every reply names the key's plan in x-ratelimit-tier: "hobbyist" for a
 *   free key. A whole-model reply on a free key also carries meta.freeTier.
 *   That is what decides whether an answer may be stored.
 *
 * Requests go out with plain fetch, not the platform's retrying client: a
 * person is waiting on the dialog, and a key that has used its day's calls
 * is not helped by being asked again.
 */
const BASE_URL = 'https://openlaborproject.com/api/v1'
const TIMEOUT_MS = 20_000

/** The connection test's lookup: one job on a vehicle the service has listed since launch. */
const TEST_QUERY = new URLSearchParams({
  make: 'ford',
  model: 'f-150',
  year: '2018',
  engine: '5.0l-v8-coyote',
  job: 'water-pump',
}).toString()

interface Envelope {
  data?: unknown
  meta?: Record<string, unknown>
  /** A model it does not know comes with the slugs it does know for that make. */
  error?: { code?: string; message?: string; availableModels?: unknown } | null
}

/** Plan names Open Labor Project gives a free key. */
const FREE_TIERS = new Set(['hobbyist', 'free'])

/**
 * Whether the key's plan lets the answer be kept: a paid tier named in the
 * header, and no sign of the free tier in the body. A reply that names no
 * plan is not kept.
 */
export function keepAllowed(headers: Headers, body: Envelope): boolean {
  const tier = headers.get('x-ratelimit-tier')?.trim().toLowerCase()
  if (!tier || FREE_TIERS.has(tier)) return false
  return !(body.meta && 'freeTier' in body.meta)
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

/**
 * Words other languages use where the service's slugs say "series" or
 * "class": a Norwegian or Dutch shop writes BMW "3-Serie", a German one
 * "3er" or Mercedes "C-Klasse".
 */
const MODEL_WORDS: [RegExp, string][] = [
  [/\b(\d)er\b/g, '$1 series'],
  [/\bseri(?:e|en)\b/g, 'series'],
  [/\breihe\b/g, 'series'],
  [/\bklasse?\b/g, 'class'],
  [/\bclasse\b/g, 'class'],
  [/\bclase\b/g, 'class'],
]

/**
 * The model the way the service likely spells it: a chassis code in
 * brackets left out and the local word for "series" or "class" in English.
 * "3-Serie (E9*)" is 3-series, "C-Klasse" is c-class.
 */
export function modelSlug(model: string): string {
  let s = model
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\([^)]*\)/g, ' ')
  for (const [pattern, to] of MODEL_WORDS) s = s.replace(pattern, to)
  return slug(s)
}

/**
 * The service's own slug for a model the workshop wrote its own way, picked
 * from the slugs a "not found" reply lists: the one that reads the same
 * once punctuation is set aside, else the longest one the name starts with
 * ("5-Serie F11" is 5-series). Null when none fits.
 */
export function resolveModel(model: string, available: readonly string[]): string | null {
  const own = modelSlug(model).replace(/-/g, '')
  if (!own) return null
  let best: string | null = null
  for (const candidate of available) {
    const key = modelSlug(candidate).replace(/-/g, '')
    if (!key) continue
    if (key === own) return candidate
    const longer = !best || key.length > modelSlug(best).replace(/-/g, '').length
    if (key.length >= 2 && own.startsWith(key) && longer) best = candidate
  }
  return best
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

/** The workshop's own key, else the one the server holds for every workshop, when it holds one. */
function apiKey(ctx: ConnectorContext): string {
  const own = typeof ctx.credentials.apiKey === 'string' ? ctx.credentials.apiKey.trim() : ''
  return own || process.env[SERVER_KEY_ENV]?.trim() || ''
}

/** The model, or the variant asked for, is not in the service's list. */
class NotFound extends Error {
  constructor(
    code: string,
    /** The slugs the service does know for the make. */
    readonly availableModels: string[]
  ) {
    super(code)
  }
}

/**
 * Any other refusal of what was asked, such as a VIN the service decodes
 * but has no data for (400 MISSING_PARAMS). Kept apart so a VIN attempt
 * that ends here reads as "not in the guide" rather than as a failure.
 */
class Refused extends Error {}

function availableModelsOf(body: Envelope): string[] {
  const list = body.error?.availableModels
  return Array.isArray(list) ? list.filter((m): m is string => typeof m === 'string') : []
}

/**
 * One call, and whether its answer may be kept. A model the service does
 * not know throws NotFound for the caller to try the VIN, a refused key
 * throws RepairDataKeyRejected, and every other refusal is put in words the
 * person at the dialog can act on.
 */
async function call(
  ctx: ConnectorContext,
  path: string,
  params: URLSearchParams
): Promise<{ body: Envelope; keep: boolean }> {
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
  if (res.ok) return { body, keep: keepAllowed(res.headers, body) }
  const code = body.error?.code ?? ''
  const message = body.error?.message?.trim() ?? ''
  if (res.status === 404) throw new NotFound(code || 'not found', availableModelsOf(body))
  if (res.status === 401 || code === 'INVALID_API_KEY') {
    await ctx.log('error', 'Open Labor Project rejected the API key', { path })
    throw new RepairDataKeyRejected('Open Labor Project rejected the API key')
  }
  if (res.status === 429) {
    await ctx.log('warn', 'Open Labor Project: call limit reached', { path, code })
    throw new Error(
      message
        ? `Open Labor Project: ${message}`
        : 'Open Labor Project: this key has used all its calls for now, try again later'
    )
  }
  const words = message
    ? `Open Labor Project: ${message}`
    : `Open Labor Project answered HTTP ${res.status}`
  if (res.status === 400 || res.status === 422) throw new Refused(words)
  await ctx.log('error', 'Open Labor Project lookup failed', { path, status: res.status, code })
  throw new Error(words)
}

/** The query string: the vehicle, then the variant and the one item when asked for. */
function paramsFor(
  query: RepairDataQuery,
  by: 'model' | 'vin',
  itemParam: 'job' | 'q',
  modelId?: string
) {
  const params = new URLSearchParams()
  if (by === 'vin' && query.vin) {
    params.set('vin', query.vin)
  } else {
    params.set('make', slug(query.make))
    params.set('model', modelId ?? modelSlug(query.model))
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
 * By model name first, so one call answers for every engine, under the
 * name another lookup already found when there is one. A name the service
 * does not know is matched against the slugs its "not found" reply lists
 * and asked once more. Only a model it knows under no name we can find is
 * tried by VIN, and a VIN it cannot place is "not found", not a failure.
 * Every attempt costs a call and an unknown vehicle can take the service
 * half a minute to answer, so nothing is asked that cannot change the
 * answer.
 */
async function lookup<T>(
  ctx: ConnectorContext,
  query: RepairDataQuery,
  path: string,
  listKey: 'laborTimes' | 'fluidSpecs',
  itemParam: 'job' | 'q',
  map: (row: never) => T | null
): Promise<RepairDataReply<T>> {
  const vin = vinOf(query)
  // A model nobody knows says nothing about the plan, so it is not kept.
  let keep = false
  const where = { make: query.make, model: query.model, year: query.year }

  const ask = async (
    by: 'model' | 'vin',
    modelId?: string
  ): Promise<RepairDataAnswer<T> | null> => {
    const reply = await call(
      ctx,
      path,
      paramsFor({ ...query, vin: vin ?? undefined }, by, itemParam, modelId)
    )
    keep = reply.keep
    const body = reply.body
    const found = toAnswer(body.data, listKey, map, query.variant?.engineId)
    const region = str(body.meta?.region)
    const answer: RepairDataAnswer<T> | null = found
      ? {
          ...found,
          matchedBy: by,
          modelId: by === 'model' ? modelId : found.model ? modelSlug(found.model) : undefined,
          ...(region ? { region } : {}),
        }
      : null
    const locked = answer?.variants.reduce(
      (n, v) => n + v.items.filter((i) => (i as { locked?: boolean }).locked).length,
      0
    )
    // Make, model and year only: the VIN identifies one vehicle and stays out of the log.
    await ctx.log('info', answer ? `${path}: match` : `${path}: no match`, {
      by,
      ...where,
      modelId: by === 'model' ? modelId : null,
      variants: answer?.variants.length ?? 0,
      locked: locked ?? 0,
      item: query.item ?? null,
      kept: keep,
    })
    return answer
  }
  const notFound = (by: 'model' | 'vin', modelId?: string) =>
    ctx.log('info', `${path}: not found`, { by, ...where, modelId: modelId ?? null })
  const none = (): RepairDataReply<T> => ({ answer: null, keep })

  const first = query.modelId ?? modelSlug(query.model)
  try {
    const answer = await ask('model', first)
    return answer ? { answer, keep } : none()
  } catch (err) {
    if (!(err instanceof NotFound)) throw err
    await notFound('model', first)
    // Found under this name before, or a name the service lists: it knows
    // the model and has nothing for this year or engine. A VIN cannot help.
    if (query.modelId || err.availableModels.includes(first)) return none()
    const other = resolveModel(query.model, err.availableModels)
    if (other && other !== first) {
      try {
        const answer = await ask('model', other)
        return answer ? { answer, keep } : none()
      } catch (again) {
        if (!(again instanceof NotFound)) throw again
        await notFound('model', other)
        return none()
      }
    }
  }

  if (!vin) return none()
  try {
    const answer = await ask('vin')
    return answer ? { answer, keep } : none()
  } catch (err) {
    if (!(err instanceof NotFound || err instanceof Refused)) throw err
    await notFound('vin')
    return none()
  }
}

/**
 * Whether the key is still on a plan that may keep its answers, from one
 * cheap call. Null when the reply does not say, such as when the key has
 * used its calls for the day.
 */
async function plan(ctx: ConnectorContext): Promise<{ keep: boolean | null }> {
  const res = await fetch(`${BASE_URL}/labor-times?${TEST_QUERY}`, {
    headers: { 'x-api-key': apiKey(ctx), Accept: 'application/json' },
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: 'no-store',
  })
  const body = (await res.json().catch(() => ({}))) as Envelope
  if (res.status === 401 || body.error?.code === 'INVALID_API_KEY') {
    throw new RepairDataKeyRejected('Open Labor Project rejected the API key')
  }
  if (!res.headers.get('x-ratelimit-tier')) return { keep: null }
  return { keep: keepAllowed(res.headers, res.ok ? body : {}) }
}

export const connector: ConnectorServer = {
  manifest,

  async test(ctx) {
    if (!apiKey(ctx)) return { ok: false, message: 'Open Labor Project: an API key is required' }
    // One job on one vehicle the service lists: a single call, and one it
    // can answer. A call with no vehicle shows up as an error on their side.
    // A key that has used its calls for the day is still a good key, and a
    // vehicle gone from their list says nothing about the key either.
    try {
      const res = await fetch(`${BASE_URL}/labor-times?${TEST_QUERY}`, {
        headers: { 'x-api-key': apiKey(ctx), Accept: 'application/json' },
        signal: AbortSignal.timeout(TIMEOUT_MS),
        cache: 'no-store',
      })
      if (res.status === 401) {
        await settleKeyCheck(ctx, manifest, 'rejected')
        return { ok: false, message: 'Open Labor Project rejected the API key' }
      }
      if (res.ok || res.status === 404 || res.status === 429) {
        // A reply that names the plan settles what may stay stored.
        if (res.headers.get('x-ratelimit-tier')) {
          const body = (await res.json().catch(() => ({}))) as Envelope
          await settleKeyCheck(
            ctx,
            manifest,
            keepAllowed(res.headers, res.ok ? body : {}) ? 'paid' : 'free'
          )
        }
        return { ok: true }
      }
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

  repairDataPlan: plan,

  jobs: repairDataJobs(manifest, plan),
}
