import fs from 'node:fs'
import path from 'node:path'

/**
 * The Prisma schema is split into one file per domain under prisma/schema.
 * Tests that inspect models read them all as one text, in file order.
 */
export function readPrismaSchema(root = process.cwd()): string {
  const dir = path.join(root, 'prisma', 'schema')
  return fs
    .readdirSync(dir)
    .filter((name) => name.endsWith('.prisma'))
    .sort()
    .map((name) => fs.readFileSync(path.join(dir, name), 'utf-8'))
    .join('\n')
}
