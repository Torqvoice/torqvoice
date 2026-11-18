'use server'

import { PermissionAction, PermissionSubject } from '@/lib/permissions'
import { withAuth } from '@/lib/with-auth'
import { reportStates } from '../Lib/service.server'
import { faultCodeReportsSchema } from '../Schema/faultCodeSchema'

/** What this workshop reported about these codes' meanings, and where each report stands. */
export async function getFaultCodeReports(input: unknown) {
  return withAuth(
    async ({ organizationId }) => {
      const { codes } = faultCodeReportsSchema.parse(input)
      return reportStates(organizationId, codes)
    },
    {
      requiredPermissions: [{ action: PermissionAction.READ, subject: PermissionSubject.VEHICLES }],
    }
  )
}
