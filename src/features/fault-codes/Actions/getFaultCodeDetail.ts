'use server'

import { getLocale } from 'next-intl/server'
import { PermissionAction, PermissionSubject } from '@/lib/permissions'
import { withAuth } from '@/lib/with-auth'
import { loadFaultCodePage } from '../Lib/page.server'
import { faultCodeDetailSchema } from '../Schema/faultCodeSchema'

/**
 * Everything the code sheet shows for one code: the meaning with its
 * description and causes, the jobs here where it was read, and what this
 * workshop reported about it. The code's own page asks for the shared fixes
 * too.
 */
export async function getFaultCodeDetail(input: unknown) {
  return withAuth(
    async ({ organizationId }) => {
      const data = faultCodeDetailSchema.parse(input)
      return loadFaultCodePage(organizationId, data.code, data.vehicleId, await getLocale(), {
        fixes: data.fixes === true,
      })
    },
    {
      requiredPermissions: [{ action: PermissionAction.READ, subject: PermissionSubject.VEHICLES }],
    }
  )
}
