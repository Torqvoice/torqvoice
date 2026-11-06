'use server'

import { getLocale } from 'next-intl/server'
import { resolveDocumentLocale } from '@/i18n/locale-from-request'
import { PermissionAction, PermissionSubject } from '@/lib/permissions'
import { withAuth } from '@/lib/with-auth'
import { normalizeFaultCode, normalizeOemCode } from '../Lib/codes'
import { lookupMeanings, vehicleForCodes } from '../Lib/service.server'
import { lookupFaultCodesSchema } from '../Schema/faultCodeSchema'

/**
 * What each code means on the job's vehicle, for codes being typed or
 * pasted. Text that is not a code is left out. `available` is false when the
 * service did not answer; the workshop's own meanings come back either way.
 */
export async function lookupFaultCodes(input: unknown) {
  return withAuth(
    async ({ organizationId }) => {
      const data = lookupFaultCodesSchema.parse(input)
      const codes = data.codes
        .map((c) => normalizeFaultCode(c) ?? normalizeOemCode(c))
        .filter((c): c is string => c !== null)
      const [vehicle, locale] = await Promise.all([
        vehicleForCodes(organizationId, data.vehicleId),
        data.language === 'document' ? resolveDocumentLocale(organizationId) : getLocale(),
      ])
      return lookupMeanings(organizationId, codes, vehicle, locale)
    },
    {
      requiredPermissions: [{ action: PermissionAction.READ, subject: PermissionSubject.VEHICLES }],
    }
  )
}
