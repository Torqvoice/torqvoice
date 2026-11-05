import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import {
  INSPECTION_CAPABILITY,
  INSPECTION_JOB,
  INSPECTION_SETTING,
} from '@/features/integrations/Lib/inspection-sync'
import { getConnector, getManifest, listManifests } from '@/integrations/registry'

// Cloud mode also needs a signed token (see cloud-instance.test.ts); here the
// environment variable alone stands for a confirmed cloud instance.
vi.mock('@/lib/cloud-instance', () => ({
  isCloudInstance: () => process.env.TORQVOICE_MODE === 'cloud',
}))

const ROOT = process.cwd()
const messages = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'messages/en/integrations.json'), 'utf-8')
)

/** The registry as the cloud instance builds it. */
async function cloudRegistry() {
  vi.stubEnv('TORQVOICE_MODE', 'cloud')
  vi.resetModules()
  try {
    return await import('@/integrations/registry')
  } finally {
    vi.unstubAllEnvs()
    vi.resetModules()
  }
}

/**
 * Every connector the app ships, whichever install it exists on: the
 * self-hosted list plus the cloud-only ones, each with the registry that
 * can load it.
 */
async function everyConnector() {
  const cloud = await cloudRegistry()
  const own = listManifests().map((m) => ({ manifest: m, load: () => getConnector(m.id) }))
  const ids = new Set(own.map((e) => e.manifest.id))
  const cloudOnly = cloud
    .listManifests()
    .filter((m) => !ids.has(m.id))
    .map((m) => ({ manifest: m, load: () => cloud.getConnector(m.id) }))
  return [...own, ...cloudOnly]
}

/**
 * A connector is a manifest plus a server module, and the catalog, the
 * settings page and the translations all read the manifest. These checks
 * catch the drift that would otherwise show up as a blank label or a card
 * that cannot be opened.
 */
describe('integration registry', () => {
  it('lists every connector folder and nothing else', async () => {
    const dir = path.join(ROOT, 'src/integrations')
    const folders = fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((d) => d.isDirectory() && fs.existsSync(path.join(dir, d.name, 'manifest.ts')))
      .map((d) => d.name)
      .sort()
    const ids = (await everyConnector()).map((e) => e.manifest.id).sort()
    expect(ids).toEqual(folders)
  })

  it('has well-formed manifests', async () => {
    for (const { manifest: m } of await everyConnector()) {
      expect(m.id).toMatch(/^[a-z0-9-]+$/)
      expect(fs.existsSync(path.join(ROOT, 'public', m.logo))).toBe(true)
      expect(m.docs.startsWith('/docs/')).toBe(true)
      expect(m.docs).not.toContain('#')
      expect(m.capabilities.length).toBeGreaterThan(0)
      const settingKeys = m.settings.map((s) => s.key)
      expect(new Set(settingKeys).size).toBe(settingKeys.length)
      for (const s of m.settings) {
        if (s.showWhen) expect(settingKeys).toContain(s.showWhen.key)
        if (s.type === 'remote-select') expect(s.source).toBeTruthy()
      }
      if (m.auth.type === 'oauth2') {
        // Fiken's consent has no scopes; every other vendor names what it asks for.
        if (m.id !== 'fiken') expect(m.auth.scopes.length).toBeGreaterThan(0)
        expect(m.auth.authorizeUrl).toMatch(/^https:\/\//)
        expect(m.auth.tokenUrl).toMatch(/^https:\/\//)
      }
    }
  })

  it('has English text for every label a manifest points at', async () => {
    for (const { manifest: m } of await everyConnector()) {
      const block = messages.connectors[m.id]
      expect(block, `${m.id} has no connectors block`).toBeTruthy()
      expect(typeof block.description).toBe('string')
      for (const s of m.settings) {
        expect(block.settings?.[s.label], `${m.id} settings.${s.label}`).toBeTruthy()
        if (s.help) expect(block.settings?.[s.help], `${m.id} settings.${s.help}`).toBeTruthy()
      }
      const fields = m.auth.type === 'oauth2' ? (m.auth.tenantFields ?? []) : m.auth.fields
      for (const f of fields)
        expect(block.fields?.[f.label], `${m.id} fields.${f.label}`).toBeTruthy()
      if (m.auth.type === 'oauth2' && m.auth.tenantHelp)
        expect(block[m.auth.tenantHelp]).toBeTruthy()
      for (const cap of m.capabilities) {
        // Capability ids are dotted ('calendar.push') and resolve as nested keys.
        const label = cap
          .split('.')
          .reduce<unknown>((o, k) => (o as Record<string, unknown>)?.[k], messages.capabilities)
        expect(label, `capability ${cap}`).toBeTruthy()
      }
      expect(messages.categories[m.category]).toBeTruthy()
      for (const c of m.also ?? []) expect(messages.categories[c]).toBeTruthy()
    }
  })

  it('loads a server module whose jobs match the manifest', async () => {
    for (const { manifest: m, load } of await everyConnector()) {
      const server = await load()
      expect(server.manifest.id).toBe(m.id)
      const declared = new Set([
        ...(m.subscriptions ?? []).map((s) => s.job),
        ...(m.schedules ?? []).map((s) => s.job),
      ])
      for (const job of declared)
        expect(server.jobs[job], `${m.id} implements ${job}`).toBeTypeOf('function')
      for (const s of m.settings) {
        if (s.type === 'remote-select' && s.source) {
          expect(server.remoteOptions?.[s.source], `${m.id} provides ${s.source}`).toBeTypeOf(
            'function'
          )
        }
      }
      expect(server.test).toBeTypeOf('function')
    }
    expect(getManifest('nope')).toBeNull()
    await expect(getConnector('nope')).rejects.toThrow()
  })

  /**
   * A connector that sends to an address the workshop types in exists on
   * their own server and nowhere else. Leaving it out of the registry, not
   * just the catalog, is what closes the settings page, the connect action
   * and every job at once.
   */
  it('leaves self-hosted-only connectors out on the cloud instance', async () => {
    const selfHostedOnly = listManifests().filter((m) => m.selfHostedOnly)
    expect(selfHostedOnly.map((m) => m.id)).toContain('openai-compatible')

    vi.stubEnv('TORQVOICE_MODE', 'cloud')
    vi.resetModules()
    try {
      const cloud = await import('@/integrations/registry')
      for (const m of selfHostedOnly) {
        expect(cloud.getManifest(m.id), m.id).toBeNull()
        await expect(cloud.getConnector(m.id), m.id).rejects.toThrow()
      }
      const cloudOnly = cloud.listManifests().filter((m) => m.cloudOnly)
      expect(cloud.listManifests().length).toBe(
        listManifests().length - selfHostedOnly.length + cloudOnly.length
      )
    } finally {
      vi.unstubAllEnvs()
      vi.resetModules()
    }
  })

  /**
   * The mirror: a service Torqvoice runs on its own network exists on the
   * cloud and nowhere else, so a self-hosted install neither lists it nor
   * loads it, wherever the id comes from.
   */
  it('leaves cloud-only connectors out on a self-hosted install', async () => {
    expect(listManifests().some((m) => m.cloudOnly)).toBe(false)
    expect(getManifest('torqvoice-codes')).toBeNull()
    await expect(getConnector('torqvoice-codes')).rejects.toThrow()

    const cloud = await cloudRegistry()
    const cloudOnly = cloud.listManifests().filter((m) => m.cloudOnly)
    expect(cloudOnly.map((m) => m.id)).toContain('torqvoice-codes')
    expect(cloud.getManifest('torqvoice-codes')?.name).toBe('Torqvoice Codes')
    expect((await cloud.getConnector('torqvoice-codes')).manifest.id).toBe('torqvoice-codes')
  })

  it('decides per install which connectors exist', async () => {
    const { availableOnThisInstall } = await import('@/integrations/registry')
    const plain = { selfHostedOnly: undefined, cloudOnly: undefined } as never
    expect(availableOnThisInstall(plain, false)).toBe(true)
    expect(availableOnThisInstall(plain, true)).toBe(true)
    expect(availableOnThisInstall({ cloudOnly: true } as never, false)).toBe(false)
    expect(availableOnThisInstall({ cloudOnly: true } as never, true)).toBe(true)
    expect(availableOnThisInstall({ selfHostedOnly: true } as never, true)).toBe(false)
    expect(availableOnThisInstall({ selfHostedOnly: true } as never, false)).toBe(true)
  })

  it('lets a developer try a cloud-only connector, never in production', async () => {
    const { availableOnThisInstall, devCloudConnectors } = await import('@/integrations/registry')
    const codes = { id: 'torqvoice-codes', cloudOnly: true } as never
    const other = { id: 'some-other', cloudOnly: true } as never

    const dev = devCloudConnectors({
      NODE_ENV: 'development',
      TORQVOICE_DEV_CLOUD_CONNECTORS: ' torqvoice-codes , ',
    })
    expect(availableOnThisInstall(codes, false, dev)).toBe(true)
    expect(availableOnThisInstall(other, false, dev)).toBe(false)

    const prod = devCloudConnectors({
      NODE_ENV: 'production',
      TORQVOICE_DEV_CLOUD_CONNECTORS: 'torqvoice-codes',
    })
    expect(prod.size).toBe(0)
    expect(availableOnThisInstall(codes, false, prod)).toBe(false)

    expect(devCloudConnectors({ NODE_ENV: 'development' }).size).toBe(0)
  })

  /**
   * On the cloud Torqvoice holds the code service key for every workshop, so
   * there is nothing to type and no key of its own to put in its place. A
   * self-hosted install, with no key set, would be asked for one.
   */
  it('leaves out a key field the server holds for everyone', async () => {
    const { withServerKeys } = await import('@/integrations/registry')
    const { manifest } = await import('@/integrations/torqvoice-codes/manifest')
    const fields = (m: typeof manifest) => (m.auth.type === 'api-key' ? m.auth.fields : [])
    expect(fields(withServerKeys(manifest, {})).map((f) => [f.key, f.required])).toEqual([
      ['apiToken', true],
    ])
    expect(fields(withServerKeys(manifest, { TORQVOICE_CODES_API_TOKEN: 'tvc_live_x' }))).toEqual(
      []
    )
    expect(fields(withServerKeys(manifest, { TORQVOICE_CODES_API_TOKEN: '  ' }))).toHaveLength(1)
    expect(manifest.autoConnect).toBe(true)
  })

  it('shows cloud-only connectors as cards on a self-hosted install only', async () => {
    const { cloudOnlyElsewhere } = await import('@/integrations/registry')
    expect(cloudOnlyElsewhere().map((m) => m.id)).toContain('torqvoice-codes')
    expect(cloudOnlyElsewhere(true)).toEqual([])
    // Tried on a dev machine through the dev switch, it is a real connector, not a card.
    expect(cloudOnlyElsewhere(false, (id) => id === 'torqvoice-codes')).toEqual([])
  })

  it('subscribes only to events the webhook dispatcher knows', async () => {
    const { WEBHOOK_EVENTS } = await import('@/features/webhooks/Schema/webhookSchema')
    const known = new Set<string>(WEBHOOK_EVENTS)
    for (const { manifest: m } of await everyConnector()) {
      for (const s of m.subscriptions ?? [])
        expect(known.has(s.event), `${m.id} subscribes to ${s.event}`).toBe(true)
    }
  })

  /**
   * Any registry that can say when a vehicle is due takes part in the
   * inspection sync the same way, whatever country it serves: the same
   * setting, the same hourly tick, the same job. A connector that declares
   * the capability without the rest would show a toggle that does nothing.
   */
  it('wires every inspection-capable registry into the sync the same way', async () => {
    for (const m of listManifests()) {
      const capable = m.capabilities.includes(INSPECTION_CAPABILITY)
      const scheduled = (m.schedules ?? []).some((s) => s.job === INSPECTION_JOB)
      const setting = m.settings.find((s) => s.key === INSPECTION_SETTING)
      const server = await getConnector(m.id)
      const handler = server.jobs[INSPECTION_JOB]
      if (capable) {
        expect(m.category, m.id).toBe('registry')
        expect(setting?.type, m.id).toBe('boolean')
        expect(setting?.default, m.id).toBe(false)
        expect(scheduled, m.id).toBe(true)
        expect(typeof handler, m.id).toBe('function')
        expect(typeof server.lookupVehicle, m.id).toBe('function')
        expect(m.capabilities, m.id).toContain('vehicle.lookup')
      } else {
        expect(scheduled, m.id).toBe(false)
        expect(handler, m.id).toBeUndefined()
        expect(setting, m.id).toBeUndefined()
      }
    }
  })
})
