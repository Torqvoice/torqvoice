import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Every translation key the code asks for has to exist.
 *
 * Parity already proves the twelve locales carry the same keys. It cannot
 * prove they are the keys anybody wants: a string written into the wrong
 * namespace passes parity in all twelve and throws MISSING_MESSAGE on the
 * screen that uses it. That happened to workBoard.technician.standaloneOnly,
 * which sat one level too high in a file every locale agreed about.
 */

const ROOT = process.cwd()
const MESSAGES = path.join(ROOT, 'messages', 'en')

const bundle: Record<string, unknown> = {}
for (const file of fs.readdirSync(MESSAGES)) {
  if (file.endsWith('.json')) {
    bundle[file.replace(/\.json$/, '')] = JSON.parse(
      fs.readFileSync(path.join(MESSAGES, file), 'utf-8')
    )
  }
}

function resolves(dotted: string): boolean {
  let node: unknown = bundle
  for (const part of dotted.split('.')) {
    if (node == null || typeof node !== 'object' || !(part in (node as object))) return false
    node = (node as Record<string, unknown>)[part]
  }
  return typeof node === 'string'
}

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (!['node_modules', '__tests__', 'generated'].includes(entry.name)) sourceFiles(full, out)
    } else if (/\.tsx?$/.test(entry.name)) {
      out.push(full)
    }
  }
  return out
}

/**
 * Keys asked for through a namespace binding that is unambiguous in its file.
 *
 * A file that binds the same name twice, usually two components sharing a
 * module, cannot be read without following scope, so it is skipped rather
 * than guessed at. Skipping loses coverage; guessing invents failures, and a
 * test nobody trusts gets deleted.
 */
function requestedKeys(): { file: string; key: string }[] {
  const found: { file: string; key: string }[] = []

  for (const file of sourceFiles(path.join(ROOT, 'src'))) {
    const src = fs.readFileSync(file, 'utf-8')
    const counts = new Map<string, number>()
    const namespaces = new Map<string, string>()

    for (const m of src.matchAll(
      /const\s+(\w+)\s*=\s*useTranslations\(\s*['"]([\w.]+)['"]\s*\)/g
    )) {
      counts.set(m[1], (counts.get(m[1]) ?? 0) + 1)
      namespaces.set(m[1], m[2])
    }

    for (const [binding, namespace] of namespaces) {
      if (counts.get(binding) !== 1) continue
      const call = new RegExp(`\\b${binding}(?:\\.rich|\\.raw)?\\(\\s*['"]([\\w.]+)['"]`, 'g')
      for (const m of src.matchAll(call)) {
        // `t(`prefix.${code}`)` leaves a trailing dot on the literal part.
        // The key is assembled at runtime and there is nothing to check.
        if (m[1].endsWith('.')) continue
        found.push({ file: path.relative(ROOT, file), key: `${namespace}.${m[1]}` })
      }
    }
  }
  return found
}

const REQUESTED = requestedKeys()

describe('translation keys the code asks for', () => {
  it('finds enough of them to be worth running', () => {
    expect(REQUESTED.length).toBeGreaterThan(200)
  })

  it('all resolve to a string in English', () => {
    const missing = [...new Set(REQUESTED.filter((r) => !resolves(r.key)).map((r) => r.key))].sort()
    expect(
      missing,
      `Written into the wrong namespace, or never written:\n  ${missing.join('\n  ')}`
    ).toEqual([])
  })
})
