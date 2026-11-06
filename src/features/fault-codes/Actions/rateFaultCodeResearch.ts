'use server'

import { PermissionAction, PermissionSubject } from '@/lib/permissions'
import { withAuth } from '@/lib/with-auth'
import { rateResearch } from '../Lib/service.server'
import { rateResearchSchema } from '../Schema/faultCodeSchema'

/** "Did this fix it?" on a researched fix: once per workshop, a second answer replaces it. */
export async function rateFaultCodeResearch(input: unknown) {
  return withAuth(
    async ({ organizationId }) => {
      const data = rateResearchSchema.parse(input)
      return { rated: await rateResearch(organizationId, data.id, data.helpful) }
    },
    {
      requiredPermissions: [{ action: PermissionAction.READ, subject: PermissionSubject.VEHICLES }],
    }
  )
}
