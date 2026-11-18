/**
 * Writes src/lib/backup/tenancy-schema.ts from the Prisma schema. Run after a
 * schema change: `npx tsx scripts/generate-tenancy-schema.ts`. The test in
 * src/__tests__/lib/backup/tenancy-schema.test.ts fails until it is run.
 */
import { execFileSync } from 'node:child_process'
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { parseSchemaGraph } from '../src/lib/backup/schema-graph'

const root = process.cwd()
const dir = path.join(root, 'prisma', 'schema')
const schema = readdirSync(dir)
  .filter((name) => name.endsWith('.prisma'))
  .sort()
  .map((name) => readFileSync(path.join(dir, name), 'utf-8'))
  .join('\n')

const graph = parseSchemaGraph(schema)
const source = `// Generated from prisma/schema by scripts/generate-tenancy-schema.ts. Do not edit.
import type { SchemaGraph } from './schema-graph'

/**
 * Which models carry an organisation, which columns are foreign keys and how
 * a child model reaches its workshop. What the restore's tenancy guard reads.
 */
export const TENANCY_SCHEMA: SchemaGraph = ${JSON.stringify(graph, null, 2)}
`
const target = path.join(root, 'src/lib/backup/tenancy-schema.ts')
writeFileSync(target, source)
// Written the way the repository formats TypeScript, so `npm run check` is quiet.
execFileSync('npx', ['biome', 'format', '--write', target], { stdio: 'inherit' })
console.log(`tenancy-schema.ts: ${Object.keys(graph).length} models`)
