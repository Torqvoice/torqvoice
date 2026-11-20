import { ExternalLink } from 'lucide-react'
import { notFound } from 'next/navigation'
import { getLocale, getTranslations } from 'next-intl/server'
import { getPortalInspection } from '@/features/portal/Actions/getPortalInspection'
import { PortalInspectionResults } from '@/features/portal/Components/Detail/PortalInspectionResults'
import {
  PortalDetailLayout,
  type PortalFact,
  PortalFacts,
  PortalLoadFailed,
  PortalPageHead,
  PortalStatus,
} from '@/features/portal/Components/Detail/PortalPageParts'
import { PortalShell } from '@/features/portal/Components/PortalShell'
import {
  PortalLinkButton,
  PortalNotice,
  PortalPanel,
  PortalPlate,
  PortalSectionLabel,
} from '@/features/portal/Components/Ui'
import { portalFormat } from '@/features/portal/Lib/portalFormat'
import { portalStatusLabel } from '@/features/portal/Lib/statusLabels'
import { SETTING_KEYS } from '@/features/settings/Schema/settingsSchema'
import { db } from '@/lib/db'
import { resolvePortalOrg } from '@/lib/portal-slug'
import { titleFrom } from '@/lib/page-title'

export function generateMetadata() {
  return titleFrom('portal.inspectionDetail', 'title')
}

/**
 * An inspection read in the portal: the results the shared report shows,
 * grouped the same way, for the signed-in customer's own vehicles only, with
 * which car, when and what is due next in a column beside them on a desk.
 * Photos and the PDF live on the shared link, which is offered when the
 * workshop made one.
 */
export default async function PortalInspectionPage({
  params,
}: {
  params: Promise<{ orgId: string; inspectionId: string }>
}) {
  const { orgId, inspectionId } = await params
  const t = await getTranslations('portal.inspectionDetail')
  const tStatus = await getTranslations('portal.status')
  const result = await getPortalInspection(inspectionId)
  const back = { href: `/portal/${orgId}/inspections`, label: t('back') }

  if (!result.success) {
    return (
      <PortalShell orgId={orgId}>
        <PortalPageHead title={t('title')} back={back} />
        <PortalLoadFailed>{t('failedToLoad')}</PortalLoadFailed>
      </PortalShell>
    )
  }
  if (!result.data) notFound()
  const inspection = result.data

  const org = await resolvePortalOrg(orgId)
  if (!org) notFound()
  const [fmt, locale, tVehicles, unitSystem] = await Promise.all([
    portalFormat(org.id),
    getLocale(),
    getTranslations('portal.vehicles'),
    db.appSetting.findFirst({
      where: { organizationId: org.id, key: SETTING_KEYS.UNIT_SYSTEM },
      select: { value: true },
    }),
  ])
  const marine = inspection.serviceType === 'marine'
  // The reading with its unit, as the vehicle page prints it: a bare
  // "18,240" does not say miles or kilometres. Engine hours are named by the label.
  const reading = (value: number) => {
    const formatted = new Intl.NumberFormat(locale).format(value)
    if (marine) return formatted
    return tVehicles(unitSystem?.value === 'metric' ? 'distanceKm' : 'distanceMi', {
      value: formatted,
    })
  }
  const vehicle = [inspection.vehicle.year, inspection.vehicle.make, inspection.vehicle.model]
    .filter(Boolean)
    .join(' ')
  const fleetNumber = 'fleetNumber' in inspection.vehicle ? inspection.vehicle.fleetNumber : null

  const facts: PortalFact[] = [
    {
      label: marine ? t('vessel') : t('vehicle'),
      value: (
        <span className="inline-flex flex-wrap items-center justify-end gap-2">
          {vehicle}
          {inspection.vehicle.licensePlate && (
            <PortalPlate>{inspection.vehicle.licensePlate}</PortalPlate>
          )}
          {fleetNumber && (
            <span className="p-muted basis-full text-sm wrap-anywhere">
              {tVehicles('fleetNumber', { fleetNumber })}
            </span>
          )}
        </span>
      ),
    },
    {
      label: inspection.completedAt ? t('doneOn') : t('startedOn'),
      value: fmt.day(inspection.completedAt ?? inspection.createdAt),
    },
    ...(inspection.mileage !== null
      ? [
          {
            label: marine ? t('engineHours') : t('odometer'),
            value: reading(inspection.mileage),
          },
        ]
      : []),
    ...(inspection.nextTestDue
      ? [{ label: t('nextDue'), value: fmt.day(inspection.nextTestDue), strong: true }]
      : []),
    ...(inspection.certificateNumber
      ? [
          {
            label: t('certificateNumber'),
            value: <span className="break-all">{inspection.certificateNumber}</span>,
          },
        ]
      : []),
  ]

  return (
    <PortalShell orgId={orgId}>
      <PortalPageHead
        back={back}
        title={inspection.template.name}
        badge={
          <PortalStatus kind="inspection" status={inspection.status}>
            {portalStatusLabel('inspection', inspection.status, tStatus)}
          </PortalStatus>
        }
      />

      <PortalDetailLayout
        aside={
          <>
            <PortalPanel aria-labelledby="inspection-facts">
              <PortalSectionLabel id="inspection-facts">{t('about')}</PortalSectionLabel>
              <div className="mt-2">
                <PortalFacts facts={facts} />
              </div>
              {inspection.publicToken && (
                <PortalLinkButton
                  variant="strong"
                  block
                  className="mt-4"
                  href={`/share/inspection/${orgId}/${inspection.publicToken}`}
                >
                  <ExternalLink className="h-[18px] w-[18px] shrink-0" aria-hidden />
                  {t('openShared')}
                </PortalLinkButton>
              )}
            </PortalPanel>
            {inspection.status !== 'completed' && <PortalNotice>{t('stillWorking')}</PortalNotice>}
            {inspection.notes && (
              <PortalPanel aria-labelledby="notes-heading">
                <PortalSectionLabel id="notes-heading">{t('notes')}</PortalSectionLabel>
                <p className="mt-2 whitespace-pre-wrap text-[15px] leading-normal">
                  {inspection.notes}
                </p>
              </PortalPanel>
            )}
          </>
        }
      >
        <PortalInspectionResults
          items={inspection.items}
          severityScale={inspection.severityScale ?? inspection.template.severityScale}
          country={inspection.country ?? inspection.template.country}
        />
      </PortalDetailLayout>
    </PortalShell>
  )
}
