import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { PermissionAction, PermissionSubject } from '@/lib/permissions'

vi.mock('@/lib/db', () => ({ db: {} }))

const { HIDDEN_COLUMNS, TABLE_COLUMNS, TABLE_SUBJECTS } = await import(
  '@/features/ai/tools/workshop-columns'
)
const { ALLOWED_TABLES, CHILD_TABLES, ORG_DIRECT_TABLES, validateSql, visibleTablesFor } =
  await import('@/features/ai/tools/workshop-tools')

/** table name -> scalar columns, read straight from the Prisma schema files. */
function schemaColumns(): Map<string, string[]> {
  const dir = join(process.cwd(), 'prisma', 'schema')
  const out = new Map<string, string[]>()
  const scalar = new Set([
    'String',
    'Int',
    'Float',
    'Boolean',
    'DateTime',
    'Json',
    'Decimal',
    'BigInt',
    'Bytes',
  ])
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.prisma'))) {
    const text = readFileSync(join(dir, file), 'utf8')
    for (const match of text.matchAll(/^model (\w+) \{\n([\s\S]*?)^\}/gm)) {
      let table = match[1]
      const columns: string[] = []
      for (const raw of match[2].split('\n')) {
        const line = raw.trim()
        if (!line || line.startsWith('//')) continue
        const map = line.match(/^@@map\("(\w+)"\)/)
        if (map) {
          table = map[1]
          continue
        }
        if (line.startsWith('@@') || line.includes('@relation')) continue
        const [name, type] = line.split(/\s+/)
        if (!type || !scalar.has(type.replace(/[?[\]]/g, ''))) continue
        columns.push(name)
      }
      out.set(table, columns)
    }
  }
  return out
}

describe('workshop chat column lists', () => {
  const schema = schemaColumns()

  it('covers every allowed table', () => {
    expect(Object.keys(TABLE_COLUMNS).sort()).toEqual([...ALLOWED_TABLES].sort())
    expect(Object.keys(TABLE_SUBJECTS).sort()).toEqual([...ALLOWED_TABLES].sort())
  })

  it('names only columns the schema has, and every one except the hidden ones', () => {
    for (const table of ALLOWED_TABLES) {
      const inSchema = schema.get(table)
      expect(inSchema, `${table} not found in prisma/schema`).toBeDefined()
      const expected = (inSchema ?? []).filter((c) => !HIDDEN_COLUMNS.includes(c))
      expect([...TABLE_COLUMNS[table]].sort(), table).toEqual(expected.sort())
    }
  })

  it('keeps the join keys the views are built on', () => {
    for (const table of ORG_DIRECT_TABLES) {
      expect(TABLE_COLUMNS[table], table).toContain('organizationId')
    }
    for (const { tables, key } of CHILD_TABLES) {
      for (const table of tables) expect(TABLE_COLUMNS[table], table).toContain(key)
    }
  })

  it('never exposes a share token or the frozen invoice', () => {
    for (const [table, columns] of Object.entries(TABLE_COLUMNS)) {
      for (const hidden of HIDDEN_COLUMNS) expect(columns, table).not.toContain(hidden)
    }
  })
})

describe('workshop chat role visibility', () => {
  const read = (subject: PermissionSubject) => ({ action: PermissionAction.READ, subject })

  it('gives admins every table', () => {
    expect([...visibleTablesFor(true, [])].sort()).toEqual([...ALLOWED_TABLES].sort())
  })

  it('gives a role only the tables its permissions cover', () => {
    const visible = visibleTablesFor(false, [read(PermissionSubject.VEHICLES)])
    expect([...visible].sort()).toEqual(['fuel_logs', 'notes', 'reminders', 'vehicles'])
  })

  it('hides a child whose parent the role cannot read', () => {
    // Billing without work orders: payments hang off service records, which
    // this role cannot see, so the view could not be built.
    const visible = visibleTablesFor(false, [read(PermissionSubject.BILLING)])
    expect(visible.has('payments')).toBe(false)
    const both = visibleTablesFor(false, [
      read(PermissionSubject.BILLING),
      read(PermissionSubject.WORK_ORDERS),
    ])
    expect(both.has('payments')).toBe(true)
    expect(both.has('customers')).toBe(false)
  })

  it('a member with no role sees nothing', () => {
    expect(visibleTablesFor(false, []).size).toBe(0)
  })

  it('validateSql refuses a table the role may not read, with a role message', () => {
    const visible = visibleTablesFor(false, [read(PermissionSubject.VEHICLES)])
    expect(validateSql('SELECT * FROM vehicles', visible)).toEqual({ valid: true })
    const result = validateSql('SELECT amount FROM payments', visible)
    expect(result.valid).toBe(false)
    expect(result.error).toMatch(/not available to this user's role/)
    const nested = validateSql(
      'SELECT * FROM vehicles WHERE id IN (SELECT "vehicleId" FROM service_records)',
      visible
    )
    expect(nested.valid).toBe(false)
    // A table off the list entirely still gets the plain refusal.
    expect(validateSql('SELECT * FROM users', visible).error).toMatch(/not allowed/)
  })
})
