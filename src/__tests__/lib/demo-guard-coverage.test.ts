import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * The demo runs on a public instance with real provider credentials, so an
 * action that reaches a customer must refuse to run there. Guards were added
 * by hand and one was missed for months, which is the kind of thing a person
 * cannot be expected to keep checking.
 */

const ACTIONS_DIR = 'src/features'

/** Calls that leave the building: a message, an email, or a paid service. */
const REACHES_OUTSIDE =
  /sendOrg\w+|sendTelegramMessage|sendOrgMail|adapter\.send\(|registerNumber\(|api\/license\/validate/

function actionFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) return actionFiles(full)
    return entry.isFile() && full.includes(`${path.sep}Actions${path.sep}`) && full.endsWith('.ts')
      ? [full]
      : []
  })
}

describe('demo mode', () => {
  it('refuses every action that reaches a customer', () => {
    const unguarded: string[] = []

    for (const file of actionFiles(ACTIONS_DIR)) {
      const source = fs.readFileSync(file, 'utf-8')
      for (const block of source.split(/(?=^export async function )/m)) {
        const name = block.match(/^export async function (\w+)/)?.[1]
        if (!name || !REACHES_OUTSIDE.test(block)) continue
        if (!block.includes('demoGuard()')) unguarded.push(`${file} → ${name}`)
      }
    }

    expect(unguarded).toEqual([])
  })
})
