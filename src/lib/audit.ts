import { db } from '@/lib/db'
import { createTranslator } from 'next-intl'
import enAudit from '../../messages/en/audit.json'

/**
 * The readable half of an audit row, as ingredients rather than a sentence.
 *
 * A finished sentence can only ever be in one language: it is composed once
 * and stored, and nothing downstream knows what its words meant. Keeping the
 * key and its values means the page can say the same thing in whichever
 * language the reader is using, years after the event.
 */
export type AuditDetails = {
  /** A key under `summary` in messages/<locale>/audit.json. */
  key: string
  params?: Record<string, string | number>
}

/**
 * Names an audit sentence and its values.
 *
 * A plain object literal would do, except where the key depends on the data:
 * two literals in a ternary widen into a union that no longer satisfies the
 * parameter record, and the error that produces points at the call site
 * rather than at the cause. This gives both branches the same type.
 */
export function auditDetails(key: string, params?: Record<string, string | number>): AuditDetails {
  return { key, params }
}

/**
 * The English sentence, rendered from the same catalogue the UI uses.
 *
 * Still written to the row, for three reasons: the audit search runs against
 * this column, webhook subscribers receive it, and rows written before this
 * existed have nothing else. Deriving it here rather than at the call site
 * means the stored English and the translated English cannot drift apart.
 */
function renderEnglish(details: AuditDetails): string | null {
  try {
    const translate = createTranslator({
      locale: 'en',
      messages: { audit: enAudit },
      namespace: 'audit.summary',
    } as Parameters<typeof createTranslator>[0]) as unknown as (
      key: string,
      values?: Record<string, string | number>
    ) => string
    return translate(details.key, details.params)
  } catch {
    // An unknown key must not lose the audit row. The key itself is a better
    // record than nothing, and the missing-key test below catches it in CI.
    return details.key
  }
}

export type AuditEvent = {
  action: string
  entity?: string
  entityId?: string
  /**
   * Pre-composed English. Only for events with nothing to translate; prefer
   * `details`, which reads in the viewer's own language.
   */
  message?: string
  details?: AuditDetails
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  metadata?: Record<string, any> | null
  ip?: string | null
  userAgent?: string | null
}

export async function logAudit(ctx: { userId: string; organizationId: string }, event: AuditEvent) {
  const message = event.details ? renderEnglish(event.details) : (event.message ?? null)
  // Carried in metadata rather than its own column, so no existing row has to
  // be migrated and an older deployment reading the same database still finds
  // everything it expects.
  const metadata = event.details
    ? { ...(event.metadata ?? {}), details: event.details }
    : event.metadata

  try {
    await db.auditLog.create({
      data: {
        userId: ctx.userId || null,
        organizationId: ctx.organizationId || null,
        action: event.action,
        entity: event.entity ?? null,
        entityId: event.entityId ?? null,
        message,
        metadata: metadata ?? undefined,
        ip: event.ip ?? null,
        userAgent: event.userAgent ?? null,
      },
    })
  } catch (err) {
    // Don't block core flows due to logging failure
    console.error('[audit] failed to write log:', err)
  }

  // Fan out to webhooks. Lazy-imported to avoid pulling Prisma webhook code
  // into modules that only need audit logging (and to break a potential
  // circular import if webhooks ever logs audits of its own).
  if (ctx.organizationId && event.action) {
    import('@/features/webhooks/Lib/dispatcher')
      .then(({ dispatchWebhookEvent }) =>
        dispatchWebhookEvent({
          event: event.action,
          organizationId: ctx.organizationId,
          entity: event.entity ?? null,
          entityId: event.entityId ?? null,
          message,
          data: metadata ?? null,
          userId: ctx.userId || null,
        })
      )
      .catch((err) => {
        console.error('[webhooks] dispatch failed:', err)
      })
    // Connected integrations hear the same events; each queues its own job.
    import('@/features/integrations/Lib/events')
      .then(({ notifyIntegrations }) =>
        notifyIntegrations({
          event: event.action,
          organizationId: ctx.organizationId,
          entity: event.entity ?? null,
          entityId: event.entityId ?? null,
        })
      )
      .catch((err) => {
        console.error('[integrations] event dispatch failed:', err)
      })
  }
}
