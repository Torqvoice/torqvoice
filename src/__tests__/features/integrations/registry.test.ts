import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  INSPECTION_CAPABILITY,
  INSPECTION_JOB,
  INSPECTION_SETTING,
} from '@/features/integrations/Lib/inspection-sync'
import { getConnector, getManifest, listManifests } from '@/integrations/registry'

const ROOT = process.cwd()
const messages = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'messages/en/integrations.json'), 'utf-8')
)

/**
 * A connector is a manifest plus a server module, and the catalog, the
 * settings page and the translations all read the manifest. These checks
 * catch the drift that would otherwise show up as a blank label or a card
 * that cannot be opened.
 */
describe('integration registry', () => {
  it('lists every connector folder and nothing else', () => {
    const dir = path.join(ROOT, 'src/integrations')
    const folders = fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((d) => d.isDirectory() && fs.existsSync(path.join(dir, d.name, 'manifest.ts')))
      .map((d) => d.name)
      .sort()
    const ids = listManifests()
      .map((m) => m.id)
      .sort()
    expect(ids).toEqual(folders)
  })

  it('has well-formed manifests', () => {
    for (const m of listManifests()) {
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
        expect(m.auth.scopes.length).toBeGreaterThan(0)
        expect(m.auth.authorizeUrl).toMatch(/^https:\/\//)
        expect(m.auth.tokenUrl).toMatch(/^https:\/\//)
      }
    }
  })

  it('has English text for every label a manifest points at', () => {
    for (const m of listManifests()) {
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
    for (const m of listManifests()) {
      const server = await getConnector(m.id)
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

  it('subscribes only to events the webhook dispatcher knows', async () => {
    const { WEBHOOK_EVENTS } = await import('@/features/webhooks/Schema/webhookSchema')
    const known = new Set<string>(WEBHOOK_EVENTS)
    for (const m of listManifests()) {
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
