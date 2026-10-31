'use server'

import { withAuth } from '@/lib/with-auth'
import { PermissionAction, PermissionSubject } from '@/lib/permissions'
import { revalidatePath } from 'next/cache'
import { demoGuard } from '@/lib/demo'
import { db } from '@/lib/db'
import { revalidateLicense, storePerpetualLicense } from '@/lib/license/revalidate'
import {
  isPerpetualLicenseToken,
  type LicenseTokenKind,
  type LicenseTokenStatus,
  type PerpetualLicensee,
} from '@/lib/license/token'

export type ValidateLicenseResult = {
  /** what the feature gate now sees */
  status: LicenseTokenStatus
  valid: boolean
  plan: string
  /** false when torqvoice.com could not be reached; the stored token is untouched */
  reachable: boolean
  /** torqvoice.com's reason when it answered "not valid" */
  reason?: string
  /** a pasted `tvp1.` token is a perpetual licence; anything else is a key */
  kind: LicenseTokenKind
  /** who a perpetual licence was issued to, so the page can show a mismatch */
  licensee: PerpetualLicensee | null
}

// Let the expiry banner warn again on the next cycle.
function clearExpiryDismissal(organizationId: string) {
  return db.appSetting.deleteMany({
    where: { organizationId, key: 'license.expiryDismissed' },
  })
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

      // A perpetual token is verified here and now, offline. Sending it to
      // torqvoice.com as a key would only come back "not valid".
      if (isPerpetualLicenseToken(key)) {
        const verification = await storePerpetualLicense(ctx.organizationId, key, ctx.userId)
        await clearExpiryDismissal(ctx.organizationId)
        revalidatePath('/settings')
        return {
          status: verification.status,
          valid: verification.status === 'valid',
          plan: verification.payload?.plan ?? 'free',
          reachable: true,
          kind: 'perpetual',
          licensee: verification.licensee,
        }
      }

      const { remote, verification } = await revalidateLicense(ctx.organizationId, key, ctx.userId)
      await clearExpiryDismissal(ctx.organizationId)
      revalidatePath('/settings')

      return {
        status: verification.status,
        valid: verification.status === 'valid',
        plan: verification.payload?.plan ?? remote.plan,
        reachable: remote.reachable,
        reason: remote.error,
        kind: 'subscription',
        licensee: null,
      }
    },
    {
      requiredPermissions: [
        { action: PermissionAction.UPDATE, subject: PermissionSubject.SETTINGS },
      ],
    }
  )
}
