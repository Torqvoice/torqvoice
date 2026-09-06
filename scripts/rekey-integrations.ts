/**
 * Re-seals every integration connection under a new vault key.
 *
 * Credentials are sealed with INTEGRATIONS_ENCRYPTION_KEY, or with a key
 * derived from BETTER_AUTH_SECRET when that is unset. Changing either without
 * re-sealing leaves every connection unreadable: calendars stop syncing and
 * the messaging channels fall back to the settings rows from before the move,
 * logging an error on every send. This script is the way to change a key.
 *
 * Give it the key the rows are sealed with today and the key they should be
 * sealed with from now on. Either may be given as the 64-hex value or as the
 * BETTER_AUTH_SECRET it was derived from:
 *
 *   OLD_INTEGRATIONS_ENCRYPTION_KEY=<hex> NEW_INTEGRATIONS_ENCRYPTION_KEY=<hex> \
 *     npx tsx scripts/rekey-integrations.ts            # report only
 *   ... npx tsx scripts/rekey-integrations.ts --write  # re-seal
 *
 *   OLD_BETTER_AUTH_SECRET=<secret> NEW_INTEGRATIONS_ENCRYPTION_KEY=<hex> ...
 *
 * Run it while the app still holds the old key, then switch the app to the
 * new key and restart. Rows that the old key cannot open are reported and
 * left as they are.
 */

import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto'
import { db } from '@/lib/db'

const VERSION = 'v1'

function keyFrom(prefix: 'OLD' | 'NEW'): Buffer {
  const explicit = process.env[`${prefix}_INTEGRATIONS_ENCRYPTION_KEY`]?.trim()
  if (explicit) {
    if (!/^[0-9a-f]{64}$/i.test(explicit)) {
      throw new Error(`${prefix}_INTEGRATIONS_ENCRYPTION_KEY must be 64 hex characters`)
    }
    return Buffer.from(explicit, 'hex')
  }
  const secret = process.env[`${prefix}_BETTER_AUTH_SECRET`]
  if (!secret) {
    throw new Error(
      `Set ${prefix}_INTEGRATIONS_ENCRYPTION_KEY or ${prefix}_BETTER_AUTH_SECRET (the same derivation the app uses)`
    )
  }
  return Buffer.from(hkdfSync('sha256', secret, 'torqvoice', 'integrations-vault', 32))
}

function open(sealed: string, key: Buffer): string {
  const [version, ivB64, tagB64, dataB64] = sealed.split('.')
  if (version !== VERSION || !ivB64 || !tagB64 || !dataB64) {
    throw new Error('Unrecognised credential format')
  }
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivB64, 'base64url'))
  decipher.setAuthTag(Buffer.from(tagB64, 'base64url'))
  return Buffer.concat([
    decipher.update(Buffer.from(dataB64, 'base64url')),
    decipher.final(),
  ]).toString('utf8')
}

function seal(plaintext: string, key: Buffer): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const encrypted = Buffer.concat([cipher.update(Buffer.from(plaintext, 'utf8')), cipher.final()])
  return [
    VERSION,
    iv.toString('base64url'),
    cipher.getAuthTag().toString('base64url'),
    encrypted.toString('base64url'),
  ].join('.')
}

async function main(): Promise<void> {
  const write = process.argv.includes('--write')
  const oldKey = keyFrom('OLD')
  const newKey = keyFrom('NEW')
  if (oldKey.equals(newKey)) {
    console.log('Old and new keys are the same; nothing to do.')
    return
  }

  const rows = await db.integrationConnection.findMany({
    where: { credentials: { not: null } },
    select: { id: true, connectorId: true, organizationId: true, credentials: true },
  })

  let resealed = 0
  let unreadable = 0
  for (const row of rows) {
    if (!row.credentials) continue
    let plaintext: string
    try {
      plaintext = open(row.credentials, oldKey)
    } catch {
      console.error(
        `cannot open ${row.connectorId} connection ${row.id} of ${row.organizationId} with the old key; left as is`
      )
      unreadable++
      continue
    }
    if (write) {
      await db.integrationConnection.update({
        where: { id: row.id },
        data: { credentials: seal(plaintext, newKey) },
      })
    }
    resealed++
  }

  console.log(
    `${write ? 'Re-sealed' : 'Would re-seal'} ${resealed} of ${rows.length} connections; ${unreadable} unreadable with the old key.`
  )
  if (!write) console.log('Run again with --write to make the changes.')
  if (unreadable > 0) process.exitCode = 1
}

main()
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(() => db.$disconnect())
