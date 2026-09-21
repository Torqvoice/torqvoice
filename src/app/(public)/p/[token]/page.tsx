import type { Metadata } from 'next'
import { db } from '@/lib/db'
import { verifyPhotoHandoffToken } from '@/lib/photo-handoff'
import { SETTING_KEYS } from '@/features/settings/Schema/settingsSchema'
import { PhotoHandoffClient } from './photo-handoff-client'

export const metadata: Metadata = { robots: { index: false, follow: false } }
export const dynamic = 'force-dynamic'

/**
 * The page a phone opens from a work order's "Add from phone" code, whether
 * the phone is a mechanic's or the customer's. Nobody is signed in here: the
 * signed link is the permission. The page shows whose workshop it is and which
 * car, and nothing of the job's contents: not the concern the photos go under,
 * not the customer, not a price. See lib/photo-handoff.ts.
 */
export default async function PhotoHandoffPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const check = verifyPhotoHandoffToken(token)
  const organizationId = check.ok ? check.handoff.organizationId : null

  const [workshop, logo, job] = organizationId
    ? await Promise.all([
        db.organization.findUnique({ where: { id: organizationId }, select: { name: true } }),
        db.appSetting.findUnique({
          where: { organizationId_key: { organizationId, key: SETTING_KEYS.COMPANY_LOGO } },
          select: { value: true },
        }),
        check.ok
          ? db.serviceRecord.findFirst({
              where: { id: check.handoff.serviceRecordId, organizationId },
              select: {
                invoiceNumber: true,
                vehicle: { select: { licensePlate: true, make: true, model: true } },
              },
            })
          : null,
      ])
    : [null, null, null]

  const brand = workshop
    ? {
        name: workshop.name,
        logoUrl: logo?.value ? `/api/public/logo/${organizationId}` : null,
      }
    : null

  if (!check.ok || !job) {
    return (
      <PhotoHandoffClient
        token={token}
        brand={brand}
        problem={check.ok ? 'invalid' : check.reason}
      />
    )
  }

  return (
    <PhotoHandoffClient
      token={token}
      brand={brand}
      purpose={check.handoff.purpose}
      job={{
        number: job.invoiceNumber?.trim() || null,
        plate: job.vehicle?.licensePlate ?? null,
        vehicle: job.vehicle ? `${job.vehicle.make} ${job.vehicle.model}` : null,
      }}
    />
  )
}
