import 'server-only'
import { db } from '@/lib/db'
import { PermissionAction, PermissionSubject } from '@/lib/permissions'
import {
  isShareExpired,
  type ShareExpiry,
  type ShareExpiryRule,
  shareExpiry,
  type ShareKind,
} from '@/lib/share-expiry'
import {
  INVOICE_PAYMENT_COLUMNS,
  loadShareExpiryContext,
  SHARE_FACT_COLUMNS,
  shareFacts,
} from '@/lib/share-link.server'
import { addZonedDays, zonedDateInput } from '@/lib/timezone'
import type { ShareExpiryView } from '../Schema/shareLinkSchema'

/** Changing a link is changing its document, so it takes the document's permission. */
export const SHARE_KIND_SUBJECT: Record<ShareKind, PermissionSubject> = {
  invoice: PermissionSubject.SERVICES,
  quote: PermissionSubject.QUOTES,
  inspection: PermissionSubject.INSPECTIONS,
}

export const SHARE_KIND_ENTITY: Record<ShareKind, string> = {
  invoice: 'ServiceRecord',
  quote: 'Quote',
  inspection: 'Inspection',
}

export function shareKindPermission(kind: ShareKind, action: PermissionAction) {
  return [{ action, subject: SHARE_KIND_SUBJECT[kind] }]
}

export function toExpiryView(
  expiry: ShareExpiry,
  rule: ShareExpiryRule,
  timeZone: string,
  now: Date = new Date()
): ShareExpiryView {
  const at = expiry.kind === 'date' ? expiry.at : null
  // A date still ahead is the one to start from; otherwise a month from today.
  const start = at && at > now ? at : addZonedDays(now, 30, timeZone)
  return {
    kind: expiry.kind,
    source: expiry.source,
    at: at ? at.toISOString() : null,
    expired: isShareExpired(expiry, now),
    rule,
    dateInput: zonedDateInput(start, timeZone),
  }
}

/** Where the document's page is, to refresh it after its link changed. */
export interface ShareLinkTarget {
  id: string
  hasLink: boolean
  path: string
  expiry: ShareExpiry
  rule: ShareExpiryRule
  timeZone: string
}

/** One shared document of this workshop and where its link stands, or null. */
export async function loadShareLinkTarget(
  kind: ShareKind,
  id: string,
  organizationId: string
): Promise<ShareLinkTarget | null> {
  const context = await loadShareExpiryContext(organizationId)
  const rule = context.rules[kind]
  const where = { id, organizationId }

  if (kind === 'invoice') {
    const row = await db.serviceRecord.findFirst({
      where,
      select: {
        id: true,
        publicToken: true,
        vehicleId: true,
        ...SHARE_FACT_COLUMNS,
        ...INVOICE_PAYMENT_COLUMNS,
      },
    })
    if (!row) return null
    return {
      id: row.id,
      hasLink: Boolean(row.publicToken),
      path: row.vehicleId ? `/vehicles/${row.vehicleId}/service/${row.id}` : `/sales/${row.id}`,
      expiry: shareExpiry(shareFacts(row, row), rule, context.timeZone),
      rule,
      timeZone: context.timeZone,
    }
  }
  if (kind === 'quote') {
    const row = await db.quote.findFirst({
      where,
      select: { id: true, publicToken: true, ...SHARE_FACT_COLUMNS },
    })
    if (!row) return null
    return {
      id: row.id,
      hasLink: Boolean(row.publicToken),
      path: `/quotes/${row.id}`,
      expiry: shareExpiry(shareFacts(row), rule, context.timeZone),
      rule,
      timeZone: context.timeZone,
    }
  }
  const row = await db.inspection.findFirst({
    where,
    select: { id: true, publicToken: true, ...SHARE_FACT_COLUMNS },
  })
  if (!row) return null
  return {
    id: row.id,
    hasLink: Boolean(row.publicToken),
    path: `/inspections/${row.id}`,
    expiry: shareExpiry(shareFacts(row), rule, context.timeZone),
    rule,
    timeZone: context.timeZone,
  }
}

/** Writes the three link columns on whichever table the kind names. */
export async function writeShareLinkColumns(
  kind: ShareKind,
  id: string,
  organizationId: string,
  data: { shareExpiresAt?: Date | null; shareNeverExpires?: boolean; shareRenewedAt?: Date | null }
): Promise<void> {
  const where = { id, organizationId }
  if (kind === 'invoice') await db.serviceRecord.updateMany({ where, data })
  else if (kind === 'quote') await db.quote.updateMany({ where, data })
  else await db.inspection.updateMany({ where, data })
}
