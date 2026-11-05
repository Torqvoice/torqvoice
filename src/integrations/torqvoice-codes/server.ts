import { z } from 'zod'
import {
  type ConnectorContext,
  type ConnectorServer,
  type FaultCodeAnswer,
  type FaultCodeFix,
  type FaultCodeFixInput,
  type FaultCodeFixRefusal,
  type FaultCodeMeaning,
  type FaultCodeOwnFix,
  type FaultCodeReport,
  type FaultCodeReportStatus,
  type FaultCodeSearchHit,
  FaultCodesUnavailable,
  type FaultCodeText,
  type FaultCodeVehicle,
} from '@/features/integrations/Lib/types'
import { isManufacturerCode } from '@/features/fault-codes/Lib/codes'
import { manifest, SERVER_KEY_ENV, SERVICE_URL_ENV } from './manifest'

/**
 * Torqvoice Codes, the code service: JSON over HTTP with a bearer key, as
 * described in the service's API contract (v1).
 *
 * - POST /v1/lookups takes every code of a job at once (at most 50) and
 *   answers each with found and, when found, its meaning.
 * - GET /v1/codes/{code} is one code with details; 404 when the service has
 *   no such code.
 * - GET /v1/search?q= matches a code prefix or the words of a title.
 * - POST and GET /v1/definition-reports carry "this meaning is wrong".
 * - /v1/fixes shares what fixed a code, photos included (multipart), reads
 *   how its review stands and withdraws it; /v1/codes/{code}/fixes lists the
 *   published ones and /v1/fixes/{id}/photos/{n} serves their photos.
 *
 * Every call has a short timeout, because a person is typing or a page is
 * drawing while it runs, and nothing here retries: a meaning that does not
 * come back in time shows as "not available right now" and fills in on the
 * next look. Any failure is a FaultCodesUnavailable, never the raw error.
 */

/** A lookup of the codes on a job or in a scan. */
const LOOKUP_TIMEOUT_MS = 1500
/** The search palette asks on every keystroke; it must never hold the other results up. */
const SEARCH_TIMEOUT_MS = 800
/** Sending a report is one tap that the person waits on. */
const REPORT_TIMEOUT_MS = 3000
/** Sharing a fix waits while the service re-encodes up to four photos. */
const SHARE_TIMEOUT_MS = 30_000
/** A photo for a card on the code page. */
const PHOTO_TIMEOUT_MS = 5000
/** The connect page's check, which can afford a little longer. */
const TEST_TIMEOUT_MS = 5000
/** What the service accepts in one lookup. */
export const MAX_CODES_PER_LOOKUP = 50

// ---- the service's JSON ----------------------------------------------------

const localizedSchema = z.object({
  text: z.string(),
  lang: z.string().catch('en'),
  machine_translated: z.boolean().catch(false),
})

const flagsSchema = z
  .object({
    warning_light: z.boolean().catch(false),
    emissions: z.boolean().catch(false),
    drive_cycle: z.boolean().catch(false),
    limp_mode: z.boolean().catch(false),
  })
  .catch({ warning_light: false, emissions: false, drive_cycle: false, limp_mode: false })

const SECTION_KINDS = [
  'how_it_works',
  'meaning',
  'causes',
  'manufacturer',
  'related',
  'diagnosis',
  'other',
] as const

const sectionSchema = z.object({
  // A kind added to the contract later reads as "other" rather than dropping the text.
  kind: z.enum(SECTION_KINDS).catch('other'),
  text: localizedSchema,
})

const causeSchema = z.object({
  key: z.string(),
  likelihood: z.enum(['low', 'medium', 'high']).catch('medium'),
  label: localizedSchema,
})

const meaningSchema = z.object({
  system: z.enum(['P', 'C', 'B', 'U']),
  category: z.string().catch(''),
  scope: z.enum(['generic', 'make', 'model', 'engine']).catch('generic'),
  source: z
    .enum(['standard', 'manufacturer', 'scan_report', 'workshop', 'editor'])
    .catch('standard'),
  version: z.number().int().catch(1),
  verified: z.boolean().catch(false),
  pending_check: z.boolean().catch(false),
  title: localizedSchema,
  flags: flagsSchema,
  related: z.array(z.object({ code: z.string(), title: z.string().optional() })).catch([]),
  details: z
    .object({
      description: localizedSchema.optional(),
      sections: z.array(sectionSchema).optional(),
      causes: z.array(causeSchema).catch([]),
    })
    .optional()
    .catch(undefined),
})

const answerSchema = z.object({
  code: z.string(),
  found: z.boolean(),
  // Both added to the contract later; the app works the range out itself
  // when the service does not say.
  type: z.string().optional().catch(undefined),
  range: z.enum(['standard', 'manufacturer']).optional().catch(undefined),
  meaning: meaningSchema.optional(),
})

const lookupReplySchema = z.object({ results: z.array(answerSchema) })
const searchReplySchema = z.object({
  results: z.array(z.object({ code: z.string(), title: localizedSchema })),
})
const reportReplySchema = z.object({
  id: z.string(),
  status: z.enum(['open', 'resolved']).catch('open'),
})
const reportStatusReplySchema = z.object({
  reports: z.array(
    z.object({
      id: z.string(),
      code: z.string(),
      status: z.enum(['open', 'resolved']).catch('open'),
      outcome: z.enum(['fixed', 'no_change', 'duplicate']).nullish().catch(null),
      resolved_at: z.string().nullish().catch(null),
      message: z.string().nullish().catch(null),
    })
  ),
})

const fixVehicleSchema = z
  .object({
    make: z.string().optional().catch(undefined),
    model: z.string().optional().catch(undefined),
    year: z.number().int().optional().catch(undefined),
    engine: z.string().optional().catch(undefined),
  })
  .nullish()
  .catch(null)

const fixSchema = z.object({
  id: z.string(),
  code: z.string(),
  lang: z.string().catch('en'),
  text: z.string(),
  vehicle: fixVehicleSchema,
  photos: z
    .array(z.object({ n: z.number().int(), width: z.number().int(), height: z.number().int() }))
    .catch([]),
  created_at: z.string(),
})
const ownFixSchema = fixSchema.extend({
  status: z.enum(['pending', 'published', 'rejected']).catch('pending'),
  reason: z.string().nullish().catch(null),
  reviewed_at: z.string().nullish().catch(null),
})
const fixesReplySchema = z.object({ fixes: z.array(fixSchema) })
const ownFixesReplySchema = z.object({ fixes: z.array(ownFixSchema) })
const fixReceiptSchema = z.object({ id: z.string() })

type RawLocalized = z.infer<typeof localizedSchema>
type RawMeaning = z.infer<typeof meaningSchema>

function textOf(raw: RawLocalized): FaultCodeText {
  return { text: raw.text, lang: raw.lang, machineTranslated: raw.machine_translated }
}

/** The service's meaning in the app's own words. Exported for the mapping test. */
export function mapMeaning(raw: RawMeaning): FaultCodeMeaning {
  const details = raw.details
  return {
    system: raw.system,
    category: raw.category,
    scope: raw.scope,
    source: raw.source,
    version: raw.version,
    verified: raw.verified,
    pendingCheck: raw.pending_check,
    title: textOf(raw.title),
    flags: {
      warningLight: raw.flags.warning_light,
      emissions: raw.flags.emissions,
      driveCycle: raw.flags.drive_cycle,
      limpMode: raw.flags.limp_mode,
    },
    related: raw.related.map((r) =>
      r.title ? { code: r.code, title: r.title } : { code: r.code }
    ),
    ...(details?.description ? { description: textOf(details.description) } : {}),
    ...(details?.sections?.length
      ? { sections: details.sections.map((s) => ({ kind: s.kind, text: textOf(s.text) })) }
      : {}),
    causes: (details?.causes ?? []).map((c) => ({
      key: c.key,
      likelihood: c.likelihood,
      label: textOf(c.label),
    })),
  }
}

/** One answer from a lookup or a detail call. Exported for the mapping test. */
export function mapAnswer(raw: unknown): FaultCodeAnswer | null {
  const parsed = answerSchema.safeParse(raw)
  if (!parsed.success) return null
  const { code, found, meaning } = parsed.data
  const range = parsed.data.range ?? (isManufacturerCode(code) ? 'manufacturer' : 'standard')
  return found && meaning
    ? { code, found: true, range, meaning: mapMeaning(meaning) }
    : { code, found: false, range }
}

// ---- calls -----------------------------------------------------------------

/** The service's address, without a trailing slash; empty when this server has none. */
export function serviceUrl(env: Record<string, string | undefined> = process.env): string {
  return (env[SERVICE_URL_ENV] ?? '').trim().replace(/\/+$/, '')
}

/** The workshop's own key, else the one the server holds for every workshop. */
function token(ctx: ConnectorContext): string {
  const own = typeof ctx.credentials.apiToken === 'string' ? ctx.credentials.apiToken.trim() : ''
  return own || process.env[SERVER_KEY_ENV]?.trim() || ''
}

/** What the service is told about the vehicle: the four fields it matches on, nothing else. */
function vehicleBody(vehicle: FaultCodeVehicle | undefined): FaultCodeVehicle | undefined {
  if (!vehicle) return undefined
  const out: FaultCodeVehicle = {}
  if (vehicle.make?.trim()) out.make = vehicle.make.trim()
  if (vehicle.model?.trim()) out.model = vehicle.model.trim()
  if (vehicle.year && vehicle.year > 1900) out.year = vehicle.year
  if (vehicle.engine?.trim()) out.engine = vehicle.engine.trim()
  return Object.keys(out).length > 0 ? out : undefined
}

/** The fix in the app's own words. Exported for the mapping test. */
export function mapFix(raw: z.infer<typeof fixSchema>): FaultCodeFix {
  const v = raw.vehicle
  const vehicle: FaultCodeVehicle = {}
  if (v?.make) vehicle.make = v.make
  if (v?.model) vehicle.model = v.model
  if (v?.year) vehicle.year = v.year
  if (v?.engine) vehicle.engine = v.engine
  return {
    id: raw.id,
    code: raw.code,
    lang: raw.lang,
    text: raw.text,
    vehicle: Object.keys(vehicle).length > 0 ? vehicle : null,
    photos: raw.photos.map((p) => ({ n: p.n, width: p.width, height: p.height })),
    createdAt: raw.created_at,
  }
}

/**
 * The request itself, with the key. Throws FaultCodesUnavailable when there
 * is no address or key, or when it times out or cannot connect.
 */
async function send(
  ctx: ConnectorContext,
  path: string,
  init: {
    method?: 'GET' | 'POST'
    headers?: Record<string, string>
    body?: BodyInit
    timeoutMs: number
  }
): Promise<Response> {
  const base = serviceUrl()
  const key = token(ctx)
  if (!base) throw new FaultCodesUnavailable(`${SERVICE_URL_ENV} is not set on this server`)
  if (!key) throw new FaultCodesUnavailable('No key for the code service')
  try {
    return await fetch(`${base}${path}`, {
      method: init.method ?? 'GET',
      headers: { Authorization: `Bearer ${key}`, ...init.headers },
      body: init.body,
      signal: AbortSignal.timeout(init.timeoutMs),
      cache: 'no-store',
    })
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err)
    await ctx.log('warn', 'The code service could not be reached', { path: pathOnly(path), reason })
    throw new FaultCodesUnavailable(reason)
  }
}

/** Logs a refusal with the service's own words, which never reach a screen. */
async function logRefusal(ctx: ConnectorContext, path: string, res: Response, body: unknown) {
  const detail =
    body && typeof body === 'object' && 'detail' in body ? String(body.detail) : undefined
  await ctx.log(
    res.status === 401 || res.status === 403 ? 'error' : 'warn',
    'The code service refused a call',
    {
      path: pathOnly(path),
      status: res.status,
      requestId: res.headers.get('x-request-id'),
      ...(detail ? { detail } : {}),
    }
  )
  return detail
}

/**
 * One request. Throws FaultCodesUnavailable when there is no address or key,
 * when it times out or cannot connect, and on any answer but the ones the
 * caller says it handles (`accept`), with the service's own words in the
 * log and never on screen.
 */
async function call(
  ctx: ConnectorContext,
  path: string,
  init: { method?: 'GET' | 'POST'; body?: unknown; timeoutMs: number; accept?: number[] }
): Promise<{ status: number; body: unknown }> {
  const res = await send(ctx, path, {
    method: init.method,
    headers: {
      Accept: 'application/json',
      ...(init.body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    timeoutMs: init.timeoutMs,
  })
  const body: unknown = res.status === 204 ? null : await res.json().catch(() => null)
  if (res.ok || init.accept?.includes(res.status)) return { status: res.status, body }
  const detail = await logRefusal(ctx, path, res, body)
  throw new FaultCodesUnavailable(`HTTP ${res.status}${detail ? `: ${detail}` : ''}`)
}

/** The path without its query, so a search term never lands in the log. */
function pathOnly(path: string): string {
  return path.split('?')[0]
}

function invalid(what: string): never {
  throw new FaultCodesUnavailable(`The code service sent a ${what} the app could not read`)
}

async function lookupCodes(
  ctx: ConnectorContext,
  query: { codes: string[]; vehicle?: FaultCodeVehicle; locale: string; details?: boolean }
): Promise<FaultCodeAnswer[]> {
  const codes = query.codes.slice(0, MAX_CODES_PER_LOOKUP)
  if (codes.length === 0) return []
  const { body } = await call(ctx, '/v1/lookups', {
    method: 'POST',
    body: {
      codes,
      vehicle: vehicleBody(query.vehicle),
      lang: query.locale,
      details: query.details === true,
    },
    timeoutMs: LOOKUP_TIMEOUT_MS,
  })
  const parsed = lookupReplySchema.safeParse(body)
  if (!parsed.success) invalid('lookup')
  return parsed.data.results
    .map((r) => mapAnswer(r))
    .filter((a): a is FaultCodeAnswer => a !== null)
}

async function codeDetail(
  ctx: ConnectorContext,
  query: { code: string; vehicle?: FaultCodeVehicle; locale: string }
): Promise<FaultCodeAnswer | null> {
  const params = new URLSearchParams({ lang: query.locale, details: 'true' })
  const vehicle = vehicleBody(query.vehicle)
  if (vehicle?.make) params.set('make', vehicle.make)
  if (vehicle?.model) params.set('model', vehicle.model)
  if (vehicle?.year) params.set('year', String(vehicle.year))
  if (vehicle?.engine) params.set('engine', vehicle.engine)
  const { status, body } = await call(
    ctx,
    `/v1/codes/${encodeURIComponent(query.code)}?${params}`,
    { timeoutMs: LOOKUP_TIMEOUT_MS, accept: [400, 404] }
  )
  if (status === 404 || status === 400) return null
  const answer = mapAnswer(body)
  if (!answer) invalid('code')
  return answer.found ? answer : null
}

async function searchCodes(
  ctx: ConnectorContext,
  query: { query: string; locale: string; limit?: number }
): Promise<FaultCodeSearchHit[]> {
  const q = query.query.trim()
  if (!q) return []
  const limit = Math.min(25, Math.max(1, query.limit ?? 8))
  const params = new URLSearchParams({ q, lang: query.locale, limit: String(limit) })
  const { body } = await call(ctx, `/v1/search?${params}`, { timeoutMs: SEARCH_TIMEOUT_MS })
  const parsed = searchReplySchema.safeParse(body)
  if (!parsed.success) invalid('search')
  return parsed.data.results.map((r) => ({ code: r.code, title: textOf(r.title) }))
}

async function reportDefinition(
  ctx: ConnectorContext,
  report: FaultCodeReport
): Promise<{ id: string; status: 'open' | 'resolved' }> {
  const { body } = await call(ctx, '/v1/definition-reports', {
    method: 'POST',
    body: {
      code: report.code,
      version: report.version,
      lang: report.lang,
      reason: report.reason,
      ...(report.note?.trim() ? { note: report.note.trim().slice(0, 500) } : {}),
      ...(report.scanText?.trim() ? { scan_text: report.scanText.trim().slice(0, 500) } : {}),
      vehicle: vehicleBody(report.vehicle),
      automatic: report.automatic,
      workshop_ref: report.workshopRef,
    },
    timeoutMs: REPORT_TIMEOUT_MS,
  })
  const parsed = reportReplySchema.safeParse(body)
  if (!parsed.success) invalid('report receipt')
  return parsed.data
}

async function reportStatus(
  ctx: ConnectorContext,
  ids: string[]
): Promise<FaultCodeReportStatus[]> {
  const wanted = [...new Set(ids)].slice(0, 100)
  if (wanted.length === 0) return []
  const params = new URLSearchParams({ ids: wanted.join(',') })
  const { body } = await call(ctx, `/v1/definition-reports?${params}`, {
    timeoutMs: LOOKUP_TIMEOUT_MS,
  })
  const parsed = reportStatusReplySchema.safeParse(body)
  if (!parsed.success) invalid('report list')
  return parsed.data.reports.map((r) => ({
    id: r.id,
    code: r.code,
    status: r.status,
    outcome: r.outcome ?? null,
    resolvedAt: r.resolved_at ?? null,
    message: r.message ?? null,
  }))
}

async function shareFix(
  ctx: ConnectorContext,
  fix: FaultCodeFixInput
): Promise<{ ok: true; id: string } | { ok: false; reason: FaultCodeFixRefusal }> {
  const form = new FormData()
  form.append(
    'fix',
    new Blob(
      [
        JSON.stringify({
          code: fix.code,
          text: fix.text,
          lang: fix.lang,
          vehicle: vehicleBody(fix.vehicle),
          workshop_ref: fix.workshopRef,
        }),
      ],
      { type: 'application/json' }
    )
  )
  fix.photos.slice(0, 4).forEach((photo, i) => {
    form.append('photo', photo, `photo-${i + 1}.jpg`)
  })
  const path = '/v1/fixes'
  const res = await send(ctx, path, {
    method: 'POST',
    headers: { Accept: 'application/json' },
    body: form,
    timeoutMs: SHARE_TIMEOUT_MS,
  })
  const body: unknown = await res.json().catch(() => null)
  if (res.ok) {
    const parsed = fixReceiptSchema.safeParse(body)
    if (!parsed.success) invalid('fix receipt')
    return { ok: true, id: parsed.data.id }
  }
  const detail = await logRefusal(ctx, path, res, body)
  if (res.status === 503) return { ok: false, reason: 'paused' }
  if (res.status === 413) return { ok: false, reason: 'too_large' }
  if (res.status === 400) {
    return { ok: false, reason: detail?.startsWith('photo') ? 'photo' : 'invalid' }
  }
  throw new FaultCodesUnavailable(`HTTP ${res.status}${detail ? `: ${detail}` : ''}`)
}

async function fixStatus(ctx: ConnectorContext, ids: string[]): Promise<FaultCodeOwnFix[]> {
  const wanted = [...new Set(ids)].slice(0, 100)
  if (wanted.length === 0) return []
  const params = new URLSearchParams({ ids: wanted.join(',') })
  const { body } = await call(ctx, `/v1/fixes?${params}`, { timeoutMs: LOOKUP_TIMEOUT_MS })
  const parsed = ownFixesReplySchema.safeParse(body)
  if (!parsed.success) invalid('fix list')
  return parsed.data.fixes.map((f) => ({
    ...mapFix(f),
    status: f.status,
    reason: f.reason ?? null,
    reviewedAt: f.reviewed_at ?? null,
  }))
}

async function withdrawFix(
  ctx: ConnectorContext,
  input: { id: string; workshopRef: string }
): Promise<boolean> {
  const { status } = await call(ctx, `/v1/fixes/${encodeURIComponent(input.id)}/withdraw`, {
    method: 'POST',
    body: { workshop_ref: input.workshopRef },
    timeoutMs: REPORT_TIMEOUT_MS,
    accept: [404],
  })
  return status !== 404
}

async function publishedFixes(
  ctx: ConnectorContext,
  query: { code: string; limit?: number }
): Promise<FaultCodeFix[]> {
  const limit = Math.min(50, Math.max(1, query.limit ?? 20))
  const { body } = await call(
    ctx,
    `/v1/codes/${encodeURIComponent(query.code)}/fixes?limit=${limit}`,
    { timeoutMs: LOOKUP_TIMEOUT_MS }
  )
  const parsed = fixesReplySchema.safeParse(body)
  if (!parsed.success) invalid('fix list')
  return parsed.data.fixes.map(mapFix)
}

async function fixPhoto(
  ctx: ConnectorContext,
  query: { id: string; n: number; size: 'full' | 'thumb'; workshopRef: string }
): Promise<{ body: ReadableStream<Uint8Array>; length: number | null } | null> {
  const params = new URLSearchParams({ size: query.size, workshop_ref: query.workshopRef })
  const path = `/v1/fixes/${encodeURIComponent(query.id)}/photos/${query.n}?${params}`
  const res = await send(ctx, path, { timeoutMs: PHOTO_TIMEOUT_MS })
  if (res.status === 404 || res.status === 400) return null
  if (!res.ok || !res.body) {
    const detail = await logRefusal(ctx, path, res, await res.json().catch(() => null))
    throw new FaultCodesUnavailable(`HTTP ${res.status}${detail ? `: ${detail}` : ''}`)
  }
  if (!(res.headers.get('content-type') ?? '').startsWith('image/jpeg')) invalid('photo')
  const length = Number(res.headers.get('content-length'))
  return { body: res.body, length: Number.isFinite(length) && length > 0 ? length : null }
}

export const connector: ConnectorServer = {
  manifest,

  async test(ctx) {
    if (!serviceUrl()) {
      return { ok: false, message: 'The code service is not set up on this server' }
    }
    if (!token(ctx)) return { ok: false, message: 'Torqvoice Codes: a key is required' }
    // A search for a code every list has: one cheap call that needs the key.
    try {
      await call(ctx, '/v1/search?q=P0420&limit=1', { timeoutMs: TEST_TIMEOUT_MS })
      return { ok: true }
    } catch (err) {
      const reason = err instanceof Error ? err.message : ''
      if (/HTTP 40[13]/.test(reason)) {
        return { ok: false, message: 'Torqvoice Codes refused the key' }
      }
      return { ok: false, message: 'Torqvoice Codes could not be reached, try again in a moment' }
    }
  },

  lookupCodes,
  codeDetail,
  searchCodes,
  reportDefinition,
  reportStatus,
  shareFix,
  fixStatus,
  withdrawFix,
  publishedFixes,
  fixPhoto,

  jobs: {},
}
