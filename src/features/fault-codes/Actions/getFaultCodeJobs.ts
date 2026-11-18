'use server'

import { PermissionAction, PermissionSubject } from '@/lib/permissions'
import { withAuth } from '@/lib/with-auth'
import { jobsWithCode } from '../Lib/service.server'
import { faultCodeJobsSchema } from '../Schema/faultCodeSchema'

/** Jobs in this workshop where the code was read, newest first. */
export async function getFaultCodeJobs(input: unknown) {
  return withAuth(
    async ({ organizationId }) => {
      const { code } = faultCodeJobsSchema.parse(input)
      return jobsWithCode(organizationId, code)
    },
    {
      requiredPermissions: [{ action: PermissionAction.READ, subject: PermissionSubject.VEHICLES }],
    }
  )
}
