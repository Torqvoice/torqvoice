'use server'

import { getLocale } from 'next-intl/server'
import { z } from 'zod'
import { PermissionAction, PermissionSubject } from '@/lib/permissions'
import { withAuth } from '@/lib/with-auth'
import { searchServiceCodes } from '../Lib/service.server'

const querySchema = z.string().trim().min(2).max(100)

/**
 * Matches while typing on the fault code page: a code prefix ("P04") or
 * words ("lean bank 1"), asked of the code service. Nothing is stored; a
 * service that is down or not connected answers `available: false`.
 */
export async function suggestFaultCodes(query: unknown) {
  return withAuth(
    async ({ organizationId }) => {
      const q = querySchema.parse(query)
      const found = await searchServiceCodes(organizationId, q, await getLocale(), 12)
      return { query: q, available: found.available, hits: found.hits }
    },
    {
      requiredPermissions: [{ action: PermissionAction.READ, subject: PermissionSubject.VEHICLES }],
    }
  )
}
