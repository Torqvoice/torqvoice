'use server'

import { getLocale } from 'next-intl/server'
import { z } from 'zod'
import { PermissionAction, PermissionSubject } from '@/lib/permissions'
import { withAuth } from '@/lib/with-auth'
import { searchOemCodes, searchServiceCodes } from '../Lib/service.server'

const querySchema = z.string().trim().min(2).max(100)

/**
 * Matches while typing on the fault code page: a code prefix ("P04"), words
 * ("lean bank 1") or a make's own code (BMW's 283700), asked of the code
 * service. Nothing is stored; a
 * service that is down or not connected answers `available: false`.
 */
export async function suggestFaultCodes(query: unknown) {
  return withAuth(
    async ({ organizationId }) => {
      const q = querySchema.parse(query)
      const locale = await getLocale()
      const [found, oemHits] = await Promise.all([
        searchServiceCodes(organizationId, q, locale, 12),
        searchOemCodes(organizationId, q, locale),
      ])
      return { query: q, available: found.available, hits: found.hits, oemHits }
    },
    {
      requiredPermissions: [{ action: PermissionAction.READ, subject: PermissionSubject.VEHICLES }],
    }
  )
}
