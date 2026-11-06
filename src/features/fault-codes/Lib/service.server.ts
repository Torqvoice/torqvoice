import 'server-only'
import { db } from '@/lib/db'
import { getFeatures } from '@/lib/features'
import { getManifest, listManifests } from '@/integrations/registry'
import { FAULT_CODES_CAPABILITY } from '@/integrations/torqvoice-codes/manifest'
import { loadConnection } from '@/features/integrations/Lib/connections'
import { autoConnectFor } from '@/features/integrations/Lib/auto-connect'
import { isManufacturerCode } from './codes'
import { connectorAllowed } from '@/features/integrations/Lib/plan'
import type {
  ConnectorContext,
  ConnectorServer,
  FaultCodeAnswer,
  FaultCodeFix,
  FaultCodeFixRefusal,
  FaultCodeMeaning,
  FaultCodeOwnFix,
  FaultCodeReportReason,
  FaultCodeVehicle,
} from '@/features/integrations/Lib/types'
import type {
  CodeFixes,
  FaultCodeDetailView,
  FaultCodeJob,
  FaultCodeView,
  MeaningSource,
  OwnFix,
  ReportState,
  SharedFix,
} from './types'

/**
 * Fault codes as the app's screens and actions ask for them: through
 * whichever connection answers 'diagnostics.codes'. Actions ask here rather
 * than knowing about connectors.
 *
 * Nothing here throws to a caller over the service: a service that is down,
 * slow or not connected gives `available: false`, and the screen says "not
 * available right now". The workshop's own jobs come from the app's
 * database and show either way.
 *
 * There is no cache: a call to the service costs a few milliseconds on the
 * internal network, and a cache would be the one place a workshop could see
 * an older meaning than the service holds.
 */

/** Where a report this workshop sent is kept, in the connection's link store. */
export const REPORT_LINK = 'fault-code-report'

/** The active connection that answers fault code questions, when the plan includes it. */
export async function findFaultCodeConnection(
  organizationId: string
): Promise<{ id: string; connectorId: string } | null> {
  // No such connector on this install (a self-hosted one): nothing to ask the database.
  if (!listManifests().some((m) => m.capabilities.includes(FAULT_CODES_CAPABILITY))) return null
  const active = async () => {
    const rows = await db.integrationConnection.findMany({
      where: { organizationId, status: 'active' },
      select: { id: true, connectorId: true },
      orderBy: { createdAt: 'desc' },
    })
    return rows.filter((r) =>
      getManifest(r.connectorId)?.capabilities.includes(FAULT_CODES_CAPABILITY)
    )
  }
  let candidates = await active()
  // On the cloud the code service is on for every workshop that has not
  // turned it off; the first ask connects it.
  if (candidates.length === 0 && (await autoConnectFor(organizationId, FAULT_CODES_CAPABILITY)))
    candidates = await active()
  if (candidates.length === 0) return null
  const features = await getFeatures(organizationId)
  const pick = candidates.find((r) => {
    const manifest = getManifest(r.connectorId)
    return manifest ? connectorAllowed(manifest, features) : false
  })
  return pick ?? null
}

export async function faultCodesConnected(organizationId: string): Promise<boolean> {
  return (await findFaultCodeConnection(organizationId).catch(() => null)) !== null
}

type Loaded = { ctx: ConnectorContext; server: ConnectorServer }

async function connect(organizationId: string): Promise<Loaded | null> {
  try {
    const connection = await findFaultCodeConnection(organizationId)
    if (!connection) return null
    const { ctx, server } = await loadConnection(connection.id)
    return { ctx, server }
  } catch (err) {
    console.error('[fault-codes] could not load the connection:', err)
    return null
  }
}

/** Runs one call to the service; any failure is "no answer". */
async function attempt<T>(fn: () => Promise<T>): Promise<{ ok: true; value: T } | { ok: false }> {
  try {
    return { ok: true, value: await fn() }
  } catch {
    return { ok: false }
  }
}

/**
 * The vehicle as the service is told about it: make, model, year and the
 * engine. Scoped by the workshop, since the id came from a browser.
 */
export async function vehicleForCodes(
  organizationId: string,
  vehicleId: string | null | undefined
): Promise<(FaultCodeVehicle & { id: string; make: string; model: string; year: number }) | null> {
  if (!vehicleId) return null
  const vehicle = await db.vehicle.findFirst({
    where: { id: vehicleId, organizationId },
    select: { id: true, make: true, model: true, year: true, engineCode: true, engineSize: true },
  })
  if (!vehicle) return null
  return {
    id: vehicle.id,
    make: vehicle.make,
    model: vehicle.model,
    year: vehicle.year,
    engine: vehicle.engineCode?.trim() || vehicle.engineSize?.trim() || undefined,
  }
}

function sourceOf(meaning: FaultCodeMeaning): MeaningSource {
  return meaning.scope === 'generic' ? 'generic' : 'manufacturer'
}

function emptyView(code: string, state: FaultCodeView['state']): FaultCodeView {
  return {
    code,
    state,
    range: isManufacturerCode(code) ? 'manufacturer' : 'standard',
    title: null,
    source: null,
    make: null,
    lang: null,
    machineTranslated: false,
    verified: false,
    version: null,
    flags: null,
  }
}

/** The service's answer as the screens show it. */
export function viewOf(
  code: string,
  answer: FaultCodeAnswer | null | undefined,
  available: boolean,
  make: string | undefined
): FaultCodeView {
  const meaning = answer?.found ? answer.meaning : undefined
  return meaning
    ? {
        code,
        state: 'found',
        range: answer?.range ?? (isManufacturerCode(code) ? 'manufacturer' : 'standard'),
        title: meaning.title.text,
        source: sourceOf(meaning),
        make: meaning.scope === 'generic' ? null : (make ?? null),
        lang: meaning.title.lang,
        machineTranslated: meaning.title.machineTranslated,
        verified: meaning.verified,
        version: meaning.version,
        flags: meaning.flags,
      }
    : {
        ...emptyView(code, available ? 'unknown' : 'unavailable'),
        ...(answer ? { range: answer.range } : {}),
      }
}

/** The most codes the service answers in one lookup (the connector's MAX_CODES_PER_LOOKUP). */
const LOOKUP_BATCH = 50

/**
 * What each code means on this vehicle, from the service: one call per 50
 * codes, so a job that has gathered more still gets every meaning. A code
 * whose batch failed reads as unavailable, the rest as answered.
 */
export async function lookupMeanings(
  organizationId: string,
  codes: string[],
  vehicle: FaultCodeVehicle | null,
  locale: string
): Promise<{ available: boolean; results: FaultCodeView[] }> {
  const unique = [...new Set(codes)]
  if (unique.length === 0) return { available: true, results: [] }
  const loaded = await connect(organizationId)
  const answers = new Map<string, FaultCodeAnswer>()
  const answered = new Set<string>()
  if (loaded?.server.lookupCodes) {
    const lookup = loaded.server.lookupCodes
    const batches: string[][] = []
    for (let i = 0; i < unique.length; i += LOOKUP_BATCH) {
      batches.push(unique.slice(i, i + LOOKUP_BATCH))
    }
    const replies = await Promise.all(
      batches.map((batch) =>
        attempt(() => lookup(loaded.ctx, { codes: batch, vehicle: vehicle ?? undefined, locale }))
      )
    )
    replies.forEach((reply, i) => {
      if (!reply.ok) return
      for (const a of reply.value) answers.set(a.code.toUpperCase(), a)
      for (const code of batches[i]) answered.add(code)
    })
  }
  return {
    available: answered.size > 0,
    results: unique.map((code) =>
      viewOf(code, answers.get(code), answered.has(code), vehicle?.make)
    ),
  }
}

/** One code with its description, causes and related codes. */
export async function codeDetailFor(
  organizationId: string,
  code: string,
  vehicle: FaultCodeVehicle | null,
  locale: string
): Promise<{ available: boolean; detail: FaultCodeDetailView }> {
  const loaded = await connect(organizationId)
  let answer: FaultCodeAnswer | null = null
  let available = false
  if (loaded?.server.codeDetail) {
    const detail = loaded.server.codeDetail
    const reply = await attempt(() =>
      detail(loaded.ctx, { code, vehicle: vehicle ?? undefined, locale })
    )
    if (reply.ok) {
      available = true
      answer = reply.value
    }
  }
  const view = viewOf(code, answer, available, vehicle?.make)
  const meaning = answer?.found ? answer.meaning : undefined
  return {
    available,
    detail: {
      ...view,
      description: meaning?.description?.text ?? null,
      sections: (meaning?.sections ?? []).map((s) => ({ kind: s.kind, text: s.text.text })),
      causes: (meaning?.causes ?? []).map((c) => ({
        key: c.key,
        likelihood: c.likelihood,
        label: c.label.text,
      })),
      related: (meaning?.related ?? []).map((r) => ({ code: r.code, title: r.title ?? null })),
      pendingCheck: meaning?.pendingCheck ?? false,
    },
  }
}

/** Codes from the service for the search palette and the lookup page. */
export async function searchServiceCodes(
  organizationId: string,
  query: string,
  locale: string,
  limit = 6
): Promise<{ available: boolean; hits: { code: string; title: string }[] }> {
  const loaded = await connect(organizationId)
  if (!loaded?.server.searchCodes) return { available: false, hits: [] }
  const search = loaded.server.searchCodes
  const reply = await attempt(() => search(loaded.ctx, { query, locale, limit }))
  if (!reply.ok) return { available: false, hits: [] }
  return {
    available: true,
    hits: reply.value.map((h) => ({ code: h.code, title: h.title.text })),
  }
}

/** Jobs in this workshop where the code was read, newest first. */
export async function jobsWithCode(
  organizationId: string,
  code: string,
  take = 20
): Promise<FaultCodeJob[]> {
  const rows = await db.vehicleFinding.findMany({
    where: { faultCode: code, vehicle: { organizationId } },
    select: {
      id: true,
      status: true,
      faultStatus: true,
      faultMeaning: true,
      createdAt: true,
      vehicleId: true,
      serviceRecord: { select: { id: true, title: true } },
      vehicle: { select: { make: true, model: true, year: true, licensePlate: true } },
    },
    orderBy: { createdAt: 'desc' },
    take,
  })
  return rows.map((r) => ({
    findingId: r.id,
    serviceRecordId: r.serviceRecord?.id ?? null,
    title: r.serviceRecord?.title ?? null,
    vehicleId: r.vehicleId,
    vehicle: `${r.vehicle.year} ${r.vehicle.make} ${r.vehicle.model}`,
    licensePlate: r.vehicle.licensePlate,
    status: r.status,
    faultStatus: r.faultStatus,
    meaning: r.faultMeaning,
    at: r.createdAt.toISOString(),
  }))
}

/**
 * When each code was first read on this vehicle in an earlier job, for the
 * "Seen before" pill. Findings of this job are left out.
 */
export async function seenBefore(
  organizationId: string,
  vehicleId: string,
  serviceRecordId: string,
  codes: string[]
): Promise<Record<string, string>> {
  if (codes.length === 0) return {}
  const rows = await db.vehicleFinding.findMany({
    where: {
      vehicleId,
      vehicle: { organizationId },
      faultCode: { in: codes },
      OR: [{ serviceRecordId: null }, { serviceRecordId: { not: serviceRecordId } }],
    },
    select: { faultCode: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
  })
  const out: Record<string, string> = {}
  for (const row of rows) {
    // Newest first, so the first one kept is the last time it was read.
    if (row.faultCode && !out[row.faultCode]) out[row.faultCode] = row.createdAt.toISOString()
  }
  return out
}

// ---- reports of a wrong meaning --------------------------------------------

type ReportMeta = {
  reportedAt?: string
  reason?: FaultCodeReportReason
  status?: 'open' | 'resolved'
  outcome?: ReportState['outcome']
  message?: string | null
}

function reportStateOf(code: string, metadata: Record<string, unknown> | null): ReportState {
  const meta = (metadata ?? {}) as ReportMeta
  return {
    code,
    reportedAt: meta.reportedAt ?? new Date(0).toISOString(),
    reason: meta.reason ?? 'other',
    status: meta.status ?? 'open',
    outcome: meta.outcome ?? null,
    message: meta.message ?? null,
  }
}

/**
 * Sends "this meaning is wrong" and remembers it in the connection's link
 * store, so the meaning can say "Reported by you". Null when the service
 * could not take it.
 */
export async function sendReport(
  organizationId: string,
  input: {
    code: string
    version: number
    lang: string
    reason: FaultCodeReportReason
    note?: string
    vehicle: FaultCodeVehicle | null
  }
): Promise<ReportState | null> {
  const loaded = await connect(organizationId)
  if (!loaded?.server.reportDefinition) return null
  const report = loaded.server.reportDefinition
  const reply = await attempt(() =>
    report(loaded.ctx, {
      code: input.code,
      version: input.version,
      lang: input.lang,
      reason: input.reason,
      note: input.note,
      vehicle: input.vehicle ?? undefined,
      automatic: false,
      workshopRef: organizationId,
    })
  )
  if (!reply.ok) return null
  const metadata: ReportMeta = {
    reportedAt: new Date().toISOString(),
    reason: input.reason,
    status: reply.value.status,
    outcome: null,
    message: null,
  }
  await loaded.ctx.links.set(REPORT_LINK, input.code, {
    remoteId: reply.value.id,
    metadata: metadata as Record<string, unknown>,
  })
  return reportStateOf(input.code, metadata as Record<string, unknown>)
}

/**
 * What this workshop reported about these codes. Asks the service how the
 * open ones stand and keeps the answer, so a settled report reads as
 * settled. When the service does not answer, the last known state is shown.
 */
export async function reportStates(
  organizationId: string,
  codes: string[]
): Promise<Record<string, ReportState>> {
  const loaded = await connect(organizationId)
  if (!loaded) return {}
  const links = loaded.ctx.links
  const found = await Promise.all(
    [...new Set(codes)].map(async (code) => ({ code, link: await links.get(REPORT_LINK, code) }))
  )
  const out: Record<string, ReportState> = {}
  const open: { code: string; id: string; metadata: Record<string, unknown> }[] = []
  for (const { code, link } of found) {
    if (!link) continue
    out[code] = reportStateOf(code, link.metadata)
    if (out[code].status === 'open') {
      open.push({ code, id: link.remoteId, metadata: link.metadata ?? {} })
    }
  }
  if (open.length > 0 && loaded.server.reportStatus) {
    const status = loaded.server.reportStatus
    const reply = await attempt(() =>
      status(
        loaded.ctx,
        open.map((o) => o.id)
      )
    )
    if (reply.ok) {
      const byId = new Map(reply.value.map((r) => [r.id, r]))
      for (const o of open) {
        const now = byId.get(o.id)
        if (!now || now.status !== 'resolved') continue
        const metadata = {
          ...o.metadata,
          status: now.status,
          outcome: now.outcome,
          message: now.message,
        }
        await links.set(REPORT_LINK, o.code, { remoteId: o.id, metadata })
        out[o.code] = reportStateOf(o.code, metadata)
      }
    }
  }
  return out
}

// ---- shared fixes ------------------------------------------------------------

/**
 * Where the fixes this workshop shared are kept, in the connection's link
 * store: one link per fix under its code, so a code page finds them with
 * one read. The text and photos live in the service, never here.
 */
export function fixLink(code: string): string {
  return `fault-code-fix:${code}`
}

function sharedFixOf(fix: FaultCodeFix): SharedFix {
  return {
    id: fix.id,
    lang: fix.lang,
    text: fix.text,
    vehicle: fix.vehicle
      ? {
          make: fix.vehicle.make ?? null,
          model: fix.vehicle.model ?? null,
          year: fix.vehicle.year ?? null,
          engine: fix.vehicle.engine ?? null,
        }
      : null,
    photos: fix.photos.map((p) => ({ n: p.n, width: p.width, height: p.height })),
    createdAt: fix.createdAt,
  }
}

function ownFixOf(fix: FaultCodeOwnFix): OwnFix {
  return {
    ...sharedFixOf(fix),
    status: fix.status,
    reason: fix.reason,
    reviewedAt: fix.reviewedAt,
    edited: fix.edited,
  }
}

export type ShareFixResult =
  | { ok: true; fix: OwnFix }
  | { ok: false; reason: FaultCodeFixRefusal | 'unavailable' }

/**
 * Shares what fixed a code with the service, photos included, and keeps the
 * fix's id in the link store so the code page can show how its review
 * stands. Nothing of it is written here but the id.
 */
export async function shareFix(
  organizationId: string,
  input: {
    code: string
    text: string
    lang: string
    vehicle: FaultCodeVehicle | null
    photos: Blob[]
  }
): Promise<ShareFixResult> {
  const loaded = await connect(organizationId)
  if (!loaded?.server.shareFix) return { ok: false, reason: 'unavailable' }
  const share = loaded.server.shareFix
  const reply = await attempt(() =>
    share(loaded.ctx, {
      code: input.code,
      text: input.text,
      lang: input.lang,
      vehicle: input.vehicle ?? undefined,
      workshopRef: organizationId,
      photos: input.photos,
    })
  )
  if (!reply.ok) return { ok: false, reason: 'unavailable' }
  if (!reply.value.ok) return { ok: false, reason: reply.value.reason }
  const id = reply.value.id
  await loaded.ctx.links.set(fixLink(input.code), id, {
    remoteId: id,
    metadata: { code: input.code, sentAt: new Date().toISOString() },
  })
  // The service's own view of it (photo sizes, the vehicle as kept); what was
  // sent when the service is slow to say.
  const status = loaded.server.fixStatus
  const fresh = status ? await attempt(() => status(loaded.ctx, [id])) : null
  const found = fresh?.ok ? fresh.value.find((f) => f.id === id) : undefined
  if (found) return { ok: true, fix: ownFixOf(found) }
  return {
    ok: true,
    fix: {
      id,
      lang: input.lang,
      text: input.text,
      vehicle: input.vehicle
        ? {
            make: input.vehicle.make ?? null,
            model: input.vehicle.model ?? null,
            year: input.vehicle.year ?? null,
            engine: input.vehicle.engine ?? null,
          }
        : null,
      photos: [],
      createdAt: new Date().toISOString(),
      status: 'pending',
      reason: null,
      reviewedAt: null,
      edited: false,
    },
  }
}

/**
 * The code page's fixes: the ones other workshops shared and a person
 * published, and this workshop's own with how their review stands. Its own
 * published fixes are listed with its own, not as another workshop's. A fix
 * the service no longer has (withdrawn elsewhere) is forgotten here too.
 */
export async function fixesFor(organizationId: string, code: string): Promise<CodeFixes> {
  const none: CodeFixes = { available: false, published: [], own: [] }
  const loaded = await connect(organizationId)
  if (!loaded?.server.publishedFixes) return none
  const { links } = loaded.ctx
  const ownIds = [...(await links.remoteIds(fixLink(code)))]
  const listing = loaded.server.publishedFixes
  const status = loaded.server.fixStatus
  const [published, own] = await Promise.all([
    attempt(() => listing(loaded.ctx, { code, limit: 20 })),
    ownIds.length > 0 && status
      ? attempt(() => status(loaded.ctx, ownIds))
      : Promise.resolve({ ok: true as const, value: [] as FaultCodeOwnFix[] }),
  ])
  if (!published.ok) return none
  const mine = new Set(ownIds)
  let ownFixes: OwnFix[] = []
  if (own.ok) {
    const answered = new Set(own.value.map((f) => f.id))
    await Promise.all(
      ownIds.filter((id) => !answered.has(id)).map((id) => links.remove(fixLink(code), id))
    )
    ownFixes = own.value.map(ownFixOf).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }
  return {
    available: true,
    published: published.value.filter((f) => !mine.has(f.id)).map(sharedFixOf),
    own: ownFixes,
  }
}

/**
 * Withdraws a fix this workshop shared: the service deletes it with its
 * photos. Only a fix in this workshop's link store can be withdrawn from
 * here.
 */
export async function withdrawSharedFix(
  organizationId: string,
  code: string,
  id: string
): Promise<'withdrawn' | 'not_found' | 'unavailable'> {
  const loaded = await connect(organizationId)
  if (!loaded?.server.withdrawFix) return 'unavailable'
  const link = await loaded.ctx.links.get(fixLink(code), id)
  if (!link) return 'not_found'
  const withdraw = loaded.server.withdrawFix
  const reply = await attempt(() =>
    withdraw(loaded.ctx, { id: link.remoteId, workshopRef: organizationId })
  )
  if (!reply.ok) return 'unavailable'
  // Gone at the service either way: withdrawn now, or before.
  await loaded.ctx.links.remove(fixLink(code), id)
  return 'withdrawn'
}

/** One photo of a fix this workshop may see, as a stream; null when it may not. */
export async function sharedFixPhoto(
  organizationId: string,
  query: { id: string; n: number; size: 'full' | 'thumb' }
): Promise<{ body: ReadableStream<Uint8Array>; length: number | null } | null> {
  const loaded = await connect(organizationId)
  if (!loaded?.server.fixPhoto) return null
  const photo = loaded.server.fixPhoto
  const reply = await attempt(() => photo(loaded.ctx, { ...query, workshopRef: organizationId }))
  return reply.ok ? reply.value : null
}
