/**
 * @vitest-environment node
 *
 * The file manager keeps a file while any row still mentions it, so the list
 * of places a row can mention one (lib/files/references.ts) has to be
 * complete: a column it misses is a column whose files can be deleted from
 * under it. This test reads the Prisma schema and fails when a column that
 * could hold a file URL is neither in that list nor named here as not holding
 * one, with the reason.
 */
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'

const queryRawUnsafe = vi.hoisted(() => vi.fn(async () => [{ s: '/services/a.jpg' }]))
vi.mock('@/lib/db', () => ({ db: { $queryRawUnsafe: queryRawUnsafe } }))

import { allReferencedSuffixes, FILE_REFERENCES, referencedSuffixes } from '@/lib/files/references'

/** Columns that look as if they could hold a file and do not, and why. */
const NOT_FILES: Record<string, string> = {
  'AuditLog.metadata': 'history of what happened; never a live use of a file',
  'DashboardWidget.config': 'widget settings',
  'DocumentDesign.documentType': 'invoice or quote',
  'DocumentDesign.layout': 'section order and switches; the logo is in `template`',
  'DocumentDesignSnapshot.layout': 'the same, frozen',
  'ExternalCalendarEvent.remoteUrl': 'a link into the calendar provider',
  'ImportBatch.fileName': 'the name of a spreadsheet staged in the temp folder',
  'ImportBatch.mapping': 'column mapping of an import',
  'IntegrationConnection.settings': 'connector settings',
  'IntegrationConnection.state': 'connector state',
  'IntegrationJob.payload': 'ids and amounts for a connector; no connector handles files',
  'IntegrationLink.metadata': 'what the remote system said about a record',
  'IntegrationLink.remoteUrl': 'a link into the remote system',
  'IntegrationLog.details': 'history',
  'InventoryPart.supplierUrl': "the supplier's website",
  'Notification.entityUrl': 'an in-app link to a page',
  'Quote.taxComponents': 'tax lines',
  'RecurringInvoice.taxComponents': 'tax lines',
  'ServiceRecord.taxComponents': 'tax lines',
  'ServiceRecord.issuedData':
    'frozen issuer and customer details; the issued logo is bytes in DocumentAssetSnapshot',
  'ServiceRecord.issuedLogoSnapshotId': 'the id of a row holding the logo bytes',
  'ServiceAttachment.fileName': 'a label',
  'ServiceAttachment.fileType': 'a MIME type',
  'QuoteAttachment.fileName': 'a label',
  'QuoteAttachment.fileType': 'a MIME type',
  'TireSetAttachment.fileName': 'a label',
  'TireSetAttachment.fileType': 'a MIME type',
  'StoredImage.fileName': 'a label',
  'StatusReport.videoFileName': 'a label',
  'WhatsappMessage.mediaFilename': 'a label',
  'WhatsappMessage.mediaType': 'image, document, video…',
  'User.image': 'an avatar URL from a sign-in provider; never an upload',
  'User.dashboardLayout': 'dashboard layout',
  'VehicleInspectionStatus.extras': 'what a vehicle registry returned',
  'VehicleSafetyReport.data': 'what a vehicle registry returned',
  'Webhook.url': 'an outbound endpoint',
}

/** A column is a candidate when it is JSON, or text named like a file. */
const FILE_LIKE =
  /url|image|file|path|logo|media|photo|video|avatar|attachment|picture|document|asset|src|icon/i

interface Column {
  model: string
  field: string
  type: string
  table: string
}

function schemaColumns(): Column[] {
  const dir = path.join(process.cwd(), 'prisma', 'schema')
  const columns: Column[] = []
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.prisma'))) {
    const source = fs.readFileSync(path.join(dir, file), 'utf8')
    for (const block of source.matchAll(/^model (\w+) \{([\s\S]*?)^\}/gm)) {
      const [, model, body] = block
      const table = /@@map\("([^"]+)"\)/.exec(body)?.[1] ?? model
      for (const line of body.split('\n')) {
        const field = /^\s+(\w+)\s+(Json|String)(\?|\[\])?(\s|$)/.exec(line)
        if (field) columns.push({ model, field: field[1], type: field[2], table })
      }
    }
  }
  return columns
}

describe('the list of places a file can be used', () => {
  const columns = schemaColumns()

  it('reads the schema', () => {
    expect(columns.length).toBeGreaterThan(100)
  })

  it('covers every column that could hold a file URL', () => {
    const listed = new Set(FILE_REFERENCES.map((ref) => `${ref.model}.${ref.field}`))
    const unaccounted = columns
      .filter((c) => c.type === 'Json' || FILE_LIKE.test(c.field))
      .map((c) => `${c.model}.${c.field}`)
      .filter((name) => !listed.has(name) && !(name in NOT_FILES))
    expect(
      unaccounted,
      'Add these to FILE_REFERENCES in lib/files/references.ts, or to NOT_FILES here with the reason'
    ).toEqual([])
  })

  it('names real tables and columns, qualified with the schema', () => {
    for (const ref of FILE_REFERENCES) {
      const column = columns.find((c) => c.model === ref.model && c.field === ref.field)
      expect(column, `${ref.model}.${ref.field} is in the schema`).toBeDefined()
      expect(ref.sql).toContain(`"public"."${column?.table}"`)
      expect(ref.sql).toContain(`"${ref.field}"`)
    }
  })

  it('does not list a column as both', () => {
    for (const ref of FILE_REFERENCES) {
      expect(NOT_FILES[`${ref.model}.${ref.field}`]).toBeUndefined()
    }
  })

  it('names every NOT_FILES column that still exists, so the list cannot rot', () => {
    const names = new Set(columns.map((c) => `${c.model}.${c.field}`))
    for (const name of Object.keys(NOT_FILES)) expect(names.has(name), name).toBe(true)
  })
})

describe('referencedSuffixes', () => {
  it('asks every place in one query, with the suffixes as a parameter', async () => {
    const found = await referencedSuffixes(['/services/a.jpg', '/services/b.jpg'])

    const [sql, param] = queryRawUnsafe.mock.calls[0] as unknown as [string, string[]]
    expect(param).toEqual(['/services/a.jpg', '/services/b.jpg'])
    for (const ref of FILE_REFERENCES) expect(sql).toContain(ref.sql)
    // The suffixes are never part of the SQL text.
    expect(sql).not.toContain('a.jpg')
    expect([...found]).toEqual(['/services/a.jpg'])
  })

  it('asks nothing for nothing', async () => {
    queryRawUnsafe.mockClear()
    expect(await referencedSuffixes([])).toEqual(new Set())
    expect(queryRawUnsafe).not.toHaveBeenCalled()
  })
  it('reads a one-URL column with string functions, and a pattern only where URLs can be anywhere', () => {
    // A pattern costs about a hundred times more per row than cutting the
    // last two segments off; the one-URL columns are the big tables.
    const anywhere = new Set([
      'AppSetting.value',
      'DocumentDesign.template',
      'DocumentDesignSnapshot.template',
      'EmailTemplate.theme',
      'EmailTemplate.blocks',
    ])
    for (const ref of FILE_REFERENCES) {
      const name = `${ref.model}.${ref.field}`
      expect(ref.sql.includes('regexp_matches'), name).toBe(anywhere.has(name))
      // Every one skips rows that cannot hold an upload before any work.
      expect(ref.sql, name).toMatch(/WHERE [\s\S]*LIKE '%\/files\/%'/)
    }
  })
})

describe('allReferencedSuffixes', () => {
  it('reads every place once, with the pattern as its only parameter', async () => {
    queryRawUnsafe.mockClear()
    expect([...(await allReferencedSuffixes())]).toEqual(['/services/a.jpg'])
    const [sql, ...params] = queryRawUnsafe.mock.calls[0] as unknown as [string, ...unknown[]]
    expect(params).toHaveLength(1)
    expect(sql).toContain('$1')
    expect(sql).not.toContain('$2')
  })
})
