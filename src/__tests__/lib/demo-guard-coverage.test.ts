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

/**
 * Every server-side `fetch` that can carry an org's own data or credentials to
 * a host outside this box, and where it is stopped in demo mode. A new one
 * belongs in a transport that refuses, and then in this list.
 */
// Quote style is biome's business and it differs across these files, so the
// patterns accept either rather than breaking on the next reformat.
const EGRESS_PATHS: Array<{ file: string; stoppedBy: RegExp }> = [
  { file: 'src/lib/email.ts', stoppedBy: /assertOutboundAllowed\(['"]email['"]\)/ },
  { file: 'src/lib/sms.ts', stoppedBy: /assertOutboundAllowed\(['"]sms['"]\)/ },
  { file: 'src/lib/telegram.ts', stoppedBy: /assertOutboundAllowed\(['"]telegram['"]\)/ },
  { file: 'src/lib/whatsapp/index.ts', stoppedBy: /assertOutboundAllowed\(['"]whatsapp['"]\)/ },
  // Webhooks are the odd one out: delivery must not throw, so both the
  // dispatcher and the wire check the flag and return instead.
  { file: 'src/features/webhooks/Lib/dispatcher.ts', stoppedBy: /if \(isDemoMode\) return/ },
  { file: 'src/features/webhooks/Lib/deliver.ts', stoppedBy: /if \(isDemoMode\)/ },
  // Fetches whatever URL it is handed, which on a public demo is an open
  // outbound proxy rather than a part lookup.
  { file: 'src/app/api/protected/fetch-metadata/route.ts', stoppedBy: /if \(isDemoMode\)/ },
]

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

  it('stops every outbound transport before it reaches the network', () => {
    const unstopped = EGRESS_PATHS.filter(
      ({ file, stoppedBy }) => !stoppedBy.test(fs.readFileSync(file, 'utf-8'))
    ).map(({ file }) => file)

    expect(unstopped, `these can leave the box on the demo:\n${unstopped.join('\n')}`).toEqual([])
  })

  it('leaves no server-side fetch outside that list', () => {
    // A `fetch` in a new lib/route is the shape every hole so far has had, so
    // finding one that nobody has classified is worth failing over. Payment
    // providers are exempt: their credentials cannot be set on the demo, so
    // there is no configured client for anything to call.
    const searchRoots = ['src/lib', 'src/app/api', 'src/features']
    // The directory names are anchored to a path separator on both sides:
    // unanchored, `hooks/` also matches `webhooks/` and quietly exempts the
    // one tree in here that talks to a URL somebody else chose.
    const exempt =
      /__tests__|src[/\\]lib[/\\]payment-providers[/\\]|[/\\](Components|hooks)[/\\]|\.tsx$/

    const files: string[] = []
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name)
        if (entry.isDirectory()) walk(full)
        else if (entry.isFile() && full.endsWith('.ts') && !exempt.test(full)) files.push(full)
      }
    }
    searchRoots.forEach(walk)

    const known = new Set(EGRESS_PATHS.map((e) => e.file.split(path.posix.sep).join(path.sep)))
    // Adapters are reached only through their transport, which already refuses.
    const reachedViaTransport = /whatsapp[/\\]adapters[/\\]/
    // Guarded by demoGuard() in the action that calls them, or by isDemoMode
    // in the cron that does.
    const guardedByCaller =
      /aiSettingsActions\.ts$|validateLicense\.ts$|cron[/\\]check-licenses\.ts$/

    const unclassified = files.filter((file) => {
      if (known.has(file) || reachedViaTransport.test(file) || guardedByCaller.test(file))
        return false
      return /\bawait fetch\(|= fetch\(/.test(fs.readFileSync(file, 'utf-8'))
    })

    expect(
      unclassified,
      `these make a server-side request nobody has classified for demo mode:\n${unclassified.join('\n')}`
    ).toEqual([])
  })
})
