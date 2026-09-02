/**
 * Moves every existing messaging setup into a connection, in one pass.
 *
 * The app adopts a setup on its own the first time a workshop sends on a
 * channel, so this script is not required for correctness — it just means the
 * catalog shows Twilio, WhatsApp, Telegram and mail as connected from the
 * moment the deploy lands, rather than the first time each workshop sends
 * something. Nothing is deleted: the old `AppSetting` rows stay exactly where
 * they are, so this can be run before a rollback is ruled out.
 *
 * Running it twice is safe. A workshop that already has a connection for a
 * channel, or that has already been adopted, is left alone.
 *
 * It must run with the same INTEGRATIONS_ENCRYPTION_KEY the app uses: a
 * connection sealed under any other key is unreadable by the app, and the
 * adoption marker then stops the app from adopting the rows again. The script
 * therefore refuses to run on a derived key and prints a fingerprint of the
 * key it holds, to compare with the app container's.
 *
 *   docker run --rm --network proxy --env-file /path/to/prod/.env \
 *     -v $(pwd):/src -w /src node:22-alpine sh -c \
 *     'npm ci --ignore-scripts && npx prisma generate && \
 *      npx tsx scripts/adopt-messaging-integrations.ts'           # report only
 *   ... npx tsx scripts/adopt-messaging-integrations.ts --write   # adopt
 */

import { createHash } from 'node:crypto'
import { adoptedMarkerKey, channelSetup, legacySetupFor } from '@/features/integrations/Lib/messaging'
import type { MessagingChannel } from '@/integrations/messaging/catalog'
import { legacyKeysForChannel, providersForChannel } from '@/integrations/messaging/catalog'
import { db } from '@/lib/db'

const CHANNELS: MessagingChannel[] = ['sms', 'whatsapp', 'telegram', 'email']

function requireVaultKey(): void {
  const key = process.env.INTEGRATIONS_ENCRYPTION_KEY?.trim()
  if (!key) {
    console.error(
      'INTEGRATIONS_ENCRYPTION_KEY is not set. Run this with the app\'s own environment ' +
        '(for example --env-file with the production .env) so connections are sealed with ' +
        'the key the app reads them with. Refusing to continue.'
    )
    process.exit(2)
  }
  const fingerprint = createHash('sha256').update(key).digest('hex').slice(0, 8)
  console.log(
    `Sealing with INTEGRATIONS_ENCRYPTION_KEY fingerprint ${fingerprint}. ` +
      'Compare: docker exec torqvoice-app sh -c \'printf %s "$INTEGRATIONS_ENCRYPTION_KEY" | sha256sum | cut -c1-8\''
  )
}

async function organizationsWithLegacySetup(channel: MessagingChannel): Promise<string[]> {
  const rows = await db.appSetting.findMany({
    where: { key: { in: legacyKeysForChannel(channel) }, NOT: { value: '' } },
    select: { organizationId: true },
    distinct: ['organizationId'],
  })
  return rows.map((r) => r.organizationId).filter((id): id is string => Boolean(id))
}

async function main(): Promise<void> {
  const write = process.argv.includes('--write')
  requireVaultKey()

  let adopted = 0
  let alreadyConnected = 0
  let alreadyAdopted = 0
  let incomplete = 0
  let failed = 0

  for (const channel of CHANNELS) {
    const connectorIds = providersForChannel(channel).map((p) => p.id)
    const organizationIds = await organizationsWithLegacySetup(channel)

    for (const organizationId of organizationIds) {
      const [existing, marker] = await Promise.all([
        db.integrationConnection.findFirst({
          where: { organizationId, connectorId: { in: connectorIds } },
          select: { connectorId: true, status: true },
        }),
        db.appSetting.findUnique({
          where: { organizationId_key: { organizationId, key: adoptedMarkerKey(channel) } },
          select: { value: true },
        }),
      ])
      if (existing) {
        alreadyConnected++
        continue
      }
      if (marker) {
        // Adopted and later disconnected by the workshop: that is its choice.
        alreadyAdopted++
        continue
      }

      // The same read the app does, without writing, so the report says
      // exactly what --write would do.
      const { setup } = await legacySetupFor(organizationId, channel)
      if (!setup) {
        console.log(
          `incomplete ${channel} for ${organizationId}: no vendor named, or its keys are missing`
        )
        incomplete++
        continue
      }

      if (!write) {
        console.log(`would adopt ${channel} -> ${setup.provider.id} for ${organizationId}`)
        adopted++
        continue
      }

      try {
        const live = await channelSetup(organizationId, channel)
        if (live) {
          console.log(`adopted ${channel} -> ${live.connectorId} for ${organizationId}`)
          adopted++
        } else {
          console.log(`skipped ${channel} for ${organizationId}: adoption returned nothing`)
          incomplete++
        }
      } catch (err) {
        console.error(`failed ${channel} for ${organizationId}:`, err)
        failed++
      }
    }
  }

  console.log(
    `\n${write ? 'Adopted' : 'Would adopt'} ${adopted}, already connected ${alreadyConnected}, ` +
      `previously adopted ${alreadyAdopted}, incomplete ${incomplete}, failed ${failed}.`
  )
  if (!write) console.log('Run again with --write to make the changes.')
  if (failed > 0) process.exitCode = 1
}

main()
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(() => db.$disconnect())
