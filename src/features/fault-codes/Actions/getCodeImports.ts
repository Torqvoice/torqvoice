'use server'

import { PermissionAction, PermissionSubject } from '@/lib/permissions'
import { withAuth } from '@/lib/with-auth'
import { codeImportsFor } from '../Lib/service.server'

/** This workshop's code imports, newest first, with how many codes were published. */
export async function getCodeImports() {
  return withAuth(async ({ organizationId }) => codeImportsFor(organizationId), {
    requiredPermissions: [{ action: PermissionAction.READ, subject: PermissionSubject.VEHICLES }],
  })
}
