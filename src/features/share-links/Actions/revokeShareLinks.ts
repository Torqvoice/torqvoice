'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { auditDetails } from '@/lib/audit'
import { db } from '@/lib/db'
import { PermissionAction } from '@/lib/permissions'
import { FRESH_SHARE_LINK, SHARE_KINDS } from '@/lib/share-expiry'
import { type ActionResult, withAuth } from '@/lib/with-auth'
import { SHARE_KIND_SUBJECT } from '../Lib/shareLinkDocument.server'
import { MAX_REVOKE_LINKS, shareLinkRefSchema } from '../Schema/shareLinkSchema'

const inputSchema = z.object({ links: z.array(shareLinkRefSchema).min(1).max(MAX_REVOKE_LINKS) })

/**
 * Removes several share links at once, from the list in Settings. Each link
 * stops working for everyone who holds it, exactly as removing it on its own
 * document does; sharing the document again makes a new link.
 *
 * It takes the permission to edit every kind of document among the links, so
 * somebody who may not edit quotes cannot remove a quote's link by ticking it
 * next to an invoice.
 */
export async function revokeShareLinks(input: unknown): Promise<ActionResult<{ removed: number }>> {
  const { links } = inputSchema.parse(input)
  const ids = (kind: (typeof SHARE_KINDS)[number]) =>
    links.filter((l) => l.kind === kind).map((l) => l.id)
  const kinds = SHARE_KINDS.filter((kind) => ids(kind).length > 0)

  return withAuth<{ removed: number }>(
    async ({ organizationId }) => {
      const cleared = { publicToken: null, sharedAt: null, ...FRESH_SHARE_LINK }
      const viewed = { viewCount: 0, lastViewedAt: null }
      const shared = (kind: (typeof SHARE_KINDS)[number]) => ({
        id: { in: ids(kind) },
        organizationId,
        publicToken: { not: null },
      })

      const [invoices, quotes, inspections] = await db.$transaction([
        db.serviceRecord.updateMany({ where: shared('invoice'), data: { ...cleared, ...viewed } }),
        db.quote.updateMany({ where: shared('quote'), data: { ...cleared, ...viewed } }),
        db.inspection.updateMany({ where: shared('inspection'), data: cleared }),
      ])

      // The documents' own pages show the link card, wherever they are.
      revalidatePath('/', 'layout')
      return { removed: invoices.count + quotes.count + inspections.count }
    },
    {
      requiredPermissions: kinds.map((kind) => ({
        action: PermissionAction.UPDATE,
        subject: SHARE_KIND_SUBJECT[kind],
      })),
      audit: ({ result }) =>
        result.removed > 0
          ? {
              action: 'shareLink.revoke',
              entity: 'ShareLink',
              details: auditDetails('share_link_revoke_bulk', { count: result.removed }),
              metadata: { links },
            }
          : null,
    }
  )
}
