import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { readPrismaSchema } from '@/__tests__/stubs/prisma-schema'
import { layoutModels } from '@/lib/backup/layout'

/**
 * Restore completeness for every model a backup carries.
 *
 * The export writes whole rows. The import puts most of them back through
 * hand-written field maps, and a column added to the schema but not to its
 * map is dropped on restore without a word: an invoice marked paid by hand
 * came back unpaid, every quote link a customer held stopped working, a
 * customer's tax number and a payment's provider reference were gone. This
 * reads the import source against the schema for every model in the backup
 * layout, so the next forgotten column fails here. A column that is rightly
 * not in its map goes in NOT_IN_THE_MAP with the reason.
 *
 * The round trip on a real database (src/__tests__/db/backup-round-trip) is
 * the proof that what the maps write is right; this is the part that runs
 * without a database.
 */

const ROOT = process.cwd()
const importSource = fs.readFileSync(path.join(ROOT, 'src/lib/backup/import.ts'), 'utf-8')
/** Comments dropped, so a bracket or a column name in prose is not read as code. */
const importCode = importSource.replace(/\/\/.*$/gm, '')
const schema = readPrismaSchema(ROOT)

function scalarColumns(model: string): string[] {
  const match = schema.match(new RegExp(`^model\\s+${model}\\s*\\{([\\s\\S]*?)^\\}`, 'm'))
  expect(match, `model ${model} not found in schema`).toBeTruthy()
  const columns: string[] = []
  for (const line of match![1].split('\n')) {
    const field = line.match(
      /^\s{2}(\w+)\s+(String|Int|Float|Boolean|DateTime|Json|Bytes|BigInt)(\?|\[\])?/
    )
    if (field) columns.push(field[1])
  }
  expect(columns.length).toBeGreaterThan(0)
  return columns
}

/** Every create call the import makes for a model, each to the parenthesis that closes it. */
function restoreMaps(model: string): string[] {
  const delegate = model.charAt(0).toLowerCase() + model.slice(1)
  const maps: string[] = []
  for (const site of importCode.matchAll(
    new RegExp(`tx\\.${delegate}\\.(create|createMany)\\(`, 'g')
  )) {
    let depth = 0
    for (let i = site.index + site[0].length - 1; i < importCode.length; i++) {
      if (importCode[i] === '(') depth++
      if (importCode[i] === ')' && --depth === 0) {
        maps.push(importCode.slice(site.index, i + 1))
        break
      }
    }
  }
  return maps
}

/**
 * A create call fed by restoreRows or columnsOf, which write every column
 * the row has (rows.ts): nothing to forget.
 */
function writesWholeRows(map: string): boolean {
  return /data:\s*\w+ as never/.test(map) || map.includes('columnsOf(')
}

const WARRANTY =
  'Written by the warrantyFromUntyped spread, which also reads backups from before the statement existed.'
const LINKED_LATER =
  'The row it points at is restored later, so the link is written once it exists. Checked below.'
const IMPORT_BATCH =
  'Spreadsheet import batches are not in a backup; the id would point at nothing.'
const BOOKING_TOKEN =
  'Tells a booking sent twice from a new one while its dialog is still open. No dialog is waiting on a restored job.'

/** Columns a map leaves out on purpose, by model, with what happens instead. */
const NOT_IN_THE_MAP: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  ServiceRecord: {
    warrantyStatus: WARRANTY,
    warrantyMonths: WARRANTY,
    warrantyMileage: WARRANTY,
    warrantyNotes: WARRANTY,
    inspectionId: LINKED_LATER,
    tireSetId: LINKED_LATER,
    importBatchId: IMPORT_BATCH,
    bookingToken: BOOKING_TOKEN,
  },
  Quote: {
    warrantyStatus: WARRANTY,
    warrantyMonths: WARRANTY,
    warrantyMileage: WARRANTY,
    warrantyNotes: WARRANTY,
    inspectionId: LINKED_LATER,
    tireSetId: LINKED_LATER,
  },
  Customer: { importBatchId: IMPORT_BATCH },
  Vehicle: { importBatchId: IMPORT_BATCH },
}

describe.each([...layoutModels()].sort())('%s restore', (model) => {
  const maps = restoreMaps(model)
  const skipped = NOT_IN_THE_MAP[model] ?? {}

  it('is written by the import', () => {
    expect(maps.length, `the import never creates a ${model}`).toBeGreaterThan(0)
  })

  it('carries every schema column, so nothing is dropped on restore', () => {
    const columns = scalarColumns(model)
    for (const map of maps) {
      if (writesWholeRows(map)) continue
      for (const column of columns) {
        if (column in skipped) continue
        expect(map, `${model}.${column} is lost by a ${model} restore map`).toMatch(
          new RegExp(`\\b${column}(:|,\\s)`)
        )
      }
    }
  })

  it('lists only columns the model has and the map really leaves out', () => {
    const columns = scalarColumns(model)
    for (const column of Object.keys(skipped)) {
      expect(columns, `${model}.${column} is listed but not in the schema`).toContain(column)
      for (const map of maps) {
        expect(map, `${model}.${column} is listed as left out but a map sets it`).not.toMatch(
          new RegExp(`\\b${column}:`)
        )
      }
    }
  })
})

describe('the allowlist', () => {
  it('names only models a backup carries', () => {
    const models = layoutModels()
    for (const model of Object.keys(NOT_IN_THE_MAP)) {
      expect(models, `${model} is not in the backup layout`).toContain(model)
    }
  })
})

describe('documents', () => {
  it.each([
    'ServiceRecord',
    'Quote',
  ])('%s writes the warranty through the shared reader', (model) => {
    for (const map of restoreMaps(model)) expect(map).toContain('...warrantyFromUntyped(')
  })
})

describe('the links written after the rows they point at exist', () => {
  const links = [
    { link: 'inspectionId: sr.inspectionId as string', created: 'tx.inspection.create(' },
    { link: 'inspectionId: q.inspectionId as string', created: 'tx.inspection.create(' },
    { link: 'tireSetId: sr.tireSetId as string', created: 'tx.tireSet.create(' },
    { link: 'tireSetId: q.tireSetId as string', created: 'tx.tireSet.create(' },
  ]

  it.each(links)('$link', ({ link, created }) => {
    const at = importSource.indexOf(link)
    expect(at, `${link} is never written`).toBeGreaterThan(-1)
    expect(at).toBeGreaterThan(importSource.indexOf(created))
  })

  it('reach counter sales as well as vehicle jobs', () => {
    expect(importSource).toContain('...linked(data.counterSales)')
    expect(importSource).toContain('...aboutASet(data.counterSales)')
  })

  it('keep the row’s own last-changed time', () => {
    // An update stamps updatedAt with now unless it is given; left out, every
    // linked job and quote came back changed on the day of the restore.
    for (const { link } of links) {
      const at = importSource.indexOf(link)
      expect(importSource.slice(at, at + 160), link).toMatch(/updatedAt: toSafeDate\(/)
    }
  })
})

describe('numbers', () => {
  it('come back as they were, zero included', () => {
    // `(value as number) || 1` turned a quantity of zero into one.
    expect(importCode).not.toMatch(/as number\) \|\| (null|[1-9])/)
  })
})
