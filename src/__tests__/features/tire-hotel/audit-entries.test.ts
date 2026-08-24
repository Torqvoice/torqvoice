/**
 * What the tire hotel writes into the audit trail.
 *
 * Two failures here are invisible until somebody goes looking months later.
 *
 * An audit row with no `entity` is dropped by the audit log's entity filter
 * and shows no entity in the detail drawer. Nothing errors, the row is simply
 * unfindable by the one filter meant to find it. Every other feature sets it,
 * so the omission looks deliberate rather than forgotten.
 *
 * And a `(s)` in a message means someone has gone back to composing English
 * by hand instead of naming a key. The sentences live in the message
 * catalogue now, one per language, checked by audit-summary-keys.test.ts.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'

const ACTIONS_DIR = 'src/features/tire-hotel/Actions'

/** Every audit block in the tire hotel, with the action it records. */
function auditBlocks(): { file: string; action: string; body: string }[] {
  const found: { file: string; action: string; body: string }[] = []
  for (const name of readdirSync(ACTIONS_DIR)) {
    if (!name.endsWith('.ts')) continue
    const file = path.join(ACTIONS_DIR, name)
    const source = readFileSync(file, 'utf-8')
    for (const match of source.matchAll(
      // Three levels deep: the block, its details object, and that
      // object's params.
      /audit:\s*(?:\([^)]*\)\s*=>\s*)?\(?\{((?:[^{}]|\{(?:[^{}]|\{[^{}]*\})*\})*)\}/g
    )) {
      const body = match[1]
      const action = body.match(/action:\s*(.+)/)?.[1]?.trim()
      if (!action) continue
      found.push({ file, action, body })
    }
  }
  return found
}

describe('every tire hotel audit row', () => {
  it('finds the audit blocks at all', () => {
    // Without this the sweeps below pass by inspecting nothing.
    expect(auditBlocks().length).toBeGreaterThan(20)
  })

  it('names the thing it happened to', () => {
    const anonymous = auditBlocks()
      .filter(({ body }) => !body.includes('entity:'))
      .map(({ file, action }) => `${file}  ${action}`)

    expect(anonymous, `these write no entity:\n${anonymous.join('\n')}`).toEqual([])
  })

  it('carries no unfinished plural into stored text', () => {
    const sloppy = auditBlocks()
      .filter(({ body }) => /\(s\)/.test(body))
      .map(({ file, action }) => `${file}  ${action}`)

    expect(sloppy, `these store "(s)":\n${sloppy.join('\n')}`).toEqual([])
  })
})
