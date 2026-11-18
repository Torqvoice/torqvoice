'use server'

import { withAuth } from '@/lib/with-auth'
import { PermissionAction, PermissionSubject } from '@/lib/permissions'
import { revalidatePath } from 'next/cache'
import { demoGuard } from '@/lib/demo'
import { db } from '@/lib/db'
import {
  revalidateLicense,
  storedLicenseVerification,
  storePerpetualLicense,
} from '@/lib/license/revalidate'
import {
  isPerpetualLicenseToken,
  type LicenseTokenKind,
  type LicenseTokenStatus,
  type LicenseTokenVerification,
  type PerpetualLicensee,
} from '@/lib/license/token'

export type ValidateLicenseResult = {
  /**
   * The licence on disk after the attempt, which is what the feature gate
   * sees. A rejected key or token changes nothing, so these then describe
   * the licence that was already there.
   */
  status: LicenseTokenStatus
  valid: boolean
  plan: string
  kind: LicenseTokenKind | null
  /** who a perpetual licence was issued to, so the page can show a mismatch */
  licensee: PerpetualLicensee | null
  /** what was pasted: a `tvp1.` token is a perpetual licence; anything else is a key */
  attempted: LicenseTokenKind
  /** whether the pasted value is now the stored licence */
  accepted: boolean
  /** false when torqvoice.com could not be reached; the stored licence is untouched */
  reachable: boolean
  /** torqvoice.com's reason when it answered "not valid" */
  reason?: string
}

function fromStored(verification: LicenseTokenVerification, fallbackPlan = 'free') {
  return {
    status: verification.status,
    valid: verification.status === 'valid',
    plan: verification.payload?.plan ?? fallbackPlan,
    kind: verification.kind,
    licensee: verification.licensee,
  }
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
        const accepted = verification.status === 'valid' || verification.status === 'mismatch'
        if (!accepted) {
          // Nothing was stored, so the page keeps showing what is there.
          return {
            ...fromStored(await storedLicenseVerification(ctx.organizationId)),
            attempted: 'perpetual',
            accepted: false,
            reachable: true,
          }
        }
        await clearExpiryDismissal(ctx.organizationId)
        revalidatePath('/settings')
        return {
          ...fromStored(verification),
          attempted: 'perpetual',
          accepted: true,
          reachable: true,
        }
      }

      // The owner typed a key on purpose, so one torqvoice.com accepts may
      // replace a perpetual token; a rejected or unanswered one changes nothing.
      const { remote, verification } = await revalidateLicense(
        ctx.organizationId,
        key,
        ctx.userId,
        {
          replacePerpetual: true,
        }
      )
      const accepted = Boolean(remote?.reachable && remote.valid)
      if (accepted) {
        await clearExpiryDismissal(ctx.organizationId)
        revalidatePath('/settings')
      }

      return {
        ...fromStored(verification, remote?.plan),
        attempted: 'subscription',
        accepted,
        reachable: remote?.reachable ?? true,
        reason: remote?.error,
      }
    },
    {
      requiredPermissions: [
        { action: PermissionAction.UPDATE, subject: PermissionSubject.SETTINGS },
      ],
    }
  )
}
