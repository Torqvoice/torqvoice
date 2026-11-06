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
  type FaultCodeOwnWaveform,
  type FaultCodeResearch,
  type FaultCodeWaveform,
  type FaultCodeWaveformInput,
  type WaveformFileRole,
  type FaultCodeResearchRefusal,
  type CodeImportChecked,
  type CodeImportCounts,
  type CodeImportInput,
  type CodeImportRefusal,
  type CodeImportStatus,
  type OemCodeAnswer,
  type OemFindHit,
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
  'common_issues',
  'resolution',
  'advisory',
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
  meaning: z.string().nullish().catch(null),
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
    meaning: raw.meaning ?? null,
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

const oemReplySchema = z.object({
  make: z.string(),
  code: z.string(),
  meanings: z
    .array(
      z.object({
        id: z.string().catch(''),
        text: z.string(),
        text_lang: z.string().catch('de'),
        text_en: z.string().nullish(),
        modules: z
          .array(
            z.object({
              ref: z.string(),
              family: z.string().nullish(),
              name: z.string().nullish(),
            })
          )
          .catch([]),
        vehicles: z
          .array(
            z.object({
              chassis: z.string(),
              model: z.string().nullish(),
              body: z.string().nullish(),
              year_from: z.number().int().nullish(),
              year_to: z.number().int().nullish(),
            })
          )
          .catch([]),
        engines: z.array(z.string()).catch([]),
        matches: z.boolean().catch(false),
        // Our own text for the meaning; a part that does not read drops that part, never the meaning.
        lang: z.string().nullish().catch(null),
        title: z.string().nullish().catch(null),
        description: z.string().nullish().catch(null),
        sections: z
          .array(z.object({ kind: z.enum(SECTION_KINDS).catch('other'), text: z.string() }))
          .catch([]),
        causes: z
          .array(
            z.object({
              key: z.string(),
              likelihood: z.enum(['low', 'medium', 'high']).catch('medium'),
              label: z.string(),
            })
          )
          .catch([]),
      })
    )
    .catch([]),
})

const waveformSchema = z.object({
  id: z.string(),
  code: z.string(),
  meaning: z.string().nullish(),
  kind: z.enum(['good', 'faulty']),
  title: z.string(),
  condition: z
    .enum(['key_on', 'cranking', 'idle', 'rpm_2500', 'driving', 'under_load'])
    .nullish()
    .catch(null),
  note: z.string().nullish(),
  lang: z.string().catch('en'),
  vehicle: fixVehicleSchema,
  preview: z
    .object({
      time_unit: z.string().catch(''),
      start: z.number(),
      end: z.number(),
      channels: z.array(
        z.object({
          name: z.string(),
          unit: z.string().catch(''),
          min: z.array(z.number().nullable()),
          max: z.array(z.number().nullable()),
        })
      ),
    })
    .nullish()
    .catch(null),
  files: z
    .array(
      z.object({
        role: z.enum(['psdata', 'pssettings', 'csv', 'image']),
        name: z.string(),
        size: z.number().int(),
        width: z.number().int().nullish(),
        height: z.number().int().nullish(),
      })
    )
    .catch([]),
  created_at: z.string(),
})

const ownWaveformSchema = waveformSchema.extend({
  status: z.enum(['pending', 'published', 'rejected']),
  reason: z.string().nullish(),
  reviewed_at: z.string().nullish(),
})

function waveformOf(raw: z.infer<typeof waveformSchema>): FaultCodeWaveform {
  const v = raw.vehicle
  const vehicle: FaultCodeVehicle = {}
  if (v?.make) vehicle.make = v.make
  if (v?.model) vehicle.model = v.model
  if (v?.year) vehicle.year = v.year
  if (v?.engine) vehicle.engine = v.engine
  return {
    id: raw.id,
    code: raw.code,
    meaning: raw.meaning ?? null,
    kind: raw.kind,
    title: raw.title,
    condition: raw.condition ?? null,
    note: raw.note ?? null,
    lang: raw.lang,
    vehicle: Object.keys(vehicle).length > 0 ? vehicle : null,
    preview: raw.preview
      ? {
          timeUnit: raw.preview.time_unit,
          start: raw.preview.start,
          end: raw.preview.end,
          channels: raw.preview.channels,
        }
      : null,
    files: raw.files.map((f) => ({ ...f, width: f.width ?? null, height: f.height ?? null })),
    createdAt: raw.created_at,
  }
}

/** A recording, its settings, a CSV export and a picture: up to about 36 MB to send. */
const WAVEFORM_TIMEOUT_MS = 120_000

async function shareWaveform(
  ctx: ConnectorContext,
  input: FaultCodeWaveformInput
): Promise<{ ok: true; id: string } | { ok: false; reason: FaultCodeFixRefusal }> {
  const form = new FormData()
  form.append(
    'waveform',
    new Blob(
      [
        JSON.stringify({
          code: input.code,
          meaning: input.meaning,
          kind: input.kind,
          title: input.title,
          condition: input.condition,
          note: input.note,
          lang: input.lang,
          vehicle: vehicleBody(input.vehicle),
          workshop_ref: input.workshopRef,
        }),
      ],
      { type: 'application/json' }
    )
  )
  for (const file of input.files) form.append(file.role, file.blob, file.name)
  const path = '/v1/waveforms'
  const res = await send(ctx, path, {
    method: 'POST',
    headers: { Accept: 'application/json' },
    body: form,
    timeoutMs: WAVEFORM_TIMEOUT_MS,
  })
  const body: unknown = await res.json().catch(() => null)
  if (res.ok) {
    const parsed = fixReceiptSchema.safeParse(body)
    if (!parsed.success) invalid('waveform receipt')
    return { ok: true, id: parsed.data.id }
  }
  const detail = await logRefusal(ctx, path, res, body)
  if (res.status === 503) return { ok: false, reason: 'paused' }
  if (res.status === 413) return { ok: false, reason: 'too_large' }
  if (res.status === 400) {
    return { ok: false, reason: detail?.startsWith('the picture') ? 'photo' : 'invalid' }
  }
  throw new FaultCodesUnavailable(`HTTP ${res.status}${detail ? `: ${detail}` : ''}`)
}

async function publishedWaveforms(
  ctx: ConnectorContext,
  query: { code: string }
): Promise<FaultCodeWaveform[]> {
  const { status, body } = await call(
    ctx,
    `/v1/codes/${encodeURIComponent(query.code)}/waveforms?limit=20`,
    { timeoutMs: LOOKUP_TIMEOUT_MS, accept: [400, 404] }
  )
  if (status === 404 || status === 400) return []
  const parsed = z.object({ waveforms: z.array(waveformSchema) }).safeParse(body)
  if (!parsed.success) invalid('waveform list')
  return parsed.data.waveforms.map(waveformOf)
}

async function waveformStatus(
  ctx: ConnectorContext,
  ids: string[]
): Promise<FaultCodeOwnWaveform[]> {
  const unique = [...new Set(ids)].slice(0, 100)
  if (unique.length === 0) return []
  const { status, body } = await call(ctx, `/v1/waveforms?ids=${unique.join(',')}`, {
    timeoutMs: LOOKUP_TIMEOUT_MS,
    accept: [404],
  })
  if (status === 404) return []
  const parsed = z.object({ waveforms: z.array(ownWaveformSchema) }).safeParse(body)
  if (!parsed.success) invalid('waveform status')
  return parsed.data.waveforms.map((w) => ({
    ...waveformOf(w),
    status: w.status,
    reason: w.reason ?? null,
    reviewedAt: w.reviewed_at ?? null,
  }))
}

async function withdrawWaveform(
  ctx: ConnectorContext,
  input: { id: string; workshopRef: string }
): Promise<boolean> {
  const { status } = await call(ctx, `/v1/waveforms/${encodeURIComponent(input.id)}/withdraw`, {
    method: 'POST',
    body: { workshop_ref: input.workshopRef },
    timeoutMs: LOOKUP_TIMEOUT_MS,
    accept: [404],
  })
  return status === 204
}

async function waveformFile(
  ctx: ConnectorContext,
  query: { id: string; role: WaveformFileRole; size: 'full' | 'thumb'; workshopRef: string }
): Promise<{
  body: ReadableStream<Uint8Array>
  length: number | null
  contentType: string
  disposition: string | null
} | null> {
  const params = new URLSearchParams({ workshop_ref: query.workshopRef })
  if (query.size === 'thumb') params.set('size', 'thumb')
  const path = `/v1/waveforms/${encodeURIComponent(query.id)}/files/${query.role}?${params}`
  const res = await send(ctx, path, { timeoutMs: WAVEFORM_TIMEOUT_MS })
  if (res.status === 404 || res.status === 400) return null
  if (!res.ok || !res.body) {
    const detail = await logRefusal(ctx, path, res, await res.json().catch(() => null))
    throw new FaultCodesUnavailable(`HTTP ${res.status}${detail ? `: ${detail}` : ''}`)
  }
  const length = Number(res.headers.get('content-length'))
  return {
    body: res.body,
    length: Number.isFinite(length) && length > 0 ? length : null,
    contentType: res.headers.get('content-type') ?? 'application/octet-stream',
    disposition: res.headers.get('content-disposition'),
  }
}

const researchSchema = z.object({
  id: z.string(),
  code: z.string(),
  meaning: z.string().nullish(),
  status: z.enum(['running', 'pending', 'published', 'missed']),
  findings: z
    .object({
      title: z.string(),
      meaning: z.string(),
      common_issues: z.array(z.string()).catch([]),
      steps: z.array(z.string()).catch([]),
      causes: z
        .array(
          z.object({
            label: z.string(),
            likelihood: z.enum(['low', 'medium', 'high']).catch('medium'),
          })
        )
        .catch([]),
      advice: z.string().nullish(),
      sources: z.array(z.object({ url: z.string(), title: z.string().nullish() })).catch([]),
    })
    .nullish(),
  reason: z.string().nullish(),
  requests: z.number().int().catch(1),
  helpful: z.number().int().catch(0),
  not_helpful: z.number().int().catch(0),
  created_at: z.string(),
})

function researchOf(raw: z.infer<typeof researchSchema>): FaultCodeResearch {
  const f = raw.findings
  return {
    id: raw.id,
    code: raw.code,
    meaning: raw.meaning ?? null,
    status: raw.status,
    findings: f
      ? {
          title: f.title,
          meaning: f.meaning,
          commonIssues: f.common_issues,
          steps: f.steps,
          causes: f.causes,
          advice: f.advice ?? null,
          // Only web pages: a source is a link a technician opens.
          sources: f.sources
            .filter((src) => /^https?:\/\//i.test(src.url))
            .map((src) => ({ url: src.url, title: src.title ?? null })),
        }
      : null,
    reason: raw.reason ?? null,
    requests: raw.requests,
    helpful: raw.helpful,
    notHelpful: raw.not_helpful,
    createdAt: raw.created_at,
  }
}

/** Searching the web and writing it up takes a while; the page shows it working meanwhile. */
const RESEARCH_TIMEOUT_MS = 240_000

async function researchFor(
  ctx: ConnectorContext,
  query: { code: string }
): Promise<{ available: boolean; research: FaultCodeResearch[] }> {
  const { status, body } = await call(ctx, `/v1/research/${encodeURIComponent(query.code)}`, {
    timeoutMs: LOOKUP_TIMEOUT_MS,
    accept: [400, 404],
  })
  // An older service has no research; a code it cannot read has none either.
  if (status === 404 || status === 400) return { available: false, research: [] }
  const parsed = z
    .object({ available: z.boolean().catch(false), research: z.array(researchSchema).catch([]) })
    .safeParse(body)
  if (!parsed.success) invalid('research list')
  return { available: parsed.data.available, research: parsed.data.research.map(researchOf) }
}

async function research(
  ctx: ConnectorContext,
  input: { code: string; meaning?: string; vehicle?: FaultCodeVehicle; workshopRef: string }
): Promise<
  { ok: true; research: FaultCodeResearch } | { ok: false; reason: FaultCodeResearchRefusal }
> {
  const { status, body } = await call(ctx, '/v1/research', {
    method: 'POST',
    body: {
      code: input.code,
      meaning: input.meaning,
      vehicle: vehicleBody(input.vehicle),
      workshop_ref: input.workshopRef,
    },
    timeoutMs: RESEARCH_TIMEOUT_MS,
    accept: [404, 409, 429, 502],
  })
  if (status === 409) return { ok: false, reason: 'busy' }
  if (status === 429) return { ok: false, reason: 'limited' }
  if (status === 404 || status === 502) return { ok: false, reason: 'unavailable' }
  const parsed = z.object({ research: researchSchema }).safeParse(body)
  if (!parsed.success) invalid('research')
  return { ok: true, research: researchOf(parsed.data.research) }
}

async function rateResearch(
  ctx: ConnectorContext,
  input: { id: string; helpful: boolean; workshopRef: string }
): Promise<boolean> {
  const { status } = await call(ctx, `/v1/research/${encodeURIComponent(input.id)}/feedback`, {
    method: 'POST',
    body: { helpful: input.helpful, workshop_ref: input.workshopRef },
    timeoutMs: LOOKUP_TIMEOUT_MS,
    accept: [404],
  })
  return status === 204
}

/** Two thousand rows with a few paragraphs each take a moment to compare. */
const IMPORT_TIMEOUT_MS = 60_000

const importCountsSchema = z.object({
  new: z.number().int(),
  change: z.number().int(),
  same: z.number().int(),
  problem: z.number().int(),
})

const importCheckSchema = z.object({
  counts: importCountsSchema,
  rows: z.array(
    z.object({
      n: z.number().int(),
      code: z.string(),
      state: z.enum(['new', 'change', 'same', 'problem']),
      problem: z
        .enum(['code', 'duplicate', 'title', 'empty', 'too_long', 'likelihood', 'meanings'])
        .nullable()
        .optional()
        .catch('code'),
      fields: z.array(z.string()).catch([]),
      added_causes: z.number().int().catch(0),
    })
  ),
})

const importStatusSchema = z.object({
  imports: z.array(
    z.object({
      id: z.string(),
      make: z.string(),
      lang: z.string(),
      source: z.string().nullable().optional(),
      file_name: z.string().nullable().optional(),
      created_at: z.string(),
      counts: z.object({
        new: z.number().int(),
        change: z.number().int(),
        pending: z.number().int(),
        published: z.number().int(),
        rejected: z.number().int(),
      }),
      reviewed_at: z.string().nullable().optional(),
    })
  ),
})

function importBody(
  input: Omit<CodeImportInput, 'workshopRef' | 'source' | 'fileName'> & Partial<CodeImportInput>
) {
  return {
    make: input.make,
    lang: input.lang,
    ...(input.source ? { source: input.source } : {}),
    ...(input.fileName ? { file_name: input.fileName } : {}),
    ...(input.workshopRef ? { workshop_ref: input.workshopRef } : {}),
    codes: input.rows.map((r) => ({
      code: r.code,
      ...(r.title ? { title: r.title } : {}),
      ...(r.description ? { description: r.description } : {}),
      ...(r.commonIssues ? { common_issues: r.commonIssues } : {}),
      ...(r.resolution ? { resolution: r.resolution } : {}),
      ...(r.advisory ? { advisory: r.advisory } : {}),
      causes: r.causes.map((c) =>
        c.likelihood ? { label: c.label, likelihood: c.likelihood } : { label: c.label }
      ),
    })),
  }
}

function importRefusal(status: number, body: unknown): CodeImportRefusal | null {
  if (status === 503) return 'paused'
  if (status === 413) return 'too_large'
  if (status === 400) {
    const detail = (body as { detail?: unknown } | null)?.detail
    return typeof detail === 'string' && detail.startsWith('nothing') ? 'nothing' : 'invalid'
  }
  return null
}

async function checkCodeImport(
  ctx: ConnectorContext,
  input: Omit<CodeImportInput, 'workshopRef' | 'source' | 'fileName'>
): Promise<
  | { ok: true; counts: CodeImportCounts; rows: CodeImportChecked[] }
  | { ok: false; reason: CodeImportRefusal }
> {
  const { status, body } = await call(ctx, '/v1/code-imports/check', {
    method: 'POST',
    body: importBody(input),
    timeoutMs: IMPORT_TIMEOUT_MS,
    accept: [400, 413],
  })
  const refused = importRefusal(status, body)
  if (refused) return { ok: false, reason: refused }
  const parsed = importCheckSchema.safeParse(body)
  if (!parsed.success) invalid('import check')
  return {
    ok: true,
    counts: parsed.data.counts,
    rows: parsed.data.rows.map((r) => ({
      n: r.n,
      code: r.code,
      state: r.state,
      problem: r.state === 'problem' ? (r.problem ?? 'code') : null,
      fields: r.fields,
      addedCauses: r.added_causes,
    })),
  }
}

async function sendCodeImport(
  ctx: ConnectorContext,
  input: CodeImportInput
): Promise<
  { ok: true; id: string; counts: CodeImportCounts } | { ok: false; reason: CodeImportRefusal }
> {
  const { status, body } = await call(ctx, '/v1/code-imports', {
    method: 'POST',
    body: importBody(input),
    timeoutMs: IMPORT_TIMEOUT_MS,
    accept: [400, 413, 503],
  })
  const refused = importRefusal(status, body)
  if (refused) return { ok: false, reason: refused }
  const parsed = z.object({ id: z.string(), counts: importCountsSchema }).safeParse(body)
  if (!parsed.success) invalid('import')
  return { ok: true, id: parsed.data.id, counts: parsed.data.counts }
}

async function codeImportStatus(ctx: ConnectorContext, ids: string[]): Promise<CodeImportStatus[]> {
  if (ids.length === 0) return []
  const { body } = await call(
    ctx,
    `/v1/code-imports?ids=${ids.slice(0, 100).map(encodeURIComponent).join(',')}`,
    { timeoutMs: LOOKUP_TIMEOUT_MS }
  )
  const parsed = importStatusSchema.safeParse(body)
  if (!parsed.success) invalid('import status')
  return parsed.data.imports.map((i) => ({
    id: i.id,
    make: i.make,
    lang: i.lang,
    source: i.source ?? null,
    fileName: i.file_name ?? null,
    createdAt: i.created_at,
    counts: i.counts,
    reviewedAt: i.reviewed_at ?? null,
  }))
}

const oemMakesSchema = z.object({ makes: z.array(z.string()).catch([]) })

/** The makes the service serves own codes for; none from an older service that has no list. */
async function oemMakes(ctx: ConnectorContext): Promise<string[]> {
  const { status, body } = await call(ctx, '/v1/oem', {
    timeoutMs: LOOKUP_TIMEOUT_MS,
    accept: [404],
  })
  if (status === 404) return []
  const parsed = oemMakesSchema.safeParse(body)
  if (!parsed.success) invalid('make list')
  return parsed.data.makes.map((m) => m.toLowerCase())
}

const oemFindSchema = z.object({
  hits: z
    .array(
      z.object({
        make: z.string(),
        code: z.string(),
        meanings: z.number().int(),
        title: z.string().nullable().optional(),
      })
    )
    .catch([]),
})

/** Every make that has a code; none from an older service that cannot search across makes. */
async function findOemCode(
  ctx: ConnectorContext,
  query: { code: string; locale?: string }
): Promise<OemFindHit[]> {
  const params = new URLSearchParams()
  if (query.locale) params.set('lang', query.locale)
  const { status, body } = await call(
    ctx,
    `/v1/oem/codes/${encodeURIComponent(query.code)}?${params}`,
    { timeoutMs: LOOKUP_TIMEOUT_MS, accept: [400, 404] }
  )
  if (status !== 200) return []
  const parsed = oemFindSchema.safeParse(body)
  if (!parsed.success) invalid('manufacturer code search')
  return parsed.data.hits.map((h) => ({
    make: h.make.toLowerCase(),
    code: h.code,
    meanings: h.meanings,
    title: h.title?.trim() || null,
  }))
}

async function oemCode(
  ctx: ConnectorContext,
  query: { source: string; code: string; chassis?: string; engine?: string; locale?: string }
): Promise<OemCodeAnswer | null> {
  const params = new URLSearchParams()
  if (query.chassis) params.set('chassis', query.chassis)
  if (query.engine) params.set('engine', query.engine)
  if (query.locale) params.set('lang', query.locale)
  const { status, body } = await call(
    ctx,
    `/v1/oem/${encodeURIComponent(query.source)}/codes/${encodeURIComponent(query.code)}?${params}`,
    { timeoutMs: LOOKUP_TIMEOUT_MS, accept: [400, 404] }
  )
  // 404: the service does not serve this make's codes; 400: not such a code.
  if (status === 404 || status === 400) return null
  const parsed = oemReplySchema.safeParse(body)
  if (!parsed.success) invalid('manufacturer code')
  return {
    source: parsed.data.make,
    code: parsed.data.code,
    meanings: parsed.data.meanings.map((m) => ({
      // An older service gives no id; the text then names the meaning on the page.
      id: m.id || m.text,
      text: m.text,
      textLang: m.text_lang,
      textEn: m.text_en ?? null,
      modules: m.modules.map((u) => ({
        ref: u.ref,
        family: u.family ?? null,
        name: u.name ?? null,
      })),
      vehicles: m.vehicles.map((v) => ({
        chassis: v.chassis,
        model: v.model ?? null,
        body: v.body ?? null,
        yearFrom: v.year_from ?? null,
        yearTo: v.year_to ?? null,
      })),
      engines: m.engines,
      matches: m.matches,
      ...ownText(m),
    })),
  }
}

/** The service's own text on a meaning; without a title there is none to show. */
function ownText(m: z.infer<typeof oemReplySchema>['meanings'][number]) {
  const title = m.title?.trim() || null
  if (!title) return { lang: null, title: null, description: null, sections: [], causes: [] }
  return {
    lang: m.lang || 'en',
    title,
    description: m.description?.trim() || null,
    sections: m.sections.filter((s) => s.text.trim()),
    causes: m.causes.filter((c) => c.label.trim()),
  }
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
          meaning: fix.meaning,
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
  researchFor,
  research,
  rateResearch,
  shareWaveform,
  publishedWaveforms,
  waveformStatus,
  withdrawWaveform,
  waveformFile,
  oemMakes,
  oemCode,
  findOemCode,
  checkCodeImport,
  sendCodeImport,
  codeImportStatus,
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
