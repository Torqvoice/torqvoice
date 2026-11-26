'use server'

import { z } from 'zod'
import { cursorSchema } from '@/lib/keyset'
import { PermissionAction, PermissionSubject } from '@/lib/permissions'
import { SHARE_KINDS } from '@/lib/share-expiry'
import { type ActionResult, withAuth } from '@/lib/with-auth'
import { SHARE_KIND_SUBJECT } from '../Lib/shareLinkDocument.server'
import { listShareLinkBatch, type ShareLinkBatch } from '../Lib/listShareLinks.server'

const inputSchema = z.object({
  status: z.enum(['active', 'expired', 'all']).catch('active'),
  kind: z.enum(['all', 'invoice', 'quote', 'inspection', 'statusReport']).catch('all'),
  search: z.string().max(200).catch(''),
  /** Where the last batch ended; none for the first one. */
  cursor: cursorSchema.nullable().optional(),
})

/** One batch of the workshop's share links, for Settings. */
export async function getShareLinkRows(input: {
  status?: string
  kind?: string
  search?: string
  cursor?: z.input<typeof cursorSchema> | null
}): Promise<ActionResult<ShareLinkBatch>> {
  return withAuth<ShareLinkBatch>(
    async ({ organizationId }) => listShareLinkBatch(organizationId, inputSchema.parse(input)),
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
