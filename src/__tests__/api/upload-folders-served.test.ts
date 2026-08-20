/**
 * Every folder the app uploads into must also be servable.
 *
 * The file route checks the folder against a whitelist. Add an upload route
 * and forget the whitelist and the upload succeeds, the bytes land on disk,
 * the row is written, and the image renders as broken with a 400 behind it.
 * Nothing in the stack calls that an error, so it reads as a bug in the
 * feature rather than as a missing line in a list.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import path from 'node:path'

const UPLOAD_ROOT = 'src/app/api/protected/upload'
const FILE_ROUTE = 'src/app/api/protected/files/[...path]/route.ts'

/** The folder each upload route writes into, read from the route itself. */
function uploadFolders(): { route: string; folder: string }[] {
  const found: { route: string; folder: string }[] = []

  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        walk(full)
        continue
      }
      if (entry.name !== 'route.ts') continue
      const source = readFileSync(full, 'utf-8')
      for (const match of source.matchAll(/ctx\.organizationId,\s*['"]([a-z-]+)['"]/g)) {
        found.push({ route: full, folder: match[1] })
      }
    }
  }

  walk(UPLOAD_ROOT)
  return found
}

/** The folders the file route agrees to serve. */
function servedFolders(): string[] {
  const source = readFileSync(FILE_ROUTE, 'utf-8')
  const block = source.slice(source.indexOf('const allowedCategories'))
  const list = block.slice(0, block.indexOf(']'))
  return [...list.matchAll(/'([a-z-]+)'/g)].map((match) => match[1])
}

describe('upload folders', () => {
  it('finds the upload routes at all', () => {
    // If this ever returns nothing the rest of the file passes vacuously.
    expect(existsSync(UPLOAD_ROOT)).toBe(true)
    expect(uploadFolders().length).toBeGreaterThan(3)
  })

  it('are every one of them servable', () => {
    const served = servedFolders()
    expect(served.length).toBeGreaterThan(3)

    for (const { route, folder } of uploadFolders()) {
      expect(served, `${route} writes into "${folder}", which the file route refuses`).toContain(
        folder
      )
    }
  })
})
