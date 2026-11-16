'use server'

import { z } from 'zod'
import { PermissionAction, PermissionSubject } from '@/lib/permissions'
import { type ActionResult, withAuth } from '@/lib/with-auth'
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
      requiredPermissions: [{ action: PermissionAction.READ, subject: PermissionSubject.SETTINGS }],
    }
  )
}
