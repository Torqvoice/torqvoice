/**
 * App events reaching connectors.
 *
 * The audit logger already turns every meaningful action into an event name
 * such as service.update, and the webhook dispatcher fans those out to
 * subscribers. This is the same fan-out for connectors: each active
 * connection whose manifest subscribes to the event gets a job with the
 * entity id. Nothing runs inline; the cron picks the job up within a minute.
 */

import { db } from '@/lib/db'
import { getManifest } from '@/integrations/registry'
import { enqueueJob } from './jobs'

export interface IntegrationEventInput {
  event: string
  organizationId: string
  entityId?: string | null
  entity?: string | null
}

export async function notifyIntegrations(input: IntegrationEventInput): Promise<void> {
  if (!input.event || !input.organizationId) return
  let connections: { id: string; connectorId: string }[]
  try {
    connections = await db.integrationConnection.findMany({
      where: { organizationId: input.organizationId, status: { in: ['active', 'error'] } },
      select: { id: true, connectorId: true },
    })
  } catch (err) {
    console.error('[integrations] failed to load connections:', err)
    return
  }
  for (const c of connections) {
    const manifest = getManifest(c.connectorId)
    for (const sub of manifest?.subscriptions ?? []) {
      if (sub.event !== input.event) continue
      const entityId = input.entityId ?? null
      await enqueueJob({
        connectionId: c.id,
        organizationId: input.organizationId,
        kind: sub.job,
        payload: { entityId, entity: input.entity ?? null, event: input.event },
        idempotencyKey: entityId ? `${sub.job}:${entityId}` : undefined,
      })
    }
  }
}
