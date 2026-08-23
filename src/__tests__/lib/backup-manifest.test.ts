import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  BACKUP_ENTITIES,
  clearPlanFor,
  EXCLUDED_MODELS,
  topLevelEntities,
  UPLOAD_CATEGORIES,
} from '@/lib/backup/manifest'

/**
 * Ten features shipped before anyone noticed they were missing from backups,
 * because nothing compared the schema against what a backup carries. This
 * does, without needing a database.
 */

const SCHEMA = fs.readFileSync(path.join('prisma', 'schema.prisma'), 'utf-8')

/** Models with an organizationId, which is what makes a row a workshop's own. */
function tenantScopedModels(): string[] {
  const models: string[] = []
  const pattern = /^model (\w+) \{([\s\S]*?)^\}/gm
  let match = pattern.exec(SCHEMA)
  while (match) {
    if (/^\s*organizationId\s/m.test(match[2])) models.push(match[1])
    match = pattern.exec(SCHEMA)
  }
  return models
}

describe('backup manifest', () => {
  it('accounts for every organisation-scoped model', () => {
    const known = new Set([...BACKUP_ENTITIES.map((e) => e.model), ...Object.keys(EXCLUDED_MODELS)])
    const unclassified = tenantScopedModels().filter((model) => !known.has(model))

    expect(
      unclassified,
      `Add these to BACKUP_ENTITIES so they are backed up, or to EXCLUDED_MODELS with a reason: ${unclassified.join(', ')}`
    ).toEqual([])
  })

  it('only excludes models that still exist', () => {
    const inSchema = new Set(tenantScopedModels())
    const stale = Object.keys(EXCLUDED_MODELS).filter((model) => !inSchema.has(model))
    expect(stale, `No longer in the schema: ${stale.join(', ')}`).toEqual([])
  })

  it('gives every exclusion a reason', () => {
    const empty = Object.entries(EXCLUDED_MODELS)
      .filter(([, reason]) => reason.trim().length < 10)
      .map(([model]) => model)
    expect(empty).toEqual([])
  })

  it('never reuses a backup key', () => {
    const keys = topLevelEntities().map((e) => e.key)
    expect(keys.length).toBe(new Set(keys).size)
  })

  it('nests a model under a parent that is itself in the backup', () => {
    const models = new Set(BACKUP_ENTITIES.map((e) => e.model))
    const orphans = BACKUP_ENTITIES.filter((e) => e.nestedUnder && !models.has(e.nestedUnder))
    expect(orphans.map((e) => e.model)).toEqual([])
  })

  it('gives every replaceable top-level entity a clearing order', () => {
    // A table restored but never cleared collides with the rows already there,
    // which is a failed import on the second restore rather than a lost row.
    const missing = topLevelEntities()
      .filter((e) => e.restore === 'replace' && e.clearOrder === undefined)
      .map((e) => e.model)
    expect(missing).toEqual([])
  })

  it('carries every upload folder the app writes to', () => {
    const written = new Set<string>()
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name)
        if (entry.isDirectory()) walk(full)
        else if (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) {
          const source = fs.readFileSync(full, 'utf-8')
          const pattern = /['"]uploads['"],\s*[^,)]+,\s*['"]([a-z-]+)['"]/g
          let hit = pattern.exec(source)
          while (hit) {
            written.add(hit[1])
            hit = pattern.exec(source)
          }
        }
      }
    }
    walk('src')

    const missing = [...written].filter((category) => !UPLOAD_CATEGORIES.includes(category))
    expect(
      missing,
      `The app writes uploads to these folders, but no backup carries them: ${missing.join(', ')}`
    ).toEqual([])
  })
})

describe('clearPlanFor', () => {
  it('clears nothing the backup does not carry', () => {
    // Restoring a customers-only export used to delete every vehicle.
    expect(clearPlanFor(['customers'])).toEqual(['Customer'])
  })

  it('clears children before the rows they point at', () => {
    const plan = clearPlanFor(['customers', 'vehicles', 'quotes', 'notifications'])
    expect(plan.indexOf('Notification')).toBeLessThan(plan.indexOf('Quote'))
    expect(plan.indexOf('Quote')).toBeLessThan(plan.indexOf('Vehicle'))
    expect(plan.indexOf('Vehicle')).toBeLessThan(plan.indexOf('Customer'))
  })

  it('never clears a merged table', () => {
    expect(clearPlanFor(['roles'])).toEqual([])
  })

  it('ignores keys it does not know', () => {
    expect(clearPlanFor(['somethingElse'])).toEqual([])
  })
})
