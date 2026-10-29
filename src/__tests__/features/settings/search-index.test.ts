import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import type { SettingsEntry } from '@/features/settings/Lib/searchIndex/types'
import { SETTINGS_PAGES, settingsPage } from '@/features/settings/Lib/settingsPages'

/**
 * Every page module under searchIndex/, found by glob so a module an agent
 * is still writing is checked before it is wired into the aggregate.
 */
const modules = import.meta.glob('/src/features/settings/Lib/searchIndex/*.ts', {
  eager: true,
}) as Record<string, Record<string, unknown>>

const entriesByModule: Record<string, SettingsEntry[]> = {}
for (const [file, mod] of Object.entries(modules)) {
  const name = path.basename(file, '.ts')
  if (name === 'index' || name === 'types') continue
  const exported = Object.values(mod).find(Array.isArray) as SettingsEntry[] | undefined
  entriesByModule[name] = exported ?? []
}
const allEntries = Object.values(entriesByModule).flat()

const root = process.cwd()
const settingsDir = path.join(root, 'src/app/(authenticated)/settings')

function readMessages(locale: string): Record<string, unknown> {
  return JSON.parse(fs.readFileSync(path.join(root, 'messages', locale, 'settings.json'), 'utf8'))
}

function resolveKey(obj: unknown, key: string): unknown {
  let cur = obj
  for (const seg of key.split('.')) {
    if (cur == null || typeof cur !== 'object') return undefined
    cur = (cur as Record<string, unknown>)[seg]
  }
  return cur
}

function listFiles(dir: string, out: string[] = []): string[] {
  if (!fs.existsSync(dir)) return out
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name)
    if (fs.statSync(full).isDirectory()) listFiles(full, out)
    else if (/\.tsx?$/.test(name)) out.push(full)
  }
  return out
}

const pageSources = new Map<string, string>()
function pageSource(href: string): string {
  const slug = href.replace('/settings/', '')
  const cached = pageSources.get(slug)
  if (cached) return cached
  const files = listFiles(path.join(settingsDir, slug))
  const text = files.map((f) => fs.readFileSync(f, 'utf8')).join('\n')
  pageSources.set(slug, text)
  return text
}

let featureSource: string | null = null
function sharedSource(): string {
  if (featureSource === null) {
    featureSource = [
      ...listFiles(path.join(root, 'src/features')),
      ...listFiles(path.join(root, 'src/components')),
    ]
      .map((f) => fs.readFileSync(f, 'utf8'))
      .join('\n')
  }
  return featureSource
}

function hasAnchor(source: string, anchor: string): boolean {
  return (
    source.includes(`id="${anchor}"`) ||
    source.includes(`id={'${anchor}'}`) ||
    source.includes(`id="${anchor}" `) ||
    source.includes(`id='${anchor}'`)
  )
}

const en = readMessages('en')
const locales = fs
  .readdirSync(path.join(root, 'messages'))
  .filter((l) => fs.existsSync(path.join(root, 'messages', l, 'settings.json')))

describe('settings search index', () => {
  it('has at least one module', () => {
    expect(Object.keys(entriesByModule).length).toBeGreaterThan(0)
  })

  it('names every module after a settings page and exports entries for that page', () => {
    for (const [name, entries] of Object.entries(entriesByModule)) {
      expect(
        SETTINGS_PAGES.map((p) => p.key),
        `module ${name}`
      ).toContain(name)
      expect(entries.length, `module ${name} has entries`).toBeGreaterThan(0)
      for (const entry of entries) {
        expect(entry.page, `${entry.id} lives in ${name}.ts`).toBe(name)
      }
    }
  })

  it('gives every entry a unique id prefixed with its page', () => {
    const seen = new Set<string>()
    for (const entry of allEntries) {
      expect(entry.id.startsWith(`${entry.page}.`), `${entry.id} starts with ${entry.page}.`).toBe(
        true
      )
      expect(seen.has(entry.id), `${entry.id} is unique`).toBe(false)
      seen.add(entry.id)
    }
  })

  it('points every entry at a page that exists on disk', () => {
    for (const entry of allEntries) {
      const page = settingsPage(entry.page)
      const slug = page.href.replace('/settings/', '')
      expect(
        fs.existsSync(path.join(settingsDir, slug, 'page.tsx')),
        `${entry.id}: ${page.href}`
      ).toBe(true)
    }
  })

  it('resolves every title and description to an English string', () => {
    for (const entry of allEntries) {
      expect(typeof resolveKey(en, entry.title), `${entry.id} title ${entry.title}`).toBe('string')
      if (entry.description) {
        expect(
          typeof resolveKey(en, entry.description),
          `${entry.id} description ${entry.description}`
        ).toBe('string')
      }
    }
  })

  it('never titles an entry with a string that needs values', () => {
    // The palette calls t(key) with nothing to fill in, so "{unit}" would print raw.
    for (const entry of allEntries) {
      for (const key of [entry.title, entry.description]) {
        if (!key) continue
        const text = String(resolveKey(en, key))
        const needed = [...text.matchAll(/\{(\w+)/g)].map((m) => m[1])
        for (const name of needed) {
          expect(entry.values?.[name], `${entry.id}: ${key} needs {${name}}`).toBeDefined()
        }
      }
    }
  })

  it('resolves every title in every locale', () => {
    for (const locale of locales) {
      const messages = readMessages(locale)
      for (const entry of allEntries) {
        expect(typeof resolveKey(messages, entry.title), `${locale}: ${entry.id} title`).toBe(
          'string'
        )
      }
    }
  })

  it('keeps keywords lower case, trimmed and non-empty', () => {
    for (const entry of allEntries) {
      expect(entry.keywords.length, `${entry.id} has keywords`).toBeGreaterThan(0)
      for (const keyword of entry.keywords) {
        expect(keyword, `${entry.id} keyword "${keyword}"`).toBe(keyword.trim().toLowerCase())
        expect(keyword.length, `${entry.id} keyword "${keyword}"`).toBeGreaterThan(0)
      }
    }
  })

  it('finds every anchor as a literal id in the page source', () => {
    for (const entry of allEntries) {
      if (!entry.anchor) continue
      const page = settingsPage(entry.page)
      const found =
        hasAnchor(pageSource(page.href), entry.anchor) || hasAnchor(sharedSource(), entry.anchor)
      expect(found, `${entry.id}: id="${entry.anchor}" in ${page.href}`).toBe(true)
    }
  })

  it('writes queries without a leading question mark', () => {
    for (const entry of allEntries) {
      if (entry.query) expect(entry.query.startsWith('?'), `${entry.id} query`).toBe(false)
    }
  })
})
