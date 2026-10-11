/**
 * Every date-ranged report, and the calendar sync, finds a job by its
 * `startDateTime`. A job written without one is in none of them: the three
 * importers did exactly that, and a workshop's imported history was missing
 * from its revenue, profit, parts and tax reports.
 *
 * The importers are whole route handlers over a zip upload, so this guards
 * the rule at the source instead: every call that creates a service record
 * has to say when it starts.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const SRC = path.resolve(__dirname, '../../..')
const SKIP = new Set(['__tests__', 'generated', 'node_modules'])

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    if (SKIP.has(name)) return []
    const full = path.join(dir, name)
    if (statSync(full).isDirectory()) return sourceFiles(full)
    return /\.tsx?$/.test(name) ? [full] : []
  })
}

/** Each `serviceRecord.create(...)` call in a file, from the name to its closing bracket. */
function createCalls(source: string): string[] {
  const calls: string[] = []
  const opener = /serviceRecord\.create\(/g
  for (let match = opener.exec(source); match; match = opener.exec(source)) {
    let depth = 0
    let end = match.index + match[0].length - 1
    for (; end < source.length; end++) {
      if (source[end] === '(') depth++
      else if (source[end] === ')' && --depth === 0) break
    }
    calls.push(source.slice(match.index, end + 1))
  }
  return calls
}

describe('creating a service record', () => {
  const creators = sourceFiles(SRC)
    .map((file) => ({ file, calls: createCalls(readFileSync(file, 'utf8')) }))
    .filter(({ calls }) => calls.length > 0)

  it('finds the places that do it', () => {
    expect(creators.length).toBeGreaterThan(5)
  })

  // Per call, not per file: the sample data set a start on two of its three
  // jobs, and the third was missing from every new workshop's reports.
  it.each(
    creators.flatMap(({ file, calls }) =>
      calls.map((call, index) => [`${path.relative(SRC, file)} #${index + 1}`, call])
    )
  )('%s sets startDateTime', (_name, call) => {
    expect(call).toMatch(/startDateTime/)
  })
})
