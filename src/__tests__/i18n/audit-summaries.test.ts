/**
 * Every audit sentence must have a key, and every key must be reachable.
 *
 * An audit row is written once and read years later, so a wrong key is not
 * something the next deploy can fix: the row keeps whatever it was given. The
 * fallback keeps such a row readable in English, which also means a missing
 * key is invisible to anyone testing in English. Only a sweep finds it.
 */

import { describe, it, expect } from 'vitest'
import { IntlMessageFormat } from 'intl-messageformat'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'

const LOCALES = ['en', 'nb', 'de', 'es', 'fr', 'it', 'lt', 'nl', 'pl', 'pt-BR', 'ru', 'tr']

function summary(locale: string): Record<string, string> {
  return JSON.parse(readFileSync(`messages/${locale}/audit.json`, 'utf-8')).summary ?? {}
}

/** Every `key:` inside a `details:` block across the app. */
function keysInUse(): { file: string; key: string }[] {
  const found: { file: string; key: string }[] = []
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        if (entry.name === '__tests__') continue
        walk(full)
        continue
      }
      if (!entry.name.endsWith('.ts') && !entry.name.endsWith('.tsx')) continue
      const source = readFileSync(full, 'utf-8')
      // details: { key: 'x' ... }  and  auditDetails('x', ...)
      for (const m of source.matchAll(/details:\s*\{\s*key:\s*['"]([a-zA-Z_]+)['"]/g)) {
        found.push({ file: full, key: m[1] })
      }
      for (const m of source.matchAll(/auditDetails\(\s*\n?\s*['"]([a-zA-Z_]+)['"]/g)) {
        found.push({ file: full, key: m[1] })
      }
      // The conditional form: auditDetails(cond ? 'a' : 'b', ...)
      for (const m of source.matchAll(
        /auditDetails\([^)]*?\?\s*['"]([a-zA-Z_]+)['"]\s*:\s*['"]([a-zA-Z_]+)['"]/g
      )) {
        found.push({ file: full, key: m[1] }, { file: full, key: m[2] })
      }
    }
  }
  walk('src')
  return found
}

describe('audit summaries', () => {
  it('finds the call sites at all', () => {
    // Without this the sweeps below pass by inspecting nothing.
    expect(keysInUse().length).toBeGreaterThan(100)
  })

  it('has English wording for every key the app uses', () => {
    const en = summary('en')
    const orphans = [...new Set(keysInUse().filter((k) => !en[k.key]).map((k) => k.key))]
    expect(orphans, `no English for:\n${orphans.join('\n')}`).toEqual([])
  })

  it('uses every key it defines', () => {
    // A key nothing writes is either a typo at the call site or wording left
    // behind by a rename. Both are worth knowing about.
    const used = new Set(keysInUse().map((k) => k.key))
    const unused = Object.keys(summary('en')).filter((k) => !used.has(k))
    expect(unused, `defined but never written:\n${unused.join('\n')}`).toEqual([])
  })

  it('says the same things in every language', () => {
    const en = Object.keys(summary('en')).sort()
    for (const locale of LOCALES.slice(1)) {
      const theirs = summary(locale)
      const missing = en.filter((k) => !theirs[k])
      expect(missing, `${locale} is missing:\n${missing.join('\n')}`).toEqual([])
      const extra = Object.keys(theirs).filter((k) => !en.includes(k))
      expect(extra, `${locale} has keys English does not:\n${extra.join('\n')}`).toEqual([])
    }
  })

  it('renders in every language without an ICU error', () => {
    // 117 sentences times 12 languages, several with nested plural and select
    // blocks. One unbalanced brace throws at render time, on the audit page,
    // in that language only, which is exactly the sort of thing that reaches
    // production because nobody tests in Lithuanian.
    const sample: Record<string, string | number> = {
      name: 'X', id: 'X', ref: 'X', code: 'X', from: 'A', to: 'B', jobRef: 'J',
      title: 'T', description: 'D', fileName: 'f.jpg', recipient: 'a@b.c',
      email: 'a@b.c', phone: '+1', amount: '10', rate: 8, items: 'a, b',
      channels: 'email', vehicleId: 'V', serviceRecordId: 'S', sendAt: 'now',
      fields: 'colour', year: 2024, make: 'M', model: 'M',
      status: 'draft', role: 'admin', channel: 'email', type: 'wash_tires',
      count: 2, records: 2, quotes: 2,
    }
    for (const locale of LOCALES) {
      const messages = summary(locale)
      for (const [key, text] of Object.entries(messages)) {
        let out = ''
        expect(() => {
          out = new IntlMessageFormat(text, locale).format(sample) as string
        }, `${locale} ${key}: ${text}`).not.toThrow()
        expect(out, `${locale} ${key} rendered empty`).toBeTruthy()
        expect(out, `${locale} ${key} left a brace behind`).not.toMatch(/[{}]/)
      }
    }
  })

  it('keeps the same placeholders in every language', () => {
    // A dropped {ref} loses the one detail that identifies the record, and
    // next-intl throws on a placeholder with no value rather than skipping it.
    const names = (t: string) => {
      const out: string[] = []
      let depth = 0
      for (let i = 0; i < t.length; i += 1) {
        if (t[i] === '{') {
          if (depth === 0) {
            const m = /^\{(\w+)/.exec(t.slice(i))
            if (m) out.push(m[1])
          }
          depth += 1
        } else if (t[i] === '}') depth -= 1
      }
      return [...new Set(out)].sort()
    }
    const en = summary('en')
    for (const locale of LOCALES.slice(1)) {
      const theirs = summary(locale)
      for (const [key, text] of Object.entries(en)) {
        if (!theirs[key]) continue
        expect(names(theirs[key]), `${locale} ${key} placeholders`).toEqual(names(text))
      }
    }
  })
})
