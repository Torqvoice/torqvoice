import 'server-only'
import { db } from '@/lib/db'
import { getFeatures } from '@/lib/features'
import { getManifest, listManifests } from '@/integrations/registry'
import { FAULT_CODES_CAPABILITY } from '@/integrations/torqvoice-codes/manifest'
import { loadConnection } from '@/features/integrations/Lib/connections'
import { autoConnectFor } from '@/features/integrations/Lib/auto-connect'
import {
  isFaultCode,
  isManufacturerCode,
  isOemCode,
  normalizeAnyMakeCode,
  normalizeOemCode,
  oemSourceFor,
} from './codes'
import { isMakeKey, makeName } from './makes'
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
  FaultCodeOwnWaveform,
  FaultCodeResearch,
  FaultCodeResearchRefusal,
  FaultCodeWaveformInput,
  WaveformFileRole,
  FaultCodeVehicle,
  OemMeaning,
  CodeImportChecked,
  CodeImportCounts,
  CodeImportInput,
  CodeImportRefusal,
  CodeImportStatus,
} from '@/features/integrations/Lib/types'
import type {
  CodeFixes,
  FaultCodeDetailView,
  FaultCodeJob,
  FaultCodeView,
  MeaningSource,
  OemMeaningView,
  OemSearchHit,
  OwnFix,
  CodeWaveforms,
  ReportState,
  ResearchState,
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
  // A manufacturer's own code (BMW's 2A82) is looked up in that make's data,
  // one call per code; it only counts on a car of that make.
  const source = oemSourceFor(vehicle?.make)
  const oemCodes = source ? unique.filter((c) => !isFaultCode(c) && isOemCode(c)) : []
  const obdCodes = unique.filter((c) => isFaultCode(c))
  const oem = new Map<string, FaultCodeView>()
  if (source && oemCodes.length > 0) {
    for (const view of await oemViews(loaded, source, oemCodes, vehicle, locale)) {
      oem.set(view.code, view)
    }
  }
  if (loaded?.server.lookupCodes && obdCodes.length > 0) {
    const lookup = loaded.server.lookupCodes
    const batches: string[][] = []
    for (let i = 0; i < obdCodes.length; i += LOOKUP_BATCH) {
      batches.push(obdCodes.slice(i, i + LOOKUP_BATCH))
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
  const oemAnswered = [...oem.values()].some((v) => v.state !== 'unavailable')
  return {
    available: answered.size > 0 || oemAnswered || (obdCodes.length === 0 && oem.size === 0),
    results: unique.map(
      (code) => oem.get(code) ?? viewOf(code, answers.get(code), answered.has(code), vehicle?.make)
    ),
  }
}

/** The text of a manufacturer meaning to show: its English when the reader's language is English and the manufacturer has one. */
export function oemText(meaning: OemMeaning, locale: string): { text: string; lang: string } {
  if (locale.toLowerCase().startsWith('en') && meaning.textEn)
    return { text: meaning.textEn, lang: 'en' }
  return { text: meaning.text, lang: meaning.textLang }
}

/**
 * Manufacturer codes on a car of that make, for lists and findings: the
 * meaning that fits the car (the service puts it first), or the first one.
 */
async function oemViews(
  loaded: Loaded | null,
  source: string,
  codes: string[],
  vehicle: FaultCodeVehicle | null,
  locale: string
): Promise<FaultCodeView[]> {
  const lookup = loaded?.server.oemCode
  if (!loaded || !lookup) return codes.map((code) => emptyView(code, 'unavailable'))
  const replies = await Promise.all(
    codes.map((code) =>
      attempt(() =>
        lookup(loaded.ctx, { source, code, engine: vehicle?.engine ?? undefined, locale })
      )
    )
  )
  return codes.map((code, i) => {
    const reply = replies[i]
    if (!reply.ok) return emptyView(code, 'unavailable')
    const meaning = reply.value?.meanings[0]
    if (!meaning) return { ...emptyView(code, 'unknown'), range: 'manufacturer' as const }
    // Our own title reads better than the control unit's text, when there is one.
    const shown = meaning.title
      ? { text: meaning.title, lang: meaning.lang ?? 'en' }
      : oemText(meaning, locale)
    return {
      ...emptyView(code, 'found'),
      range: 'manufacturer' as const,
      title: shown.text,
      lang: shown.lang,
      source: 'manufacturer' as const,
      make: vehicle?.make ?? null,
    }
  })
}

/** Where this workshop's code imports are kept, one link per import. */
const IMPORT_LINK = 'fault-code-import'

export type CodeImportCheck =
  | { ok: true; counts: CodeImportCounts; rows: CodeImportChecked[] }
  | { ok: false; reason: CodeImportRefusal | 'unavailable' }

/** What each row of an import file would do for the make, keeping nothing. */
export async function checkCodeImportFor(
  organizationId: string,
  input: Omit<CodeImportInput, 'workshopRef' | 'source' | 'fileName'>
): Promise<CodeImportCheck> {
  const loaded = await connect(organizationId)
  if (!loaded?.server.checkCodeImport) return { ok: false, reason: 'unavailable' }
  const check = loaded.server.checkCodeImport
  const reply = await attempt(() => check(loaded.ctx, input))
  if (!reply.ok) return { ok: false, reason: 'unavailable' }
  return reply.value
}

/** Sends an import's new and changed codes for review, and keeps its id for its status. */
export async function sendCodeImportFor(
  organizationId: string,
  input: Omit<CodeImportInput, 'workshopRef'>
): Promise<
  | { ok: true; id: string; counts: CodeImportCounts }
  | { ok: false; reason: CodeImportRefusal | 'unavailable' }
> {
  const loaded = await connect(organizationId)
  if (!loaded?.server.sendCodeImport) return { ok: false, reason: 'unavailable' }
  const send = loaded.server.sendCodeImport
  const reply = await attempt(() => send(loaded.ctx, { ...input, workshopRef: organizationId }))
  if (!reply.ok) return { ok: false, reason: 'unavailable' }
  if (!reply.value.ok) return reply.value
  await loaded.ctx.links.set(IMPORT_LINK, reply.value.id, {
    remoteId: reply.value.id,
    metadata: { make: input.make, sentAt: new Date().toISOString() },
  })
  return reply.value
}

/** This workshop's imports, newest first, with how their codes stand. */
export async function codeImportsFor(organizationId: string): Promise<CodeImportStatus[]> {
  const loaded = await connect(organizationId)
  const status = loaded?.server.codeImportStatus
  if (!loaded || !status) return []
  const { links } = loaded.ctx
  const ids = [...(await links.remoteIds(IMPORT_LINK))]
  if (ids.length === 0) return []
  const reply = await attempt(() => status(loaded.ctx, ids))
  if (!reply.ok) return []
  const answered = new Set(reply.value.map((i) => i.id))
  await Promise.all(
    ids.filter((id) => !answered.has(id)).map((id) => links.remove(IMPORT_LINK, id))
  )
  return reply.value.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

/** Where this workshop's shared waveforms are kept, one link per waveform under its code. */
export function waveformLink(code: string): string {
  return `fault-code-waveform:${code}`
}

/**
 * A code's waveforms for its page: the published ones from other workshops, and this
 * workshop's own with how their review stands. One the service no longer has is forgotten.
 */
export async function waveformsFor(organizationId: string, code: string): Promise<CodeWaveforms> {
  const none: CodeWaveforms = { available: false, published: [], own: [] }
  const loaded = await connect(organizationId)
  if (!loaded?.server.publishedWaveforms) return none
  const { links } = loaded.ctx
  const ownIds = [...(await links.remoteIds(waveformLink(code)))]
  const listing = loaded.server.publishedWaveforms
  const status = loaded.server.waveformStatus
  const [published, own] = await Promise.all([
    attempt(() => listing(loaded.ctx, { code })),
    ownIds.length > 0 && status
      ? attempt(() => status(loaded.ctx, ownIds))
      : Promise.resolve({ ok: true as const, value: [] as FaultCodeOwnWaveform[] }),
  ])
  if (!published.ok) return none
  const mine = new Set(ownIds)
  let ownWaveforms: FaultCodeOwnWaveform[] = []
  if (own.ok) {
    const answered = new Set(own.value.map((w) => w.id))
    await Promise.all(
      ownIds.filter((id) => !answered.has(id)).map((id) => links.remove(waveformLink(code), id))
    )
    ownWaveforms = own.value.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }
  return {
    available: true,
    published: published.value.filter((w) => !mine.has(w.id)),
    own: ownWaveforms,
  }
}

export type ShareWaveformResult =
  | { ok: true; waveform: FaultCodeOwnWaveform }
  | { ok: false; reason: FaultCodeFixRefusal | 'unavailable' }

/** Shares a scope recording with the service and keeps its id, so the page shows its review. */
export async function shareWaveform(
  organizationId: string,
  input: Omit<FaultCodeWaveformInput, 'workshopRef'>
): Promise<ShareWaveformResult> {
  const loaded = await connect(organizationId)
  if (!loaded?.server.shareWaveform) return { ok: false, reason: 'unavailable' }
  const share = loaded.server.shareWaveform
  const reply = await attempt(() => share(loaded.ctx, { ...input, workshopRef: organizationId }))
  if (!reply.ok) return { ok: false, reason: 'unavailable' }
  if (!reply.value.ok) return { ok: false, reason: reply.value.reason }
  const id = reply.value.id
  await loaded.ctx.links.set(waveformLink(input.code), id, {
    remoteId: id,
    metadata: { code: input.code, sentAt: new Date().toISOString() },
  })
  const status = loaded.server.waveformStatus
  const fresh = status ? await attempt(() => status(loaded.ctx, [id])) : null
  const found = fresh?.ok ? fresh.value.find((w) => w.id === id) : undefined
  if (found) return { ok: true, waveform: found }
  return {
    ok: true,
    waveform: {
      id,
      code: input.code,
      meaning: input.meaning ?? null,
      kind: input.kind,
      title: input.title,
      condition: input.condition ?? null,
      note: input.note ?? null,
      lang: input.lang,
      vehicle: input.vehicle ?? null,
      preview: null,
      files: input.files.map((f) => ({
        role: f.role,
        name: f.name,
        size: f.blob.size,
        width: null,
        height: null,
      })),
      createdAt: new Date().toISOString(),
      status: 'pending',
      reason: null,
      reviewedAt: null,
    },
  }
}

/** Withdraws a waveform this workshop shared; only one in its link store. */
export async function withdrawSharedWaveform(
  organizationId: string,
  code: string,
  id: string
): Promise<'withdrawn' | 'not_found' | 'unavailable'> {
  const loaded = await connect(organizationId)
  if (!loaded?.server.withdrawWaveform) return 'unavailable'
  const { links } = loaded.ctx
  const ids = await links.remoteIds(waveformLink(code))
  if (!ids.has(id)) return 'not_found'
  const withdraw = loaded.server.withdrawWaveform
  const reply = await attempt(() => withdraw(loaded.ctx, { id, workshopRef: organizationId }))
  if (!reply.ok) return 'unavailable'
  await links.remove(waveformLink(code), id)
  return 'withdrawn'
}

/** One file of a waveform, streamed from the service: a published one's, or this workshop's own. */
export async function sharedWaveformFile(
  organizationId: string,
  query: { id: string; role: WaveformFileRole; size: 'full' | 'thumb' }
) {
  const loaded = await connect(organizationId)
  if (!loaded?.server.waveformFile) return null
  const file = loaded.server.waveformFile
  const reply = await attempt(() => file(loaded.ctx, { ...query, workshopRef: organizationId }))
  return reply.ok ? reply.value : null
}

/** A code's researched fixes for its page (P0420, BMW-2A82), and whether research is on. */
export async function researchFor(organizationId: string, code: string): Promise<ResearchState> {
  const loaded = await connect(organizationId)
  const read = loaded?.server.researchFor
  if (!loaded || !read) return { available: false, items: [] }
  const reply = await attempt(() => read(loaded.ctx, { code }))
  return reply.ok
    ? { available: reply.value.available, items: reply.value.research }
    : { available: false, items: [] }
}

export type ResearchOutcome =
  | { outcome: 'done'; research: FaultCodeResearch }
  | { outcome: FaultCodeResearchRefusal | 'failed' }

/** Researches a code, or one meaning of a make's code, for this workshop. */
export async function requestResearch(
  organizationId: string,
  input: { code: string; meaning?: string; vehicle: FaultCodeVehicle | null }
): Promise<ResearchOutcome> {
  const loaded = await connect(organizationId)
  const ask = loaded?.server.research
  if (!loaded || !ask) return { outcome: 'unavailable' }
  const reply = await attempt(() =>
    ask(loaded.ctx, {
      code: input.code,
      meaning: input.meaning,
      vehicle: input.vehicle ?? undefined,
      workshopRef: organizationId,
    })
  )
  if (!reply.ok) return { outcome: 'failed' }
  return reply.value.ok
    ? { outcome: 'done', research: reply.value.research }
    : { outcome: reply.value.reason }
}

/** "Did this fix it?" for a research, once per workshop. */
export async function rateResearch(
  organizationId: string,
  id: string,
  helpful: boolean
): Promise<boolean> {
  const loaded = await connect(organizationId)
  const rate = loaded?.server.rateResearch
  if (!loaded || !rate) return false
  const reply = await attempt(() => rate(loaded.ctx, { id, helpful, workshopRef: organizationId }))
  return reply.ok && reply.value
}

/** The makes whose own codes the service answers for ("bmw"); none when it serves none. */
export async function oemMakesFor(organizationId: string): Promise<string[]> {
  const loaded = await connect(organizationId)
  const list = loaded?.server.oemMakes
  if (!loaded || !list) return []
  const reply = await attempt(() => list(loaded.ctx))
  return reply.ok ? reply.value.filter(isMakeKey) : []
}

/** A make's meanings as its code's page shows them, the one fitting the car first. */
export function oemMeaningViews(meanings: OemMeaning[], locale: string): OemMeaningView[] {
  return meanings.map((m) => {
    const own = oemText(m, locale)
    return {
      id: m.id,
      title: m.title ?? own.text,
      titleLang: m.title ? (m.lang ?? 'en') : own.lang,
      ownTitle: Boolean(m.title),
      text: own.text,
      textLang: own.lang,
      textEn: m.textEn,
      description: m.description,
      sections: m.sections,
      causes: m.causes,
      modules: m.modules,
      vehicles: m.vehicles,
      engines: m.engines,
      matches: m.matches,
    }
  })
}

/**
 * A make's own code on its page: whether the service serves the make, and
 * every meaning the code has there. `available` is false when the service
 * could not be reached.
 */
export async function oemCodeFor(
  organizationId: string,
  make: string,
  code: string,
  vehicle: FaultCodeVehicle | null,
  locale: string
): Promise<{ available: boolean; served: boolean; meanings: OemMeaningView[] }> {
  const loaded = await connect(organizationId)
  const lookup = loaded?.server.oemCode
  if (!loaded || !lookup) return { available: false, served: false, meanings: [] }
  const reply = await attempt(() =>
    lookup(loaded.ctx, { source: make, code, engine: vehicle?.engine ?? undefined, locale })
  )
  if (!reply.ok) return { available: false, served: false, meanings: [] }
  if (!reply.value) return { available: true, served: false, meanings: [] }
  return { available: true, served: true, meanings: oemMeaningViews(reply.value.meanings, locale) }
}

/**
 * A make's own codes for what was typed (BMW's 283700), for the lookup page
 * and the search palette: one hit per make the service serves that has it.
 * Too short to be a whole code, or not one at all, finds nothing.
 */
export async function searchOemCodes(
  organizationId: string,
  query: string,
  locale: string,
  served?: string[]
): Promise<OemSearchHit[]> {
  const loaded = await connect(organizationId)
  // One call across every make, where the service can; else one call per make it serves.
  if (loaded?.server.findOemCode) {
    const find = loaded.server.findOemCode
    const anyCode = normalizeAnyMakeCode(query)
    if (!anyCode || anyCode.length < 4) return []
    const reply = await attempt(() => find(loaded.ctx, { code: anyCode, locale }))
    if (!reply.ok) return []
    return reply.value.map((h) => ({
      make: h.make,
      makeName: makeName(h.make),
      code: h.code,
      title: h.title ?? h.code,
      meanings: h.meanings,
    }))
  }
  const code = normalizeOemCode(query)
  if (!code || code.length < 4) return []
  const makes = served ?? (await oemMakesFor(organizationId))
  const found = await Promise.all(
    makes.map(async (make) => {
      const answer = await oemCodeFor(organizationId, make, code, null, locale)
      const first = answer.meanings[0]
      return first
        ? {
            make,
            makeName: makeName(make),
            code,
            title: first.title,
            meanings: answer.meanings.length,
          }
        : null
    })
  )
  return found.filter((h): h is OemSearchHit => h !== null)
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
    meaning: fix.meaning,
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
    meaning?: string
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
      meaning: input.meaning,
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
      meaning: input.meaning ?? null,
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
