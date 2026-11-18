'use server'

import { getLocale } from 'next-intl/server'
import { PermissionAction, PermissionSubject } from '@/lib/permissions'
import { withAuth } from '@/lib/with-auth'
import { loadOemCodePage } from '../Lib/page.server'
import { oemCodeSchema } from '../Schema/faultCodeSchema'

/**
 * A make's own code (BMW's 2A82) for its page and the sheet beside a job, as
 * every code page reads it: its meanings, the jobs here and, on the page,
 * shared fixes. The meanings fitting the job's car come first.
 */
export async function getOemFaultCode(input: unknown) {
  return withAuth(
    async ({ organizationId }) => {
      const data = oemCodeSchema.parse(input)
      return loadOemCodePage(
        organizationId,
        data.source,
        data.code,
        data.vehicleId,
        await getLocale(),
        {
          fixes: data.fixes === true,
        }
      )
    },
    {
      requiredPermissions: [{ action: PermissionAction.READ, subject: PermissionSubject.VEHICLES }],
    }
  )
}
