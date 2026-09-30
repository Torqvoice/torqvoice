import type { Metadata } from 'next'
import { db } from '@/lib/db'
import {
  isInspectionHandoffToken,
  verifyInspectionHandoffToken,
  verifyPhotoHandoffToken,
} from '@/lib/photo-handoff'
import { SETTING_KEYS } from '@/features/settings/Schema/settingsSchema'
import { isDefect } from '@/features/inspections/Lib/conditions'
import { PhotoHandoffClient } from './photo-handoff-client'
import { InspectionHandoffClient } from './inspection-handoff-client'

export const metadata: Metadata = { robots: { index: false, follow: false } }
export const dynamic = 'force-dynamic'

/**
 * The page a phone opens from a work order's "Add from phone" code, whether
 * the phone is a mechanic's or the customer's. Nobody is signed in here: the
 * signed link is the permission. The page shows whose workshop it is and which
 * car, and nothing of the job's contents: not the concern the photos go under,
 * not the customer, not a price. See lib/photo-handoff.ts.
 */
export default async function PhotoHandoffPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>
  searchParams: Promise<{ item?: string }>
}) {
  const { token } = await params
  if (isInspectionHandoffToken(token)) {
    const { item } = await searchParams
    return (
      <InspectionHandoffPage token={token} focusItemId={typeof item === 'string' ? item : null} />
    )
  }
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

async function workshopBrand(organizationId: string) {
  const [workshop, logo] = await Promise.all([
    db.organization.findUnique({ where: { id: organizationId }, select: { name: true } }),
    db.appSetting.findUnique({
      where: { organizationId_key: { organizationId, key: SETTING_KEYS.COMPANY_LOGO } },
      select: { value: true },
    }),
  ])
  return workshop
    ? { name: workshop.name, logoUrl: logo?.value ? `/api/public/logo/${organizationId}` : null }
    : null
}

/**
 * The same page for an inspection's code. The phone sees the car and the
 * checklist's names, so whoever holds it can put a photo on the right check,
 * and which checks were graded as defects, because those are the photos the
 * customer is waiting for. It sees no notes, no customer and no price.
 */
async function InspectionHandoffPage({
  token,
  focusItemId,
}: {
  token: string
  /** The check the desk showed the code for, so the phone opens on it. */
  focusItemId: string | null
}) {
  const check = verifyInspectionHandoffToken(token)
  if (!check.ok) {
    return <InspectionHandoffClient token={token} brand={null} problem={check.reason} />
  }
  const { organizationId, inspectionId } = check.handoff
  const [brand, inspection] = await Promise.all([
    workshopBrand(organizationId),
    db.inspection.findFirst({
      where: { id: inspectionId, organizationId },
      select: {
        status: true,
        template: { select: { name: true } },
        vehicle: { select: { licensePlate: true, make: true, model: true } },
        items: {
          orderBy: { sortOrder: 'asc' },
          select: {
            id: true,
            name: true,
            code: true,
            section: true,
            condition: true,
            photoRequired: true,
            imageUrls: true,
          },
        },
      },
    }),
  ])
  if (!inspection) {
    return <InspectionHandoffClient token={token} brand={brand} problem="invalid" />
  }

  return (
    <InspectionHandoffClient
      token={token}
      brand={brand}
      inspection={{
        completed: inspection.status === 'completed',
        name: inspection.template.name,
        plate: inspection.vehicle?.licensePlate ?? null,
        vehicle: inspection.vehicle
          ? `${inspection.vehicle.make} ${inspection.vehicle.model}`
          : null,
        items: inspection.items.map((item) => ({
          id: item.id,
          name: item.name,
          code: item.code,
          section: item.section,
          condition: item.condition,
          defect: isDefect(item.condition),
          photoRequired: item.photoRequired,
          photoCount: item.imageUrls.length,
        })),
      }}
      focusItemId={focusItemId}
    />
  )
}
