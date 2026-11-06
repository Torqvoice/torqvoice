'use server'

import { getLocale } from 'next-intl/server'
import { z } from 'zod'
import { PermissionAction, PermissionSubject } from '@/lib/permissions'
import { withAuth } from '@/lib/with-auth'
import {
  looksLikeFaultCode,
  looksLikeOemCode,
  normalizeFaultCode,
  normalizeOemCode,
} from '../Lib/codes'
import { jobsWithCode, searchOemCodes, searchServiceCodes } from '../Lib/service.server'

const querySchema = z.string().max(100)

/**
 * The search palette's fault code groups, asked for beside the normal search
 * so a slow answer from the code service never holds up vehicles, customers
 * or jobs. Only a query that looks like a code goes anywhere: the service's
 * codes for it (an OBD code, or a make's own like BMW's 283700), and for a
 * whole code the jobs here where it was read, which are the workshop's own
 * data and come back with or without the service.
 */
export async function searchFaultCodes(query: unknown) {
  return withAuth(
    async ({ organizationId }) => {
      const q = querySchema.parse(query).trim()
      const locale = await getLocale()
      if (looksLikeFaultCode(q)) {
        const code = normalizeFaultCode(q)
        const [service, jobs] = await Promise.all([
          searchServiceCodes(organizationId, q, locale),
          code ? jobsWithCode(organizationId, code, 6) : Promise.resolve([]),
        ])
        return { query: q, available: service.available, codes: service.hits, oem: [], jobs }
      }
      const oemCode = looksLikeOemCode(q) ? normalizeOemCode(q) : null
      if (oemCode) {
        const [oem, jobs] = await Promise.all([
          searchOemCodes(organizationId, q, locale),
          jobsWithCode(organizationId, oemCode, 6),
        ])
        return { query: q, available: true, codes: [], oem, jobs }
      }
      return { query: q, available: false, codes: [], oem: [], jobs: [] }
    },
    {
      requiredPermissions: [{ action: PermissionAction.READ, subject: PermissionSubject.VEHICLES }],
    }
  )
}
