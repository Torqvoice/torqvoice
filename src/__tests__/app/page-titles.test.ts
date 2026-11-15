import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

/**
 * Every page names itself in the browser tab (WCAG 2.4.2), instead of the
 * root layout's default title. A page does that by exporting `metadata` or
 * `generateMetadata`, or a `layout.tsx` beside it does (the way to title a
 * `'use client'` page, which cannot export metadata). The root layout does not
 * count: its title is the default this test exists to get away from.
 */

const appRoot = path.resolve(process.cwd(), 'src/app')
const messagesRoot = path.resolve(process.cwd(), 'messages/en')

/** Pages a person never reads: each only redirects or 404s. */
const UNTITLED_PAGES = new Set([
  // Permanent redirect to the terms on the marketing site.
  '(public)/terms/page.tsx',
  // Redirect to the workshop's portal dashboard.
  '(public)/portal/[orgId]/page.tsx',
  // Redirect to the portal's invoices, kept for old links.
  '(public)/portal/[orgId]/documents/page.tsx',
  // Calls notFound() for any unknown portal address.
  '(public)/portal/[orgId]/[...missing]/page.tsx',
])

const EXPORTS_METADATA =
  /export\s+(const\s+metadata\b|(async\s+)?function\s+generateMetadata\b|const\s+generateMetadata\b)/

function findPages(dir: string): string[] {
  const out: string[] = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) out.push(...findPages(full))
    else if (entry.name === 'page.tsx') out.push(full)
  }
  return out
}

function exportsMetadata(file: string): boolean {
  return fs.existsSync(file) && EXPORTS_METADATA.test(fs.readFileSync(file, 'utf-8'))
}

const pages = findPages(appRoot)
  .map((file) => path.relative(appRoot, file).split(path.sep).join('/'))
  .sort()

describe('page titles', () => {
  it('finds the pages', () => {
    expect(pages.length).toBeGreaterThan(100)
  })

  it('gives every page a title of its own', () => {
    const untitled = pages.filter((page) => {
      if (UNTITLED_PAGES.has(page)) return false
      const file = path.join(appRoot, page)
      const layout = path.join(path.dirname(file), 'layout.tsx')
      return !exportsMetadata(file) && !exportsMetadata(layout)
    })
    expect(
      untitled,
      'add generateMetadata, e.g. `return pageTitle(...)` from @/lib/page-title'
    ).toEqual([])
  })

  it('only allowlists pages that still exist', () => {
    for (const page of UNTITLED_PAGES) expect(pages).toContain(page)
  })

  it('names pages with English messages that exist', () => {
    const lookup = (dotted: string): unknown => {
      const [namespace, ...rest] = dotted.split('.')
      const file = path.join(messagesRoot, `${namespace}.json`)
      if (!fs.existsSync(file)) return undefined
      let cur: unknown = JSON.parse(fs.readFileSync(file, 'utf-8'))
      for (const seg of rest) cur = (cur as Record<string, unknown> | undefined)?.[seg]
      return cur
    }
    const call = /\b(pageTitle|settingsPageTitle|titleFrom)\(\s*'([^']+)'(?:\s*,\s*'([^']+)')?/g
    const missing: string[] = []
    for (const page of pages) {
      const dir = path.dirname(path.join(appRoot, page))
      for (const name of ['page.tsx', 'layout.tsx']) {
        const file = path.join(dir, name)
        if (!fs.existsSync(file)) continue
        for (const [, helper, first, second] of fs.readFileSync(file, 'utf-8').matchAll(call)) {
          // A key worked out at runtime (marine or not) is not checked here.
          if (helper === 'titleFrom' && !second) continue
          const key =
            helper === 'pageTitle'
              ? `navigation.breadcrumbs.${first}`
              : helper === 'settingsPageTitle'
                ? `settings.nav.items.${first}.title`
                : `${first}.${second}`
          if (typeof lookup(key) !== 'string') missing.push(`${page}: ${key}`)
        }
      }
    }
    expect(missing).toEqual([])
  })
})
