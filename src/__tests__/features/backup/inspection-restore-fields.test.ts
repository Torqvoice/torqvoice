import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { readPrismaSchema } from '@/__tests__/stubs/prisma-schema'

/**
 * Restore completeness for inspections.
 *
 * The import rebuilds templates, their checks, inspections and their graded
 * checks through explicit field maps. For a long time those maps carried a
 * check's name and little else, so a restored template stopped grading
 * readings and a restored certificate had no number. As with part lines, the
 * route source is read against the schema: the failure guarded against is a
 * column somebody forgot.
 */

const ROOT = process.cwd()
const importSource = fs.readFileSync(
  path.join(ROOT, 'src/app/api/protected/backup/import/route.ts'),
  'utf-8'
)
const schema = readPrismaSchema(ROOT)

function scalarColumns(model: string): string[] {
  const match = schema.match(new RegExp(`^model\\s+${model}\\s*\\{([\\s\\S]*?)^\\}`, 'm'))
  expect(match, `model ${model} not found in schema`).toBeTruthy()
  const columns: string[] = []
  for (const line of match![1].split('\n')) {
    const field = line.match(/^\s{2}(\w+)\s+(String|Int|Float|Boolean|DateTime|Json)(\?|\[\])?/)
    if (field) columns.push(field[1])
  }
  expect(columns.length).toBeGreaterThan(0)
  return columns
}

/** The restore map for one model: its create call and the data it writes. */
function restoreMap(marker: string): string {
  const start = importSource.indexOf(marker)
  expect(start, `${marker} not found in import route`).toBeGreaterThan(-1)
  expect(importSource.indexOf(marker, start + 1), `${marker} appears twice`).toBe(-1)
  return importSource.slice(start, start + 2500)
}

describe.each([
  { model: 'InspectionTemplate', marker: 'tx.inspectionTemplate.create(' },
  { model: 'InspectionTemplateSection', marker: 'tx.inspectionTemplateSection.create(' },
  { model: 'InspectionTemplateItem', marker: 'tx.inspectionTemplateItem.createMany(' },
  { model: 'Inspection', marker: 'tx.inspection.create(' },
  { model: 'InspectionItem', marker: 'tx.inspectionItem.createMany(' },
  { model: 'InspectionAttachment', marker: 'tx.inspectionAttachment.createMany(' },
])('$model restore', ({ model, marker }) => {
  it('carries every schema column, so nothing is dropped on restore', () => {
    const map = restoreMap(marker)
    for (const column of scalarColumns(model)) {
      expect(map, `${model}.${column} is lost by the ${marker} restore map`).toMatch(
        new RegExp(`\\b${column}:`)
      )
    }
  })
})

describe('the links back to an inspection', () => {
  it('are written after the inspections exist, for jobs and for quotes', () => {
    const inspections = importSource.indexOf('tx.inspection.create(')
    const jobLink = importSource.indexOf('data: { inspectionId: sr.inspectionId as string }')
    const quoteLink = importSource.indexOf('data: { inspectionId: q.inspectionId as string }')
    expect(jobLink).toBeGreaterThan(inspections)
    expect(quoteLink).toBeGreaterThan(inspections)
  })
})
