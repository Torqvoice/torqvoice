import 'server-only'

import { createHmac, timingSafeEqual } from 'node:crypto'
import { db } from '@/lib/db'
import { enqueueJob } from '@/features/integrations/Lib/jobs'
import { openCredentials } from '@/features/integrations/Lib/vault'

/**
 * Xero's webhooks: one address and one signing key per Xero app, not per
 * connection. The platform's app (cloud) signs with the key in this
 * environment variable; a workshop that registered its own app enters that
 * app's key on its connection. Every delivery is checked against the key of
 * the app that sent it, and only the connections that app serves hear of it.
 *
 * A delivery says which record changed and nothing else, so it queues the
 * same pull the half-hourly schedule runs, which reads what changed since
 * the last one. A burst of deliveries collapses into one pull.
 */
export const PLATFORM_WEBHOOK_KEY_ENV = 'XERO_INTEGRATION_WEBHOOK_KEY'
const PULL_JOB = 'accounting.pull'

/** Xero signs the raw body: base64 of HMAC-SHA256 under the app's webhook key. */
export function signatureMatches(body: string, signature: string | null, key: string): boolean {
  if (!signature || !key) return false
  const expected = Buffer.from(createHmac('sha256', key).update(body, 'utf8').digest('base64'))
  const given = Buffer.from(signature)
  return expected.length === given.length && timingSafeEqual(expected, given)
}

interface XeroEvent {
  tenantId?: unknown
  eventCategory?: unknown
}

function credentialString(credentials: Record<string, unknown>, key: string): string | null {
  const v = credentials[key]
  return typeof v === 'string' && v.trim() ? v.trim() : null
}

/**
 * Checks one delivery and queues a pull for each connection it concerns.
 * 401 for a signature no known key produced: that is also how Xero's
 * intent-to-receive check expects a wrong signature to be answered. A
 * delivery with no events (that same check, signed correctly) gets a 200.
 */
export async function receiveXeroWebhook(
  body: string,
  signature: string | null
): Promise<{ status: 200 | 401; queued: number }> {
  const connections = await db.integrationConnection.findMany({
    where: { connectorId: 'xero', status: { in: ['active', 'error'] } },
    select: { id: true, organizationId: true, settings: true, credentials: true },
  })
  const opened = connections.map((c) => {
    let credentials: Record<string, unknown> = {}
    try {
      credentials = openCredentials(c.credentials)
    } catch {
      // A row the vault cannot open serves no deliveries.
    }
    return { ...c, credentials }
  })

  // Which app signed this: the platform's, or one workshop's own.
  const platformKey = process.env[PLATFORM_WEBHOOK_KEY_ENV]?.trim() || null
  let signer: 'platform' | string | null = null
  if (platformKey && signatureMatches(body, signature, platformKey)) {
    signer = 'platform'
  } else {
    for (const c of opened) {
      const key = credentialString(c.credentials, 'webhookKey')
      if (key && signatureMatches(body, signature, key)) {
        signer = c.id
        break
      }
    }
  }
  if (!signer) return { status: 401, queued: 0 }

  let events: XeroEvent[] = []
  try {
    const parsed = JSON.parse(body) as { events?: unknown }
    events = Array.isArray(parsed.events) ? (parsed.events as XeroEvent[]) : []
  } catch {
    return { status: 200, queued: 0 }
  }
  // A payment recorded or removed is a PAYMENT event; an invoice voided or
  // approved is an INVOICE one. Xero's own examples vary the case.
  const tenants = new Set(
    events
      .filter((e) => {
        const category = String(e.eventCategory ?? '').toUpperCase()
        return category === 'PAYMENT' || category === 'INVOICE'
      })
      .map((e) => e.tenantId)
      .filter((t): t is string => typeof t === 'string')
  )
  if (tenants.size === 0) return { status: 200, queued: 0 }

  let queued = 0
  for (const c of opened) {
    const tenantId = (c.settings as Record<string, unknown> | null)?.tenantId
    if (typeof tenantId !== 'string' || !tenants.has(tenantId)) continue
    const ownApp = Boolean(credentialString(c.credentials, 'clientId'))
    // The platform's key speaks for connections on the platform's app only;
    // a workshop's key speaks for that workshop's connection only.
    if (signer === 'platform' ? ownApp : signer !== c.id) continue
    await enqueueJob({
      connectionId: c.id,
      organizationId: c.organizationId,
      kind: PULL_JOB,
      payload: { event: 'webhook' },
      idempotencyKey: `${PULL_JOB}:webhook`,
    })
    queued++
  }
  return { status: 200, queued }
}
