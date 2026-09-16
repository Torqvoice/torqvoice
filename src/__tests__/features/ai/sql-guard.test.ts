import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/db', () => ({ db: {} }))

import { validateSql } from '@/features/ai/tools/workshop-tools'

/**
 * The AI writes its own SQL, and the allow-list of tables is what keeps it
 * away from users, accounts, sessions and the other tables that have no
 * org-scoped temporary view. The check used to look only at the identifier
 * right after FROM or JOIN, so a comma list or a subquery walked straight
 * past it.
 */

const ok = (sql: string) => expect(validateSql(sql)).toEqual({ valid: true })
const rejected = (sql: string, message?: string | RegExp) => {
  const result = validateSql(sql)
  expect(result.valid).toBe(false)
  if (message) expect(result.error).toMatch(message)
}

describe('validateSql: allowed shapes', () => {
  it('accepts a single allowed table', () => {
    ok('SELECT id, make, model FROM vehicles WHERE year > 2015 LIMIT 10')
  })

  it('accepts a JOIN between two allowed tables', () => {
    ok(
      'SELECT v.id, c.name FROM vehicles v LEFT JOIN customers c ON c.id = v."customerId" ORDER BY c.name'
    )
  })

  it('accepts a CTE built from an allowed table', () => {
    ok('WITH x AS (SELECT * FROM vehicles) SELECT * FROM x')
  })

  it('accepts a subquery in a JOIN, as the system prompt suggests', () => {
    ok(`SELECT sr.*, COALESCE(p.paid, 0) AS paid_amount
      FROM service_records sr
      LEFT JOIN (SELECT "serviceRecordId", SUM(amount) AS paid FROM payments GROUP BY "serviceRecordId") p ON p."serviceRecordId" = sr.id
      WHERE sr."manuallyPaid" = false`)
  })

  it('treats a string literal as data, not SQL', () => {
    ok(`SELECT * FROM vehicles WHERE make = 'from users'`)
    ok(`SELECT * FROM vehicles WHERE make = 'it''s' OR make = E'it\\'s'`)
  })

  it('leaves FROM inside EXTRACT and SUBSTRING alone', () => {
    ok('SELECT EXTRACT(YEAR FROM "serviceDate") AS y, COUNT(*) FROM service_records GROUP BY 1')
    ok(`SELECT SUBSTRING(make FROM 1 FOR 3) FROM vehicles`)
  })

  it('does not mistake a comma inside a join condition for a table list', () => {
    ok(
      'SELECT * FROM vehicles v JOIN customers c ON c.id = v."customerId" AND v.year IN (2019, 2020)'
    )
    ok('SELECT * FROM vehicles v JOIN customers c ON v.year = ANY(ARRAY[2019, 2020])')
  })

  it('accepts a quoted allowed table and a CTE that shadows a forbidden name', () => {
    ok('SELECT * FROM "vehicles"')
    // The CTE wins over the real table at execution, so nothing leaks.
    ok('WITH users AS (SELECT id FROM vehicles) SELECT * FROM users')
  })
})

describe('validateSql: table allow-list', () => {
  it('rejects a comma list that smuggles a forbidden table', () => {
    rejected('SELECT * FROM vehicles v, users u', /comma/i)
  })

  it('rejects a comma list even between allowed tables', () => {
    rejected('SELECT * FROM vehicles v, customers c WHERE c.id = v."customerId"', /comma/i)
  })

  it('rejects JOIN users', () => {
    rejected('SELECT * FROM vehicles v JOIN users u ON u.id = v.id', /users/)
    rejected('SELECT * FROM vehicles NATURAL JOIN users', /users/)
    rejected('SELECT * FROM (vehicles v CROSS JOIN users u)', /users/)
  })

  it('rejects a forbidden table inside a subquery', () => {
    rejected('SELECT * FROM (SELECT * FROM users) u', /users/)
    rejected('SELECT * FROM vehicles WHERE id IN (SELECT id FROM users)', /users/)
    rejected('SELECT (SELECT count(*) FROM users) FROM vehicles', /users/)
    rejected('SELECT * FROM vehicles UNION SELECT * FROM accounts', /accounts/)
  })

  it('rejects a CTE that reads a forbidden table', () => {
    rejected('WITH x AS (SELECT * FROM users) SELECT * FROM x', /users/)
    // Without RECURSIVE the body of a CTE sees the real table of its own name.
    rejected('WITH users AS (SELECT * FROM users) SELECT * FROM users', /users/)
    rejected(
      'WITH RECURSIVE t AS (SELECT 1 UNION ALL SELECT * FROM t) SELECT * FROM t',
      /recursive/i
    )
  })

  it('does not let a WINDOW definition pass as a CTE name', () => {
    rejected('SELECT * FROM users WINDOW users AS (ORDER BY id)', /users/)
  })

  it('rejects quoted and upper-cased forbidden names', () => {
    rejected('SELECT * FROM "users"', /users/)
    rejected('SELECT * FROM USERS', /users/)
  })

  it('rejects the system catalog and schema-qualified names', () => {
    rejected('SELECT * FROM pg_catalog.pg_tables', /catalog/i)
    rejected('SELECT * FROM pg_tables', /catalog/i)
    rejected('SELECT * FROM information_schema.tables', /catalog/i)
    rejected('SELECT * FROM public.users', /schema/i)
    rejected('SELECT * FROM public.vehicles', /schema/i)
  })

  it('rejects TABLE, LATERAL, TABLESAMPLE and row locks', () => {
    rejected('SELECT * FROM (TABLE users) t', /TABLE/)
    rejected('SELECT * FROM vehicles v JOIN LATERAL (SELECT 1) s ON true', /LATERAL/)
    rejected('SELECT * FROM vehicles TABLESAMPLE SYSTEM(10)', /TABLESAMPLE/)
    rejected('SELECT * FROM vehicles FOR UPDATE')
    rejected('SELECT * FROM vehicles FOR SHARE', /lock/i)
  })

  it('does not let a backslash hide the end of a plain string', () => {
    // With standard_conforming_strings the literal ends at the first quote,
    // so Postgres would run the UNION. The guard has to see it too.
    rejected(
      `SELECT * FROM vehicles WHERE make = 'a\\' UNION SELECT * FROM users WHERE 'x' = 'x'`,
      /users/
    )
  })
})

describe('validateSql: statement shape', () => {
  it('rejects mutation and DDL keywords wherever they appear', () => {
    rejected('DELETE FROM vehicles', /SELECT/)
    rejected('SELECT * FROM vehicles WHERE id IN (DELETE FROM vehicles RETURNING id)', /DELETE/)
    rejected('WITH x AS (UPDATE vehicles SET make = 1 RETURNING *) SELECT * FROM x', /UPDATE/)
    rejected('SELECT * INTO copy FROM vehicles', /INTO/)
    rejected('SELECT 1; DROP TABLE vehicles', /Multiple statements/)
  })

  it('rejects comments and dollar quoting', () => {
    rejected('SELECT * FROM vehicles -- FROM users', /comment/i)
    rejected('SELECT * FROM vehicles /* x */', /comment/i)
    rejected('SELECT $$from users$$', /Dollar/)
  })

  it('rejects unsafe functions', () => {
    rejected("SELECT pg_read_file('/etc/passwd')", /catalog/i)
    rejected("SELECT current_setting('is_superuser')", /Unsafe function/)
  })

  it('rejects unbalanced parentheses', () => {
    rejected('SELECT * FROM (SELECT * FROM vehicles', /parenthes/i)
  })
})

/**
 * Cross-organization review, 16 Sep 2026. Every table the model may name
 * must be shadowed by an organization-scoped temporary view; a name on the
 * allow-list without a view would read the real table with every
 * workshop's rows in it. And every route to a table that is not on the
 * list has to be closed, whatever the syntax.
 */
describe('organization isolation', () => {
  it('shadows every allowed table with a scoped view', async () => {
    const { ALLOWED_TABLES, ORG_DIRECT_TABLES, CHILD_TABLES } = await import(
      '@/features/ai/tools/workshop-tools'
    )
    const covered = new Set([...ORG_DIRECT_TABLES, ...CHILD_TABLES.flatMap((c) => c.tables)])
    const bare = ALLOWED_TABLES.filter((t) => !covered.has(t))
    expect(bare, `allowed without a scoped view: ${bare.join(', ')}`).toEqual([])
    // Every child view joins a parent that itself has a view, in an order
    // where the parent already exists.
    const seen = new Set<string>(ORG_DIRECT_TABLES)
    for (const { tables, parent } of CHILD_TABLES) {
      expect(seen.has(parent), `${parent} must be defined before its children`).toBe(true)
      for (const t of tables) seen.add(t)
    }
  })

  it('closes every route to a table off the allow-list', () => {
    const attempts = [
      'SELECT * FROM users',
      'SELECT * FROM "users"',
      'SELECT * FROM Users',
      'SELECT * FROM public.vehicles',
      'SELECT * FROM "public"."vehicles"',
      'SELECT * FROM "public.users"',
      'SELECT * FROM pg_temp.vehicles',
      'SELECT * FROM vehicles WHERE id IN (SELECT id FROM users)',
      'SELECT * FROM vehicles WHERE EXISTS (SELECT 1 FROM organizations)',
      "SELECT * FROM vehicles WHERE 'x' = ANY(SELECT name FROM users)",
      "SELECT (SELECT string_agg(email, ',') FROM users)",
      'SELECT unnest(ARRAY(SELECT email FROM users))',
      'SELECT * FROM vehicles UNION ALL SELECT * FROM organizations',
      'SELECT * FROM (SELECT * FROM users) u',
      'SELECT * FROM vehicles JOIN (users) u ON true',
      'SELECT * FROM vehicles NATURAL JOIN users',
      'SELECT * FROM vehicles v JOIN LATERAL (SELECT 1) x ON true',
      'SELECT * FROM vehicles, users',
      'SELECT * FROM vehicles WHERE id = (TABLE users LIMIT 1)',
      'SELECT * FROM ROWS FROM (unnest(ARRAY[1]))',
      'SELECT * FROM generate_series(1, 10)',
      'SELECT * FROM vehicles TABLESAMPLE SYSTEM (1)',
      'WITH RECURSIVE t AS (SELECT 1) SELECT * FROM t',
      'WITH u AS (SELECT * FROM users) SELECT * FROM u',
      'SELECT * FROM integration_connections',
      'SELECT * FROM organization_members',
      'SELECT * FROM sessions',
      'SELECT * FROM accounts',
      'SELECT * FROM information_schema.tables',
      'SELECT relname FROM pg_class',
      "SELECT current_setting('search_path')",
      "SELECT set_config('search_path', 'public', true)",
      "SELECT pg_read_file('/etc/passwd')",
      "SELECT * FROM dblink('dbname=x', 'select 1') AS t(a int)",
      "SELECT query_to_xml('select * from users', true, false, '')",
      'SELECT * FROM vehicles FOR UPDATE',
      'SELECT * FROM vehicles; SELECT * FROM users',
      'SELECT * FROM vehicles -- FROM users',
      'SELECT * FROM vehicles /* users */',
      'SELECT $$x$$ FROM vehicles',
      'SELECT * FROM vehicles WHERE id = $1',
      'EXPLAIN SELECT * FROM vehicles',
      'SHOW search_path',
      'SET search_path TO public',
      'SELECT * FROM vehicles INTO TEMP t',
    ]
    const passed = attempts.filter((sql) => validateSql(sql).valid)
    expect(passed, `accepted: ${passed.join(' | ')}`).toEqual([])
  })

  it('still accepts the shapes the model is told to write', () => {
    ok('SELECT * FROM vehicles')
    ok('SELECT * FROM VEHICLES')
    ok('SELECT * FROM "vehicles"')
    ok('WITH users AS (SELECT * FROM vehicles) SELECT * FROM users')
    ok('SELECT v.*, c.name FROM vehicles v JOIN customers c ON c.id = v."customerId"')
    ok(
      'SELECT sr.*, COALESCE(p.paid, 0) AS paid_amount FROM service_records sr LEFT JOIN (SELECT "serviceRecordId", SUM(amount) AS paid FROM payments GROUP BY "serviceRecordId") p ON p."serviceRecordId" = sr.id'
    )
  })
})
