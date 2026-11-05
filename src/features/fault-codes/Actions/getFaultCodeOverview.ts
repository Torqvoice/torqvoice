'use server'

import { getLocale } from 'next-intl/server'
import { z } from 'zod'
import { getManifest } from '@/integrations/registry'
import { PermissionAction, PermissionSubject } from '@/lib/permissions'
import { withAuth } from '@/lib/with-auth'
import { recentCodes } from '../Lib/recent.server'
import { faultCodesConnected, searchServiceCodes } from '../Lib/service.server'

const inputSchema = z.object({ query: z.string().trim().max(100).default('') })

/**
 * The fault code page: whether the code service is connected, what it
 * finds for words like "lean bank 1", and the codes read lately in this
 * workshop, which come from its own jobs and show either way.
 */
export async function getFaultCodeOverview(input: unknown) {
  return withAuth(
    async ({ organizationId }) => {
      const { query } = inputSchema.parse(input)
      const [connected, recent] = await Promise.all([
        faultCodesConnected(organizationId),
        recentCodes(organizationId),
      ])
      const search =
        connected && query
          ? await searchServiceCodes(organizationId, query, await getLocale(), 25)
          : { available: connected, hits: [] }
      return {
        connected,
        connectable: getManifest('torqvoice-codes') !== null,
        query,
        available: search.available,
        hits: search.hits,
        recent,
      }
    },
    {
      requiredPermissions: [{ action: PermissionAction.READ, subject: PermissionSubject.VEHICLES }],
    }
  )
}
