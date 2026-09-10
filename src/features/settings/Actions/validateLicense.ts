'use server'

import { withAuth } from '@/lib/with-auth'
import { PermissionAction, PermissionSubject } from '@/lib/permissions'
import { revalidatePath } from 'next/cache'
import { demoGuard } from '@/lib/demo'
import { db } from '@/lib/db'
import { revalidateLicense } from '@/lib/license/revalidate'
import type { LicenseTokenStatus } from '@/lib/license/token'

export type ValidateLicenseResult = {
  /** what the feature gate now sees */
  status: LicenseTokenStatus
  valid: boolean
  plan: string
  /** false when torqvoice.com could not be reached; the stored token is untouched */
  reachable: boolean
  /** torqvoice.com's reason when it answered "not valid" */
  reason?: string
}

export async function validateLicense(licenseKey: string) {
  return withAuth(
    async (ctx): Promise<ValidateLicenseResult> => {
      // The demo runs on our licence, not the visitor's, and activating one
      // here would move a real customer's plan onto a shared instance.
      demoGuard()
      const key = licenseKey.trim()
      if (!key) {
        throw new Error('License key is required')
      }

      const { remote, verification } = await revalidateLicense(ctx.organizationId, key, ctx.userId)

      // Let the expiry banner warn again on the next cycle.
      await db.appSetting.deleteMany({
        where: { organizationId: ctx.organizationId, key: 'license.expiryDismissed' },
      })

      revalidatePath('/settings')

      return {
        status: verification.status,
        valid: verification.status === 'valid',
        plan: verification.payload?.plan ?? remote.plan,
        reachable: remote.reachable,
        reason: remote.error,
      }
    },
    {
      requiredPermissions: [
        { action: PermissionAction.UPDATE, subject: PermissionSubject.SETTINGS },
      ],
    }
  )
}
