#!/usr/bin/env node
// Flags migration statements that break the version of the app still running.
//
//   node check-migrations.mjs <migration.sql>...
//
// A deploy migrates the database while the previous version may still be
// serving, and a rollback runs the previous version against the new schema.
// Both work only while a migration leaves the old code working. Adding tables
// and nullable columns, or columns with a default, is fine. Dropping, renaming,
// retyping or tightening something the old code uses is not: stop using it in
// one release, and change it in a later one.
//
// Reads whole statements, not lines, so how a statement is wrapped changes
// nothing. Prints GitHub annotations, and exits 1 when it finds any errors.
import { existsSync, readFileSync } from 'node:fs'

const ID = String.raw`(?:"(?:[^"]|"")*"|[A-Za-z_][\w$]*)`
const NAME = String.raw`${ID}(?:\s*\.\s*${ID})?`
const ALTER_TABLE = new RegExp(String.raw`\bALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?(?:ONLY\s+)?${NAME}\s*\*?\s*`, 'i')
const ALTER_TYPE = new RegExp(String.raw`\bALTER\s+TYPE\s+${NAME}\s*`, 'i')
const ALTER_COLUMN = String.raw`^ALTER\s+(?:COLUMN\s+)?${ID}\s+`

const RUNNING = 'The version still running'
const TABLE_RULES = [
  [/^DROP\s+(?!CONSTRAINT\b)/i, 'Drops a column', `${RUNNING} selects this column; Prisma reads every column it knows, so every query on the table fails.`],
  [/^RENAME\s+TO\b/i, 'Renames a table', `${RUNNING} uses the old name.`],
  [/^RENAME\s+(?!CONSTRAINT\b)/i, 'Renames a column', `${RUNNING} uses the old name. Add the new column, write both, and drop the old one in a later release.`],
  [new RegExp(`${ALTER_COLUMN}(?:SET\\s+DATA\\s+)?TYPE\\b`, 'i'), 'Changes a column type', `${RUNNING} reads and writes the old type.`],
  [new RegExp(`${ALTER_COLUMN}SET\\s+NOT\\s+NULL\\b`, 'i'), 'Makes a column required', `${RUNNING} may insert rows without it.`],
  [new RegExp(`${ALTER_COLUMN}DROP\\s+DEFAULT\\b`, 'i'), 'Removes a column default', `${RUNNING} leaves the column out of inserts and relies on the default.`],
]
const ADD_COLUMN = /^ADD\s+(?!CONSTRAINT\b|PRIMARY\s+KEY\b|UNIQUE\b|FOREIGN\s+KEY\b|CHECK\b|EXCLUDE\b)/i
const TYPE_RULES = [
  [/^RENAME\s+VALUE\b/i, 'Renames an enum value', `${RUNNING} reads and writes the old value.`],
  [/^RENAME\b/i, 'Renames a type', `${RUNNING} uses the old name. For an enum, this is usually a value being removed or renamed.`],
]

/**
 * Cuts SQL into clauses, each with the source line of every character:
 * statements end at `;`, and an ALTER TABLE or ALTER TYPE is cut again at each
 * top-level comma, so every action in it is one clause however it is wrapped.
 * Comments are dropped and string literals blanked, so neither can set off or
 * hide a rule. Dollar quotes are read through, so DDL inside a DO block is
 * checked like any other.
 */
function clauses(sql) {
  const out = []
  let text = ''
  let lines = []
  let line = 1
  let depth = 0
  let kind = null // 'table' or 'type' once the statement is known to alter one
  const put = (s) => {
    text += s
    for (let k = 0; k < s.length; k++) lines.push(line)
  }
  const kindSoFar = () => kind ?? (ALTER_TABLE.test(text) ? 'table' : ALTER_TYPE.test(text) ? 'type' : null)
  const flush = (endsStatement) => {
    if (text.trim()) {
      const clauseKind = kindSoFar()
      out.push({ text, lines, kind: clauseKind })
      kind = clauseKind
    }
    text = ''
    lines = []
    if (endsStatement) {
      kind = null
      depth = 0
    }
  }

  for (let i = 0; i < sql.length; i++) {
    const c = sql[i]
    const next = sql[i + 1]
    if (c === '\n') {
      put(' ')
      line++
    } else if (c === '-' && next === '-') {
      while (i + 1 < sql.length && sql[i + 1] !== '\n') i++
      put(' ')
    } else if (c === '/' && next === '*') {
      i += 2
      while (i < sql.length && !(sql[i] === '*' && sql[i + 1] === '/')) {
        if (sql[i] === '\n') line++
        i++
      }
      i++
      put(' ')
    } else if (c === "'") {
      const startLine = line
      i++
      while (i < sql.length && !(sql[i] === "'" && sql[i + 1] !== "'")) {
        if (sql[i] === '\n') line++
        i += sql[i] === "'" ? 2 : 1
      }
      const endLine = line
      line = startLine
      put("''")
      line = endLine
    } else if (c === '"') {
      let j = i + 1
      while (j < sql.length && !(sql[j] === '"' && sql[j + 1] !== '"')) j += sql[j] === '"' ? 2 : 1
      put(sql.slice(i, j + 1))
      i = j
    } else if (c === '$' && /^\$(?:[A-Za-z_]\w*)?\$/.test(sql.slice(i, i + 64))) {
      i += /^\$(?:[A-Za-z_]\w*)?\$/.exec(sql.slice(i, i + 64))[0].length - 1
      put(' ')
    } else if (c === ';') {
      flush(true)
    } else if (c === ',' && depth === 0 && kindSoFar()) {
      flush(false)
    } else {
      if (c === '(') depth++
      if (c === ')') depth--
      put(c)
    }
  }
  flush(true)
  return out
}

let errors = 0
let warnings = 0
function flag(level, file, line, title, message) {
  console.log(`::${level} file=${file},line=${line},title=${title}::${message}`)
  if (level === 'error') errors++
  else warnings++
}

function check(file) {
  for (const clause of clauses(readFileSync(file, 'utf8'))) {
    const { text, lines } = clause
    const lineAt = (index) => lines[index] ?? lines[0]

    const dropTable = /\bDROP\s+TABLE\b/i.exec(text)
    if (dropTable) flag('error', file, lineAt(dropTable.index), 'Drops a table', `${RUNNING} may read or write this table.`)
    if (!clause.kind) continue

    // The action: what follows ALTER TABLE <name>, or the whole clause after a comma.
    const head = (clause.kind === 'table' ? ALTER_TABLE : ALTER_TYPE).exec(text)
    const from = head ? head.index + head[0].length : text.search(/\S/)
    const action = text.slice(from)
    const rules = clause.kind === 'table' ? TABLE_RULES : TYPE_RULES
    const rule = rules.find(([re]) => re.test(action))
    if (rule) {
      flag('error', file, lineAt(from), rule[1], rule[2])
    } else if (clause.kind === 'table' && ADD_COLUMN.test(action)) {
      const required = /\bNOT\s+NULL\b|\bPRIMARY\s+KEY\b/i.test(action)
      const filled = /\bDEFAULT\b|\bGENERATED\b/i.test(action)
      if (required && !filled) {
        flag('error', file, lineAt(from), 'Adds a required column with no default', `${RUNNING} inserts rows without it. Give it a default, or add it nullable and require it in a later release.`)
      }
    } else if (clause.kind === 'type' && /^ADD\s+VALUE\b/i.test(action)) {
      flag('warning', file, lineAt(from), 'Adds an enum value', `${RUNNING} cannot read rows that hold the new value. Fine as long as nothing writes it before the deploy is done, and nothing needs a rollback after.`)
    }
  }
}

const files = process.argv.slice(2)
for (const file of files) if (existsSync(file)) check(file)

if (errors > 0) {
  console.log()
  console.log(`${errors} statement(s) would break the version still running during a deploy, and the one a rollback puts back.`)
  console.log('Split the change across releases. If it is safe anyway (nothing uses what is dropped, say), add the')
  console.log('allow-breaking-migration label to the pull request and say why in its description.')
  process.exit(1)
}
const note = warnings > 0 ? ` (${warnings} warning(s) above)` : ''
console.log(`Checked ${files.length} migration file(s): nothing that breaks the running version${note}.`)
