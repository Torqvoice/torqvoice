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

/**
 * model -> the models it is cascade-deleted by.
 *
 * Rows scoped through a parent rather than by organizationId are invisible to
 * the organizationId check above, yet a restore deletes them all the same:
 * vehicle findings and recurring invoices were both lost that way.
 */
function cascadeParents(): Map<string, Set<string>> {
  const edges = new Map<string, Set<string>>()
  const pattern = /^model (\w+) \{([\s\S]*?)^\}/gm
  let match = pattern.exec(SCHEMA)
  while (match) {
    for (const line of match[2].split('\n')) {
      const relation = /^\s*\w+\s+(\w+)\??\s+@relation\(.*onDelete:\s*Cascade/.exec(line)
      if (relation) {
        const parents = edges.get(match[1]) ?? new Set<string>()
        parents.add(relation[1])
        edges.set(match[1], parents)
      }
    }
    match = pattern.exec(SCHEMA)
  }
  return edges
}

/** Models a restore would delete, by following cascades out from what it clears. */
function deletedByRestore(): string[] {
  const edges = cascadeParents()
  const reached = new Set<string>()
  const frontier = BACKUP_ENTITIES.filter((e) => e.restore === 'replace').map((e) => e.model)

  while (frontier.length) {
    const parent = frontier.pop() as string
    for (const [child, parents] of edges) {
      if (parents.has(parent) && !reached.has(child)) {
        reached.add(child)
        frontier.push(child)
      }
    }
  }
  return [...reached]
}

/** Every model in the schema. */
function allModels(): string[] {
  return [...SCHEMA.matchAll(/^model (\w+) \{/gm)].map((m) => m[1])
}

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

  it('carries everything a restore deletes', () => {
    // Clearing a table takes its children with it. Anything reachable that way
    // has to be in the backup, or a restore is a one-way loss.
    const known = new Set([...BACKUP_ENTITIES.map((e) => e.model), ...Object.keys(EXCLUDED_MODELS)])
    const lost = deletedByRestore().filter((model) => !known.has(model))

    expect(
      lost,
      `A restore deletes these, and no backup puts them back: ${lost.join(', ')}`
    ).toEqual([])
  })

  it('only excludes models that still exist', () => {
    // Not only the organisation-scoped ones: an exclusion may name a model
    // reached through a cascade, such as a delivery log.
    const inSchema = new Set(allModels())
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

describe('the routes implement the manifest', () => {
  const exportRoute = fs.readFileSync('src/app/api/protected/backup/export/route.ts', 'utf-8')
  const importRoute = fs.readFileSync('src/app/api/protected/backup/import/route.ts', 'utf-8')

  it('restores every nested entity on the way back in', () => {
    // The two tests below only cover top-level keys, because a nested entity
    // has no key of its own. That left a hole: a model could be classified in
    // the manifest, so the schema test passed, while neither route carried it
    // and a restore quietly dropped the rows. TimeEntry shipped that way.
    //
    // The export side cannot be checked this way, because a relation is named
    // for the field rather than the model (ServicePart arrives as partItems).
    // The import side always reaches the model through its Prisma accessor.
    const missing = BACKUP_ENTITIES.filter((entity) => entity.nestedUnder)
      .filter((entity) => {
        const accessor = entity.model.charAt(0).toLowerCase() + entity.model.slice(1)
        return !importRoute.includes(`tx.${accessor}.`)
      })
      .map((entity) => entity.model)

    expect(
      missing,
      `Nested in the manifest, but the import never writes them: ${missing.join(', ')}`
    ).toEqual([])
  })

  it('writes every top-level key on the way out', () => {
    const missing = topLevelEntities()
      .filter((entity) => !exportRoute.includes(`data.${entity.key} =`))
      .map((entity) => entity.key)

    expect(
      missing,
      `The manifest promises these keys, the export writes none: ${missing.join(', ')}`
    ).toEqual([])
  })

  it('reads every top-level key on the way back in', () => {
    const missing = topLevelEntities()
      .filter((entity) => !importRoute.includes(`data.${entity.key}`))
      .map((entity) => entity.key)

    expect(
      missing,
      `Exported but never restored, so a restore would drop them: ${missing.join(', ')}`
    ).toEqual([])
  })

  it('can clear every table it restores', () => {
    // A table written back without being cleared collides with the rows
    // already there, which is a failed import on the second restore.
    const missing = topLevelEntities()
      .filter((entity) => entity.restore === 'replace')
      .filter((entity) => !importRoute.includes(`${entity.model}: () =>`))
      .map((entity) => entity.model)

    expect(missing, `Restored but never cleared: ${missing.join(', ')}`).toEqual([])
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
