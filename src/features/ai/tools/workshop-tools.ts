import 'server-only'
import { db } from '@/lib/db'
import type OpenAI from 'openai'

const MAX_ROWS = 100

/**
 * Single tool: AI generates a SQL query, we validate and execute it.
 */
export const workshopTools: OpenAI.ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'run_sql_query',
      description:
        'Execute a read-only SQL SELECT query against the workshop database. The query MUST be a SELECT statement. You do NOT need to filter by organization — that is enforced automatically. Always use the actual PostgreSQL table names (snake_case with @@map names). Limit results to 100 rows max.',
      parameters: {
        type: 'object',
        properties: {
          sql: {
            type: 'string',
            description:
              'A PostgreSQL SELECT query. Must start with SELECT or WITH. Join tables with explicit JOIN ... ON; comma-separated tables in FROM are rejected.',
          },
        },
        required: ['sql'],
      },
    },
  },
]

// ─── Blocked keywords (mutation / DDL / admin / locking) ───────────────────

const BLOCKED_KEYWORDS = new Set([
  'INSERT',
  'UPDATE',
  'DELETE',
  'DROP',
  'ALTER',
  'TRUNCATE',
  'CREATE',
  'REPLACE',
  'UPSERT',
  'MERGE',
  'GRANT',
  'REVOKE',
  'EXEC',
  'EXECUTE',
  'CALL',
  'COPY',
  'VACUUM',
  'REINDEX',
  'CLUSTER',
  'COMMENT',
  'LOCK',
  'NOTIFY',
  'LISTEN',
  'PREPARE',
  'DEALLOCATE',
  'INTO',
  'SET',
  'RESET',
  'DISCARD',
  'LOAD',
  'SECURITY',
  'REASSIGN',
  'REFRESH',
  // Read a table without FROM/JOIN, pull functions in as row sources, or
  // sample rows: none of these go through the table walker below.
  'TABLE',
  'LATERAL',
  'TABLESAMPLE',
  'IMPORT',
  'DO',
  'EXPLAIN',
  'SHOW',
])

// Functions that read files, other databases or session settings.
const UNSAFE_FUNCTIONS = new Set([
  'lo_import',
  'lo_export',
  'dblink',
  'dblink_connect',
  'query_to_xml',
  'current_setting',
  'set_config',
])

// `FOR` followed by one of these is a row lock (FOR UPDATE, FOR NO KEY UPDATE,
// FOR SHARE, FOR KEY SHARE).
const LOCK_STRENGTH = new Set(['UPDATE', 'NO', 'SHARE', 'KEY'])

// Tables the AI is allowed to query (whitelist approach: everything else is blocked)
const ALLOWED_TABLES = [
  'vehicles',
  'service_records',
  'service_parts',
  'service_labor',
  'service_attachments',
  'payments',
  'customers',
  'reminders',
  'quotes',
  'quote_parts',
  'quote_labor',
  'quote_attachments',
  'inventory_parts',
  'notes',
  'fuel_logs',
  'technicians',
  'inspections',
  'inspection_items',
  'recurring_invoices',
  'recurring_parts',
  'recurring_labor',
  'notifications',
  'sms_messages',
  'inspection_quote_requests',
] as const

const ALLOWED_TABLE_SET: ReadonlySet<string> = new Set(ALLOWED_TABLES)

// ─── Tokenizer ──────────────────────────────────────────────────────────────
//
// The table check below runs on tokens, not on the raw text, so a string
// literal that says "from users" is data and a quoted identifier is a name.
// Anything the tokenizer cannot place with certainty (comments, dollar
// quoting, a second statement) is rejected rather than guessed at.

type Token =
  | { kind: 'ident'; value: string; quoted: boolean }
  | { kind: 'string' }
  | { kind: 'number' }
  | { kind: 'punct'; value: string }

const IDENT_START = /[A-Za-z_\u0080-\uFFFF]/
const IDENT_PART = /[A-Za-z0-9_\u0080-\uFFFF]/

/** Index just past the closing quote, or -1 when the literal never ends. */
function readString(sql: string, from: number, backslashEscapes: boolean): number {
  let i = from
  while (i < sql.length) {
    const ch = sql[i]
    if (backslashEscapes && ch === '\\') {
      i += 2
      continue
    }
    if (ch === "'") {
      if (sql[i + 1] === "'") {
        i += 2
        continue
      }
      return i + 1
    }
    i++
  }
  return -1
}

function readQuotedIdent(sql: string, from: number): { value: string; end: number } | null {
  let i = from
  let value = ''
  while (i < sql.length) {
    const ch = sql[i]
    if (ch === '"') {
      if (sql[i + 1] === '"') {
        value += '"'
        i += 2
        continue
      }
      return { value, end: i + 1 }
    }
    value += ch
    i++
  }
  return null
}

function tokenize(sql: string): { tokens: Token[]; error?: string } {
  const tokens: Token[] = []
  const fail = (error: string) => ({ tokens, error })
  let i = 0
  while (i < sql.length) {
    const ch = sql[i]
    if (/\s/.test(ch)) {
      i++
      continue
    }
    if (ch === '-' && sql[i + 1] === '-') return fail('SQL comments are not allowed.')
    if (ch === '/' && sql[i + 1] === '*') return fail('SQL block comments are not allowed.')
    if (ch === ';') return fail('Multiple statements are not allowed.')
    if (ch === '$') return fail('Dollar quoting and parameters are not allowed.')
    if (ch === "'") {
      const end = readString(sql, i + 1, false)
      if (end < 0) return fail('Unterminated string literal.')
      tokens.push({ kind: 'string' })
      i = end
      continue
    }
    if (ch === '"') {
      const ident = readQuotedIdent(sql, i + 1)
      if (!ident) return fail('Unterminated quoted identifier.')
      tokens.push({ kind: 'ident', value: ident.value, quoted: true })
      i = ident.end
      continue
    }
    if (IDENT_START.test(ch)) {
      let j = i + 1
      while (j < sql.length && IDENT_PART.test(sql[j])) j++
      const word = sql.slice(i, j)
      // E'...' honours backslash escapes, so the literal has to end where
      // Postgres ends it. Plain, U&, B, X and N strings escape a quote only
      // by doubling it (standard_conforming_strings).
      if ((word === 'E' || word === 'e') && sql[j] === "'") {
        const end = readString(sql, j + 1, true)
        if (end < 0) return fail('Unterminated string literal.')
        tokens.push({ kind: 'string' })
        i = end
        continue
      }
      tokens.push({ kind: 'ident', value: word, quoted: false })
      i = j
      continue
    }
    if (/[0-9]/.test(ch)) {
      let j = i + 1
      while (j < sql.length && /[0-9.]/.test(sql[j])) j++
      tokens.push({ kind: 'number' })
      i = j
      continue
    }
    tokens.push({ kind: 'punct', value: ch })
    i++
  }
  return { tokens }
}

// ─── Table reference walker ─────────────────────────────────────────────────

const UNBALANCED = 'Unbalanced parentheses.'

// After one of these the FROM list is over, so a comma is no longer a table
// separator.
const CLAUSE_KEYWORDS = new Set([
  'WHERE',
  'GROUP',
  'HAVING',
  'WINDOW',
  'ORDER',
  'LIMIT',
  'OFFSET',
  'FETCH',
  'FOR',
  'UNION',
  'INTERSECT',
  'EXCEPT',
  'RETURNING',
])

const SUBQUERY_KEYWORDS = new Set(['SELECT', 'WITH', 'VALUES'])

/** Upper-cased bare identifier, or null for anything that cannot be a keyword. */
function keywordOf(tok: Token | undefined): string | null {
  return tok && tok.kind === 'ident' && !tok.quoted ? tok.value.toUpperCase() : null
}

function isKeyword(tok: Token | undefined, keyword: string): boolean {
  return keywordOf(tok) === keyword
}

function isPunct(tok: Token | undefined, value: string): tok is Extract<Token, { kind: 'punct' }> {
  return tok?.kind === 'punct' && tok.value === value
}

/** The name Postgres resolves: quoted as written, bare folded to lower case. */
function identName(tok: Extract<Token, { kind: 'ident' }>): string {
  return tok.quoted ? tok.value : tok.value.toLowerCase()
}

/** Index of the bracket closing the one at `open`, or -1. */
function matchingClose(tokens: Token[], open: number, to: number, close: string): number {
  const openCh = (tokens[open] as { value: string }).value
  let depth = 0
  for (let i = open; i < to; i++) {
    const tok = tokens[i]
    if (tok.kind !== 'punct') continue
    if (tok.value === openCh) depth++
    else if (tok.value === close && --depth === 0) return i
  }
  return -1
}

/**
 * Walks a statement or subquery. `ctes` are the names visible from enclosing
 * WITH clauses; a leading WITH here extends them for the rest of the fragment.
 */
function checkFragment(
  tokens: Token[],
  from: number,
  to: number,
  ctes: ReadonlySet<string>
): string | null {
  let i = from
  let visible = ctes
  if (isKeyword(tokens[i], 'WITH')) {
    const local = new Set(ctes)
    i++
    if (isKeyword(tokens[i], 'RECURSIVE')) return 'Recursive queries are not allowed.'
    for (;;) {
      const name = tokens[i]
      if (!name || name.kind !== 'ident') return 'Malformed WITH clause.'
      i++
      if (isPunct(tokens[i], '(')) {
        const close = matchingClose(tokens, i, to, ')')
        if (close < 0) return UNBALANCED
        i = close + 1
      }
      if (!isKeyword(tokens[i], 'AS')) return 'Malformed WITH clause.'
      i++
      if (isKeyword(tokens[i], 'NOT')) i++
      if (isKeyword(tokens[i], 'MATERIALIZED')) i++
      if (!isPunct(tokens[i], '(')) return 'Malformed WITH clause.'
      const close = matchingClose(tokens, i, to, ')')
      if (close < 0) return UNBALANCED
      // The name becomes visible only after its own body: without RECURSIVE,
      // `WITH users AS (SELECT * FROM users)` reads the real users table.
      const error = checkFragment(tokens, i + 1, close, local)
      if (error) return error
      local.add(identName(name))
      i = close + 1
      if (isPunct(tokens[i], ',')) {
        i++
        continue
      }
      break
    }
    visible = local
  }
  return checkBody(tokens, i, to, visible, false)
}

/**
 * Walks the tokens at one bracket depth. FROM introduces a table only once a
 * SELECT was seen at this depth, which leaves EXTRACT(YEAR FROM x) and friends
 * alone inside their own parentheses; JOIN always introduces one. Every
 * bracket group is walked recursively, so a subquery anywhere is found.
 */
function checkBody(
  tokens: Token[],
  from: number,
  to: number,
  ctes: ReadonlySet<string>,
  startsWithTable: boolean
): string | null {
  let i = from
  let selectSeen = false
  let inFromList = false
  if (startsWithTable) {
    const next = checkTableItem(tokens, i, to, ctes)
    if (typeof next === 'string') return next
    i = next
    inFromList = true
  }
  while (i < to) {
    const tok = tokens[i]
    if (isPunct(tok, '(') || isPunct(tok, '[')) {
      const close = matchingClose(tokens, i, to, tok.value === '(' ? ')' : ']')
      if (close < 0) return UNBALANCED
      const error = checkFragment(tokens, i + 1, close, ctes)
      if (error) return error
      i = close + 1
      continue
    }
    if (isPunct(tok, ')') || isPunct(tok, ']')) return UNBALANCED
    if (inFromList && isPunct(tok, ',')) {
      return 'Comma-separated tables in FROM are not allowed. Use an explicit JOIN.'
    }
    const keyword = keywordOf(tok)
    if (keyword === 'SELECT') {
      selectSeen = true
      inFromList = false
      i++
      continue
    }
    if (keyword && CLAUSE_KEYWORDS.has(keyword)) {
      inFromList = false
      i++
      continue
    }
    if ((keyword === 'FROM' && selectSeen) || keyword === 'JOIN') {
      const next = checkTableItem(tokens, i + 1, to, ctes)
      if (typeof next === 'string') return next
      i = next
      inFromList = true
      continue
    }
    i++
  }
  return null
}

/**
 * Checks the table item after FROM or JOIN: an allowed table, a CTE name, a
 * parenthesised subquery, or a parenthesised join. Returns the index after
 * the item, or an error.
 */
function checkTableItem(
  tokens: Token[],
  i: number,
  to: number,
  ctes: ReadonlySet<string>
): number | string {
  const tok = i < to ? tokens[i] : undefined
  if (!tok) return 'Missing table name after FROM or JOIN.'
  if (isPunct(tok, '(')) {
    const close = matchingClose(tokens, i, to, ')')
    if (close < 0) return UNBALANCED
    const first = keywordOf(tokens[i + 1])
    const error =
      first && SUBQUERY_KEYWORDS.has(first)
        ? checkFragment(tokens, i + 1, close, ctes)
        : checkBody(tokens, i + 1, close, ctes, true)
    return error ?? close + 1
  }
  if (tok.kind !== 'ident') return 'Unexpected token after FROM or JOIN.'
  if (isPunct(tokens[i + 1], '.')) return 'Schema-qualified table names are not allowed.'
  const name = identName(tok)
  if (ctes.has(name) || ALLOWED_TABLE_SET.has(name)) return i + 1
  return `Access to table "${name}" is not allowed.`
}

// ─── Validation ─────────────────────────────────────────────────────────────

export function validateSql(sql: string): { valid: boolean; error?: string } {
  const trimmed = sql.trim()

  if (!/^(SELECT|WITH)\b/i.test(trimmed)) {
    return { valid: false, error: 'Only SELECT queries are allowed.' }
  }

  const lexed = tokenize(trimmed)
  if (lexed.error) return { valid: false, error: lexed.error }
  const { tokens } = lexed

  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i]
    if (tok.kind !== 'ident') continue
    const lower = tok.value.toLowerCase()
    // Catalog names are refused wherever they appear, quoted or not.
    if (lower.startsWith('pg_') || lower === 'information_schema') {
      return { valid: false, error: 'System catalog access is not allowed.' }
    }
    if (tok.quoted) continue
    const upper = tok.value.toUpperCase()
    if (BLOCKED_KEYWORDS.has(upper)) {
      return { valid: false, error: `Forbidden keyword: ${upper}` }
    }
    if (UNSAFE_FUNCTIONS.has(lower)) {
      return { valid: false, error: 'Unsafe function call is not allowed.' }
    }
    if (upper === 'FOR' && LOCK_STRENGTH.has(keywordOf(tokens[i + 1]) ?? '')) {
      return { valid: false, error: 'Row locking is not allowed.' }
    }
  }

  const error = checkFragment(tokens, 0, tokens.length, new Set())
  if (error) return { valid: false, error }

  return { valid: true }
}

// ─── Org-scoped execution ───────────────────────────────────────────────────

// Tables that carry their own organizationId. Service records are here rather
// than under vehicles because counter sales have no vehicle.
const ORG_DIRECT_TABLES = [
  'vehicles',
  'customers',
  'quotes',
  'inventory_parts',
  'notifications',
  'sms_messages',
  'technicians',
  'inspections',
  'inspection_quote_requests',
  'service_records',
]

// Tables without an organizationId, scoped by joining their already-scoped
// parent view. Order matters: recurring_invoices must exist before its children.
const CHILD_TABLES: { tables: string[]; parent: string; key: string }[] = [
  {
    tables: ['notes', 'fuel_logs', 'reminders', 'recurring_invoices'],
    parent: 'vehicles',
    key: 'vehicleId',
  },
  {
    tables: ['service_parts', 'service_labor', 'service_attachments', 'payments'],
    parent: 'service_records',
    key: 'serviceRecordId',
  },
  { tables: ['quote_parts', 'quote_labor', 'quote_attachments'], parent: 'quotes', key: 'quoteId' },
  {
    tables: ['recurring_parts', 'recurring_labor'],
    parent: 'recurring_invoices',
    key: 'recurringInvoiceId',
  },
  { tables: ['inspection_items'], parent: 'inspections', key: 'inspectionId' },
]

/**
 * Executes the AI query inside a READ ONLY transaction with temporary views
 * that enforce organization isolation at the database level.
 *
 * Security layers:
 * 1. validateSql() has already limited the statement to allowed table names
 * 2. Temporary views shadow every allowed table name, pre-filtered by orgId
 * 3. Child tables (service_parts, payments, etc.) are scoped via JOIN to
 *    their org-scoped parent view, so they need no organizationId of their own
 * 4. The orgId is regex-validated (CUID characters only) and then string
 *    interpolated into the view definitions: CREATE VIEW cannot take a bound
 *    parameter, so the regex is what keeps it safe
 * 5. search_path puts pg_temp first, so unqualified names in the AI query
 *    resolve to the views, never the real tables
 * 6. The transaction is SET TRANSACTION READ ONLY before the AI query runs
 * 7. DISCARD TEMP drops the views before the connection goes back to the
 *    pool, and the rest of the app qualifies its raw queries as
 *    "public"."table" so a stray view could never be picked up by mistake
 */
async function executeOrgScopedQuery(sql: string, orgId: string): Promise<unknown[]> {
  // Defense-in-depth: the orgId is interpolated below, so it must be a plain CUID
  if (!/^[a-zA-Z0-9_-]+$/.test(orgId)) {
    throw new Error('Invalid organization ID')
  }

  return db.$transaction(async (tx) => {
    await tx.$executeRawUnsafe('SET LOCAL search_path TO pg_temp, public')

    // The views are created before the transaction goes read-only, since
    // CREATE VIEW needs write access. They are the security boundary.
    for (const table of ORG_DIRECT_TABLES) {
      await tx.$executeRawUnsafe(
        `CREATE OR REPLACE TEMPORARY VIEW "${table}" AS SELECT * FROM "public"."${table}" WHERE "organizationId" = '${orgId}'`
      )
    }
    for (const { tables, parent, key } of CHILD_TABLES) {
      for (const table of tables) {
        await tx.$executeRawUnsafe(
          `CREATE OR REPLACE TEMPORARY VIEW "${table}" AS SELECT t.* FROM "public"."${table}" t INNER JOIN pg_temp."${parent}" p ON t."${key}" = p.id`
        )
      }
    }

    let failed = false
    try {
      await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY')
      const rows = await tx.$queryRawUnsafe(sql)
      return Array.isArray(rows) ? rows.slice(0, MAX_ROWS) : []
    } catch (err) {
      failed = true
      throw err
    } finally {
      // Postgres allows DISCARD TEMP in a read-only transaction (DROP VIEW it
      // does not). A failed statement leaves the transaction aborted; Prisma
      // rolls it back and the rollback drops the views with it, so cleaning
      // up there would only replace the real error message.
      if (!failed) await tx.$executeRawUnsafe('DISCARD TEMP')
    }
  })
}

// ─── Tool execution ─────────────────────────────────────────────────────────

export async function executeTool(
  name: string,
  args: Record<string, unknown>,
  organizationId: string
): Promise<string> {
  if (name !== 'run_sql_query') {
    return JSON.stringify({ error: `Unknown tool: ${name}` })
  }

  const sql = (args.sql as string) || ''

  // Validate
  const validation = validateSql(sql)
  if (!validation.valid) {
    return JSON.stringify({ error: validation.error })
  }

  try {
    // Add LIMIT if missing
    const hasLimit = /\bLIMIT\b/i.test(sql)
    const limitedSql = hasLimit ? sql : `${sql} LIMIT ${MAX_ROWS}`

    const rows = await executeOrgScopedQuery(limitedSql, organizationId)

    return JSON.stringify(rows, (_key, value) =>
      typeof value === 'bigint' ? Number(value) : value
    )
  } catch (err) {
    return JSON.stringify({
      error: err instanceof Error ? err.message : 'Query execution failed',
    })
  }
}

// ─── Schema description for the AI system prompt ────────────────────────────

export const DB_SCHEMA = `
PostgreSQL database schema (use these exact table/column names in queries):

vehicles (id, make, model, year, vin, "licensePlate", color, mileage, "fuelType", transmission, "engineSize", "purchaseDate", "purchasePrice", "isArchived", "createdAt", "updatedAt", "customerId")

service_records (id, title, description, type, status, cost, mileage, "serviceDate", "startDateTime", "endDateTime", "shopName", "techName", parts, "laborHours", "diagnosticNotes", "invoiceNotes", subtotal, "taxRate", "taxAmount", "totalAmount", "invoiceNumber", "discountType", "discountValue", "discountAmount", "manuallyPaid", "createdAt", "updatedAt", "vehicleId", "customerId", "technicianId", "sortOrder") -- "vehicleId" is NULL for parts-only counter sales; those link "customerId" directly

service_parts (id, "partNumber", name, quantity, unit, "unitPrice", total, "serviceRecordId")

service_labor (id, description, hours, rate, total, "serviceRecordId")

payments (id, amount, date, method, note, provider, "externalId", "createdAt", "updatedAt", "serviceRecordId")

customers (id, name, email, phone, address, company, notes, "createdAt", "updatedAt")

reminders (id, title, description, "dueDate", "dueMileage", "isCompleted", "createdAt", "updatedAt", "vehicleId")

quotes (id, "quoteNumber", title, description, status, "validUntil", subtotal, "taxRate", "taxAmount", "discountType", "discountValue", "discountAmount", "totalAmount", notes, "customerMessage", "convertedToId", "createdAt", "updatedAt", "customerId", "vehicleId", "inspectionId")

quote_parts (id, "partNumber", name, quantity, unit, "unitPrice", total, excluded, "quoteId")

quote_labor (id, description, hours, rate, total, excluded, "quoteId")

inventory_parts (id, "partNumber", name, description, category, quantity, "minQuantity", unit, "unitCost", "sellPrice", supplier, "supplierPhone", "supplierEmail", "supplierUrl", location, "isArchived", "createdAt", "updatedAt")

notes (id, title, content, "isPinned", "createdAt", "updatedAt", "vehicleId")

fuel_logs (id, date, mileage, gallons, "pricePerGallon", "totalCost", "isFillUp", station, notes, "createdAt", "updatedAt", "vehicleId")

technicians (id, name, color, "isActive", "sortOrder", "dailyCapacity", "createdAt", "updatedAt")

inspections (id, status, mileage, notes, "startDateTime", "endDateTime", "completedAt", "createdAt", "updatedAt", "vehicleId", "templateId", "technicianId", "sortOrder")

inspection_items (id, name, section, "sortOrder", condition, notes, "imageUrls", "inspectionId")

recurring_invoices (id, title, description, frequency, "nextRunDate", "endDate", "isActive", "lastRunAt", "runCount", type, cost, "taxRate", "invoiceNotes", "vehicleId", "createdAt", "updatedAt")

notifications (id, type, title, message, "entityType", "entityId", read, "createdAt")

sms_messages (id, direction, "fromNumber", "toNumber", body, status, "createdAt", "updatedAt", "customerId")

service_attachments (id, "fileName", "fileUrl", "fileType", "fileSize", category, description, "includeInInvoice", "createdAt", "serviceRecordId")

Key relationships:
- vehicles."customerId" → customers.id
- service_records."vehicleId" → vehicles.id (NULL for counter sales)
- service_records."customerId" → customers.id (set only for counter sales)
- service_parts."serviceRecordId" → service_records.id
- service_labor."serviceRecordId" → service_records.id
- payments."serviceRecordId" → service_records.id
- reminders."vehicleId" → vehicles.id
- quotes."customerId" → customers.id
- quotes."vehicleId" → vehicles.id
- quote_parts."quoteId" → quotes.id
- quote_labor."quoteId" → quotes.id
- inspections."vehicleId" → vehicles.id
- inspections."technicianId" → technicians.id

IMPORTANT business rules:
- A service record is considered PAID if "manuallyPaid" = true OR the sum of payments.amount for that service >= the effective total (use "totalAmount" if > 0, otherwise use cost).
- To find UNPAID invoices, use this pattern:
  SELECT sr.*, COALESCE(p.paid, 0) AS paid_amount
  FROM service_records sr
  LEFT JOIN (SELECT "serviceRecordId", SUM(amount) AS paid FROM payments GROUP BY "serviceRecordId") p ON p."serviceRecordId" = sr.id
  WHERE sr."manuallyPaid" = false
    AND (CASE WHEN sr."totalAmount" > 0 THEN sr."totalAmount" ELSE sr.cost END) > 0
    AND COALESCE(p.paid, 0) < (CASE WHEN sr."totalAmount" > 0 THEN sr."totalAmount" ELSE sr.cost END)
- Quote statuses: draft, sent, accepted, rejected, expired, converted
- Service record statuses: pending, in_progress, waiting_parts, completed
- Service record types: maintenance, repair, upgrade, inspection

Note: camelCase columns MUST be double-quoted in SQL (e.g. "licensePlate", "totalAmount").
Organization filtering is applied automatically — do NOT add WHERE "organizationId" = ... yourself.
Join tables with explicit JOIN ... ON. Comma-separated tables in FROM (FROM a, b) are rejected, as are LATERAL, TABLESAMPLE and row locks. CTEs (WITH name AS (...)) are allowed.

IMPORTANT: Linking to pages
Always include id columns in your queries — for the primary entity AND any related entities (vehicle, customer, etc.). When displaying results, add markdown links for ALL entities present in the row. Use these URL patterns:
- Vehicle: [vehicle name](/vehicles/{vehicle.id})
- Service record: [title](/vehicles/{vehicle.id}/service/{service_record.id})
- Customer: [name](/customers/{customer.id})
- Quote: [title](/quotes/{quote.id})
- Inventory part: [name](/inventory)
- Reminder: [title](/reminders)
- Inspection: [template name](/inspections/{inspection.id})

When a query involves JOINs, make every related entity clickable. For example, when showing invoices with vehicle and customer info:
| [Oil Change](/vehicles/abc123/service/def456) | [Toyota Corolla](/vehicles/abc123) | [John Smith](/customers/cust789) | $150 |
Always JOIN to vehicles and customers when relevant so you can include their ids and link to them.
`.trim()
