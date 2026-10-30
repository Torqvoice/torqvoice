/**
 * @vitest-environment node
 *
 * The tenancy guard reads a generated picture of the schema and a hand
 * written picture of the backup file. Both have to stay true: the generated
 * file is compared with the schema it came from, and the layout with the
 * manifest and the export, so a new model or dataset cannot slip past the
 * guard unnoticed.
 */
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { readPrismaSchema } from '@/__tests__/stubs/prisma-schema'
import { BACKUP_LAYOUT, layoutModels, walkBackup } from '@/lib/backup/layout'
import { BACKUP_DATASET_KEYS } from '@/lib/backup/build-data'
import { BACKUP_ENTITIES } from '@/lib/backup/manifest'
import { parseSchemaGraph } from '@/lib/backup/schema-graph'
import { ownershipWhere } from '@/lib/backup/tenancy'
import { TENANCY_SCHEMA } from '@/lib/backup/tenancy-schema'

describe('tenancy-schema.ts', () => {
  it('is what the Prisma schema says (run scripts/generate-tenancy-schema.ts after a schema change)', () => {
    expect(TENANCY_SCHEMA).toEqual(parseSchemaGraph(readPrismaSchema()))
  })

  it('knows the organisation column and the parent chain of the models a backup holds', () => {
    expect(TENANCY_SCHEMA.Customer.organizationId).toBe(true)
    expect(TENANCY_SCHEMA.ServicePart.organizationId).toBe(false)
    expect(TENANCY_SCHEMA.ServicePart.ownerPaths).toEqual([['serviceRecord']])
    expect(TENANCY_SCHEMA.Inspection.foreignKeys.templateId).toEqual({
      target: 'InspectionTemplate',
      required: true,
      relation: 'template',
    })
    expect(TENANCY_SCHEMA.Quote.foreignKeys.vehicleId.required).toBe(false)
  })
})

describe('the backup layout', () => {
  const inManifest = new Set(BACKUP_ENTITIES.map((e) => e.model))
  const inLayout = layoutModels()

  it('holds every model the manifest classifies, and nothing else', () => {
    expect([...inManifest].filter((m) => !inLayout.has(m))).toEqual([])
    expect([...inLayout].filter((m) => !inManifest.has(m))).toEqual([])
  })

  it('has every dataset key the export writes, and every nested include', () => {
    expect([...BACKUP_DATASET_KEYS].filter((key) => !(key in BACKUP_LAYOUT))).toEqual([])
    const source = fs.readFileSync(
      path.join(process.cwd(), 'src/lib/backup/build-data.ts'),
      'utf-8'
    )
    const childKeys = new Set<string>()
    const collect = (node: { children?: Record<string, unknown> }) => {
      for (const [key, child] of Object.entries(node.children ?? {})) {
        childKeys.add(key)
        collect(child as { children?: Record<string, unknown> })
      }
    }
    for (const node of Object.values(BACKUP_LAYOUT)) collect(node)
    // Every `name: true` or `name: { include` inside an include block.
    const included = new Set<string>()
    for (const block of source.matchAll(/include:\s*\{([\s\S]*?)\n\s*\}/g)) {
      for (const m of block[1].matchAll(/^\s*(\w+):\s*(true|\{)/gm)) included.add(m[1])
    }
    for (const m of source.matchAll(/^\s*(\w+): true,$/gm)) {
      // serviceRecordTree is spelled out as a const and spread into includes.
      if (!['settings', 'customers', 'vehicles'].includes(m[1])) included.add(m[1])
    }
    const exportOptions = new Set([
      'settings',
      'customers',
      'vehicles',
      'quotes',
      'inventory',
      'customFields',
      'files',
      'technicians',
      'inspections',
      'auditLogs',
      'smsMessages',
      'scheduledMessages',
      'notifications',
      'tireHotel',
      'workshopConfig',
      'include',
    ])
    const missing = [...included].filter((k) => !exportOptions.has(k) && !childKeys.has(k))
    expect(missing, 'nested keys the export writes but the layout does not know').toEqual([])
  })

  it('can say whose row every model it holds is', () => {
    const blind = [...inLayout].filter((m) => ownershipWhere(m, 'org') === null)
    expect(blind).toEqual([])
  })

  it('walks parents before children and drops a parent with what nests in it', () => {
    const data = {
      vehicles: [
        { id: 'v1', serviceRecords: [{ id: 'j1', partItems: [{ id: 'p1' }] }] },
        { id: 'v2', inspectionStatus: { id: 's2' } },
      ],
    }
    const seen: string[] = []
    walkBackup(data, (model, row) => {
      seen.push(`${model}:${row.id}`)
      return row.id === 'v1' ? 'drop' : 'keep'
    })
    expect(seen).toEqual(['Vehicle:v1', 'Vehicle:v2', 'VehicleInspectionStatus:s2'])
    expect(data.vehicles.map((v) => v.id)).toEqual(['v2'])
  })
})
