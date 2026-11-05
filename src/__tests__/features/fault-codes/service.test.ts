import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The layer between the screens and the code service: a service that is
 * down gives "not available" rather than an error, a cloud plan without the
 * feature, or an install without the connector, never reaches the service
 * at all, and a shared fix is remembered here by its id alone.
 */

const h = vi.hoisted(() => ({
  connections: [] as { id: string; connectorId: string }[],
  lookupCodes: vi.fn(),
  shareFix: vi.fn(),
  fixStatus: vi.fn(),
  withdrawFix: vi.fn(),
  publishedFixes: vi.fn(),
  links: new Map<string, { remoteId: string; metadata: Record<string, unknown> | null }>(),
  autoConnectFor: vi.fn(async () => false),
  features: { faultCodes: true, integrations: false } as Record<string, boolean>,
  manifests: [
    { id: 'torqvoice-codes', capabilities: ['diagnostics.codes'], plan: 'faultCodes' },
  ] as { id: string; capabilities: string[]; plan?: string }[],
}))

vi.mock('@/lib/db', () => ({
  db: {
    integrationConnection: { findMany: vi.fn(async () => h.connections) },
  },
}))
vi.mock('@/lib/features', () => ({ getFeatures: vi.fn(async () => h.features) }))
vi.mock('@/integrations/registry', () => ({
  listManifests: () => h.manifests,
  getManifest: (id: string) => h.manifests.find((m) => m.id === id) ?? null,
}))
vi.mock('@/features/integrations/Lib/auto-connect', () => ({
  autoConnectFor: h.autoConnectFor,
}))
/** The connection's link store, in memory. */
const links = {
  get: vi.fn(async (type: string, id: string) => {
    const link = h.links.get(`${type}|${id}`)
    return link ? { ...link, remoteUrl: null, checksum: null } : null
  }),
  set: vi.fn(async (type: string, id: string, link: { remoteId: string; metadata?: unknown }) => {
    h.links.set(`${type}|${id}`, {
      remoteId: link.remoteId,
      metadata: (link.metadata as Record<string, unknown>) ?? null,
    })
  }),
  remove: vi.fn(async (type: string, id: string) => {
    h.links.delete(`${type}|${id}`)
  }),
  remoteIds: vi.fn(
    async (type: string) =>
      new Set(
        [...h.links.entries()].filter(([k]) => k.startsWith(`${type}|`)).map(([, v]) => v.remoteId)
      )
  ),
}

vi.mock('@/features/integrations/Lib/connections', () => ({
  loadConnection: vi.fn(async () => ({
    ctx: { links },
    server: {
      lookupCodes: h.lookupCodes,
      shareFix: h.shareFix,
      fixStatus: h.fixStatus,
      withdrawFix: h.withdrawFix,
      publishedFixes: h.publishedFixes,
    },
  })),
}))

const { fixesFor, lookupMeanings, shareFix, viewOf, withdrawSharedFix } = await import(
  '@/features/fault-codes/Lib/service.server'
)

const P0420 = {
  code: 'P0420',
  found: true,
  range: 'standard' as const,
  meaning: {
    system: 'P' as const,
    category: 'powertrain',
    scope: 'generic' as const,
    source: 'standard' as const,
    version: 2,
    verified: true,
    pendingCheck: false,
    title: {
      text: 'Catalyst efficiency below threshold (bank 1)',
      lang: 'en',
      machineTranslated: false,
    },
    flags: { warningLight: true, emissions: true, driveCycle: false, limpMode: false },
    related: [],
    causes: [],
  },
}

beforeEach(() => {
  h.connections = [{ id: 'conn1', connectorId: 'torqvoice-codes' }]
  h.links.clear()
  for (const fn of [h.shareFix, h.fixStatus, h.withdrawFix, h.publishedFixes]) fn.mockReset()
  h.features = { faultCodes: true, integrations: false }
  h.manifests = [{ id: 'torqvoice-codes', capabilities: ['diagnostics.codes'], plan: 'faultCodes' }]
  h.lookupCodes.mockReset()
  h.autoConnectFor.mockReset()
  h.autoConnectFor.mockResolvedValue(false)
})

describe('fault code meanings for a workshop', () => {
  it("gives the service's meaning, marked generic", async () => {
    h.lookupCodes.mockResolvedValueOnce([P0420])
    const { available, results } = await lookupMeanings(
      'org1',
      ['P0420'],
      { make: 'Volkswagen' },
      'en'
    )
    expect(available).toBe(true)
    expect(results[0]).toMatchObject({
      code: 'P0420',
      state: 'found',
      title: 'Catalyst efficiency below threshold (bank 1)',
      source: 'generic',
      version: 2,
    })
  })

  it('says not available when the service is down', async () => {
    h.lookupCodes.mockRejectedValueOnce(new Error('fetch failed'))
    const { available, results } = await lookupMeanings('org1', ['P0420', 'P1570'], null, 'en')
    expect(available).toBe(false)
    expect(results[0]).toMatchObject({ code: 'P0420', state: 'unavailable', title: null })
    expect(results[1]).toMatchObject({ code: 'P1570', state: 'unavailable', title: null })
  })

  it('asks in batches of 50, so a job with more codes still gets every meaning', async () => {
    const codes = Array.from({ length: 60 }, (_, i) => `P0${(300 + i).toString(16).toUpperCase()}`)
    h.lookupCodes.mockImplementation(async (_ctx: unknown, q: { codes: string[] }) =>
      q.codes.map((code) => ({ ...P0420, code }))
    )
    const { available, results } = await lookupMeanings('org1', codes, null, 'en')
    expect(h.lookupCodes).toHaveBeenCalledTimes(2)
    expect(h.lookupCodes.mock.calls[0][1].codes).toHaveLength(50)
    expect(h.lookupCodes.mock.calls[1][1].codes).toHaveLength(10)
    expect(available).toBe(true)
    expect(results.filter((r) => r.state === 'found')).toHaveLength(60)
  })

  it('marks only the codes of a batch that failed as unavailable', async () => {
    const codes = Array.from({ length: 51 }, (_, i) => `P0${(300 + i).toString(16).toUpperCase()}`)
    h.lookupCodes
      .mockImplementationOnce(async (_ctx: unknown, q: { codes: string[] }) =>
        q.codes.map((code) => ({ ...P0420, code }))
      )
      .mockRejectedValueOnce(new Error('fetch failed'))
    const { available, results } = await lookupMeanings('org1', codes, null, 'en')
    expect(available).toBe(true)
    expect(results.slice(0, 50).every((r) => r.state === 'found')).toBe(true)
    expect(results[50]).toMatchObject({ state: 'unavailable', title: null })
  })

  it('never asks the service when the plan does not include it or nothing is connected', async () => {
    h.features = { faultCodes: false, integrations: true }
    expect((await lookupMeanings('org1', ['P0420'], null, 'en')).available).toBe(false)
    h.features = { faultCodes: true, integrations: false }
    h.connections = []
    expect((await lookupMeanings('org1', ['P0420'], null, 'en')).available).toBe(false)
    h.manifests = []
    expect((await lookupMeanings('org1', ['P0420'], null, 'en')).available).toBe(false)
    expect(h.lookupCodes).not.toHaveBeenCalled()
  })

  it('answers on the first lookup of a workshop the cloud connects by itself', async () => {
    h.connections = []
    h.autoConnectFor.mockImplementationOnce(async () => {
      h.connections = [{ id: 'auto', connectorId: 'torqvoice-codes' }]
      return true
    })
    h.lookupCodes.mockResolvedValueOnce([P0420])
    const { available, results } = await lookupMeanings('org1', ['P0420'], null, 'en')
    expect(available).toBe(true)
    expect(results[0]).toMatchObject({ code: 'P0420', state: 'found' })
    expect(h.autoConnectFor).toHaveBeenCalledWith('org1', 'diagnostics.codes')
  })

  it('tells a manufacturer code the service does not know from a standard one', () => {
    expect(
      viewOf('P1570', { code: 'P1570', found: false, range: 'manufacturer' }, true, 'VW')
    ).toMatchObject({ state: 'unknown', range: 'manufacturer' })
    expect(
      viewOf('P0420', { code: 'P0420', found: false, range: 'standard' }, true, 'VW')
    ).toMatchObject({ state: 'unknown', range: 'standard' })
    // No answer at all: the range still follows from the code.
    expect(viewOf('U2100', null, false, undefined)).toMatchObject({
      state: 'unavailable',
      range: 'manufacturer',
    })
  })
})

const fix = (id: string, patch: Record<string, unknown> = {}) => ({
  id,
  code: 'P0420',
  lang: 'en',
  text: `Fix ${id}`,
  vehicle: { make: 'Volkswagen', model: 'Golf', year: 2014 },
  photos: [],
  createdAt: '2026-11-05T10:00:00Z',
  ...patch,
})

describe('shared fixes for a workshop', () => {
  it('remembers only the id of a fix it shared, and shows it waiting for review', async () => {
    h.shareFix.mockResolvedValueOnce({ ok: true, id: 'f1' })
    h.fixStatus.mockResolvedValueOnce([
      fix('f1', { status: 'pending', reason: null, reviewedAt: null }),
    ])
    const photo = new Blob(['jpeg'], { type: 'image/jpeg' })
    const result = await shareFix('org1', {
      code: 'P0420',
      text: 'Chafed wire at the rear O2 sensor plug',
      lang: 'nb',
      vehicle: { make: 'Volkswagen', model: 'Golf', year: 2014, engine: 'CAXA' },
      photos: [photo],
    })
    expect(h.shareFix).toHaveBeenCalledWith(expect.anything(), {
      code: 'P0420',
      text: 'Chafed wire at the rear O2 sensor plug',
      lang: 'nb',
      vehicle: { make: 'Volkswagen', model: 'Golf', year: 2014, engine: 'CAXA' },
      workshopRef: 'org1',
      photos: [photo],
    })
    expect(result).toMatchObject({ ok: true, fix: { id: 'f1', status: 'pending' } })
    expect([...h.links.entries()]).toEqual([
      [
        'fault-code-fix:P0420|f1',
        { remoteId: 'f1', metadata: { code: 'P0420', sentAt: expect.any(String) } },
      ],
    ])
  })

  it('passes on why the service would not take it, and remembers nothing', async () => {
    h.shareFix.mockResolvedValueOnce({ ok: false, reason: 'paused' })
    const result = await shareFix('org1', {
      code: 'P0420',
      text: 'x',
      lang: 'en',
      vehicle: null,
      photos: [],
    })
    expect(result).toEqual({ ok: false, reason: 'paused' })
    h.shareFix.mockRejectedValueOnce(new Error('fetch failed'))
    expect(
      await shareFix('org1', { code: 'P0420', text: 'x', lang: 'en', vehicle: null, photos: [] })
    ).toEqual({ ok: false, reason: 'unavailable' })
    expect(h.links.size).toBe(0)
  })

  it("lists other workshops' fixes apart from its own, and forgets one the service no longer has", async () => {
    h.links.set('fault-code-fix:P0420|mine', { remoteId: 'mine', metadata: null })
    h.links.set('fault-code-fix:P0420|gone', { remoteId: 'gone', metadata: null })
    h.publishedFixes.mockResolvedValueOnce([fix('theirs'), fix('mine')])
    h.fixStatus.mockResolvedValueOnce([
      fix('mine', { status: 'published', reason: null, reviewedAt: '2026-11-06T09:00:00Z' }),
    ])
    const fixes = await fixesFor('org1', 'P0420')
    expect(fixes.available).toBe(true)
    expect(fixes.published.map((f) => f.id)).toEqual(['theirs'])
    expect(fixes.own).toMatchObject([{ id: 'mine', status: 'published' }])
    expect(h.links.has('fault-code-fix:P0420|gone')).toBe(false)
  })

  it('says not available when the service does not answer', async () => {
    h.publishedFixes.mockRejectedValueOnce(new Error('fetch failed'))
    expect(await fixesFor('org1', 'P0420')).toEqual({
      available: false,
      published: [],
      own: [],
    })
  })

  it('withdraws only a fix this workshop sent, and forgets it', async () => {
    expect(await withdrawSharedFix('org1', 'P0420', 'someone-elses')).toBe('not_found')
    expect(h.withdrawFix).not.toHaveBeenCalled()

    h.links.set('fault-code-fix:P0420|mine', { remoteId: 'mine', metadata: null })
    h.withdrawFix.mockResolvedValueOnce(true)
    expect(await withdrawSharedFix('org1', 'P0420', 'mine')).toBe('withdrawn')
    expect(h.withdrawFix).toHaveBeenCalledWith(expect.anything(), {
      id: 'mine',
      workshopRef: 'org1',
    })
    expect(h.links.size).toBe(0)
  })
})
