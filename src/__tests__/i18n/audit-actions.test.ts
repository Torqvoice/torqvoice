import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

/**
 * Every audit action the code writes must have a label in every locale.
 *
 * A missing one is not a crash: next-intl returns a placeholder, so the raw
 * key reaches the dashboard and the console fills with MISSING_MESSAGE. That
 * is exactly how `scheduled_message.create` shipped, so this closes the gap
 * rather than the individual keys.
 */
const ROOT = process.cwd()
const LOCALES = fs
  .readdirSync(path.join(ROOT, 'messages'))
  .filter((d) => fs.statSync(path.join(ROOT, 'messages', d)).isDirectory())

/** Audit actions are namespaced with a dot or an underscore; bare words in the
 *  `action:` position belong to permissions, API payloads and test fixtures. */
function emittedActions(): string[] {
  const found = new Set<string>()
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        if (entry.name !== 'node_modules' && entry.name !== '__tests__') walk(full)
      } else if (/\.tsx?$/.test(entry.name)) {
        const src = fs.readFileSync(full, 'utf-8')
        // Either quote. The codebase is mid-migration between the two and
        // biome rewrites a file's quotes the first time anybody touches it, so
        // a pattern that only knows about double quotes quietly stops seeing
        // actions that are still very much being emitted.
        for (const m of src.matchAll(/action:\s*['"]([a-zA-Z][\w]*\.[\w.]+)['"]/g)) {
          found.add(m[1])
        }
      }
    }
  }
  walk(path.join(ROOT, 'src'))
  return [...found].sort()
}

const ACTIONS = emittedActions()

describe('audit action labels', () => {
  it('finds the audit actions the code emits', () => {
    expect(ACTIONS.length).toBeGreaterThan(50)
    expect(ACTIONS).toContain('inspection.create')
  })

  it.each(LOCALES)('%s has a label for every emitted action', (locale) => {
    const actions = JSON.parse(
      fs.readFileSync(path.join(ROOT, 'messages', locale, 'audit.json'), 'utf-8')
    ).actions as Record<string, string>

    const missing = ACTIONS.filter((a) => !(a.replaceAll('.', '_') in actions))
    expect(missing, `missing in ${locale}: ${missing.join(', ')}`).toEqual([])
  })

  it('keeps every locale on the same set of action keys as English', () => {
    const keysFor = (locale: string) =>
      Object.keys(
        JSON.parse(fs.readFileSync(path.join(ROOT, 'messages', locale, 'audit.json'), 'utf-8'))
          .actions
      ).sort()
    const en = keysFor('en')
    for (const locale of LOCALES) {
      expect(keysFor(locale), `${locale} drifted from en`).toEqual(en)
    }
  })
})
