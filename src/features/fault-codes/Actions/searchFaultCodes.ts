'use server'

import { getLocale } from 'next-intl/server'
import { z } from 'zod'
import { PermissionAction, PermissionSubject } from '@/lib/permissions'
import { withAuth } from '@/lib/with-auth'
import { looksLikeFaultCode, normalizeFaultCode } from '../Lib/codes'
import { jobsWithCode, searchServiceCodes } from '../Lib/service.server'

const querySchema = z.string().max(100)

/**
 * The search palette's fault code groups, asked for beside the normal search
 * so a slow answer from the code service never holds up vehicles, customers
 * or jobs. Only a query that looks like a code goes anywhere: the service's
 * codes for it, and for a whole code the jobs here where it was read, which
 * are the workshop's own data and come back with or without the service.
 */
export async function searchFaultCodes(query: unknown) {
  return withAuth(
    async ({ organizationId }) => {
      const q = querySchema.parse(query).trim()
      if (!looksLikeFaultCode(q)) {
        return { query: q, available: false, codes: [], jobs: [] }
      }
      const code = normalizeFaultCode(q)
      const [service, jobs] = await Promise.all([
        searchServiceCodes(organizationId, q, await getLocale()),
        code ? jobsWithCode(organizationId, code, 6) : Promise.resolve([]),
      ])
      return { query: q, available: service.available, codes: service.hits, jobs }
    },
    {
      requiredPermissions: [{ action: PermissionAction.READ, subject: PermissionSubject.VEHICLES }],
    }
  )
}
