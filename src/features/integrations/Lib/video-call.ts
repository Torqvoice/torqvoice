import { db } from '@/lib/db'

/** The video call link a connection attached to a work order, if any. */
export async function serviceVideoLink(
  organizationId: string,
  serviceRecordId: string
): Promise<{ url: string; provider: string } | null> {
  const links = await db.integrationLink.findMany({
    where: {
      entityType: 'ServiceRecord',
      entityId: serviceRecordId,
      connection: { organizationId, status: { in: ['active', 'error'] } },
    },
    select: { metadata: true, connection: { select: { connectorId: true } } },
  })
  for (const l of links) {
    const meta = (l.metadata as Record<string, unknown> | null) ?? {}
    if (typeof meta.meetingUrl !== 'string') continue
    return {
      url: meta.meetingUrl,
      provider: String(meta.meetingProvider ?? l.connection.connectorId),
    }
  }
  return null
}

/**
 * The text a customer receives for a video call. A note the sender wrote
 * goes first, the join line always follows, so the link is never lost to an
 * edit. Without a note, the stock invitation names the customer, the car
 * and the time.
 */
export function videoCallMessage(input: {
  customMessage: string | undefined
  invitation: string
  joinLine: string
}): string {
  const custom = input.customMessage?.trim()
  return custom ? `${custom}\n\n${input.joinLine}` : input.invitation
}
