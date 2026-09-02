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
 * channel is left alone.
 *
 *   npx tsx scripts/adopt-messaging-integrations.ts          # report only
 *   npx tsx scripts/adopt-messaging-integrations.ts --write  # adopt
 */

import { channelSetup } from '@/features/integrations/Lib/messaging'
import type { MessagingChannel } from '@/integrations/messaging/catalog'
import { legacyKeysForChannel, providersForChannel } from '@/integrations/messaging/catalog'
import { db } from '@/lib/db'

const CHANNELS: MessagingChannel[] = ['sms', 'whatsapp', 'telegram', 'email']

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
  let adopted = 0
  let alreadyConnected = 0
  let skipped = 0

  for (const channel of CHANNELS) {
    const connectorIds = providersForChannel(channel).map((p) => p.id)
    const organizationIds = await organizationsWithLegacySetup(channel)

    for (const organizationId of organizationIds) {
      const existing = await db.integrationConnection.findFirst({
        where: { organizationId, connectorId: { in: connectorIds } },
        select: { connectorId: true },
      })
      if (existing) {
        alreadyConnected++
        continue
      }

      if (!write) {
        console.log(`would adopt ${channel} for ${organizationId}`)
        adopted++
        continue
      }

      // The resolver is the one place that knows how to read an old setup,
      // and it writes the connection as a side effect of answering.
      const setup = await channelSetup(organizationId, channel)
      if (setup) {
        console.log(`adopted ${channel} -> ${setup.connectorId} for ${organizationId}`)
        adopted++
      } else {
        console.log(`skipped ${channel} for ${organizationId}: setup is incomplete`)
        skipped++
      }
    }
  }

  console.log(
    `\n${write ? 'Adopted' : 'Would adopt'} ${adopted}, already connected ${alreadyConnected}, incomplete ${skipped}.`
  )
  if (!write) console.log('Run again with --write to make the changes.')
}

main()
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(() => db.$disconnect())
