'use server'

import { z } from 'zod'
import { PermissionAction, PermissionSubject } from '@/lib/permissions'
import { SHARE_KINDS } from '@/lib/share-expiry'
import { type ActionResult, withAuth } from '@/lib/with-auth'
import { SHARE_KIND_SUBJECT } from '../Lib/shareLinkDocument.server'
import { listShareLinks, type ShareLinkPage } from '../Lib/listShareLinks.server'

const querySchema = z.object({
  status: z.enum(['active', 'expired', 'all']).catch('active'),
  kind: z.enum(['all', 'invoice', 'quote', 'inspection', 'statusReport']).catch('all'),
  search: z.string().max(200).catch(''),
  page: z.coerce.number().int().min(1).catch(1),
  pageSize: z.coerce.number().int().min(1).max(100).catch(25),
})

/** One page of the workshop's share links, for Settings. */
export async function getShareLinksPage(input: unknown): Promise<ActionResult<ShareLinkPage>> {
  const query = querySchema.parse(input ?? {})
  return withAuth<ShareLinkPage>(
    async ({ organizationId }) => listShareLinks(organizationId, query),
    {
      // Each row carries the link itself, which opens the document. Reading
      // the list therefore takes the right to read every kind it holds.
      requiredPermissions: [
        { action: PermissionAction.READ, subject: PermissionSubject.SETTINGS },
        ...SHARE_KINDS.map((kind) => ({
          action: PermissionAction.READ,
          subject: SHARE_KIND_SUBJECT[kind],
        })),
      ],
    }
  )
}
