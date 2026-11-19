import { Download } from 'lucide-react'
import Link from 'next/link'
import { getLocale, getTranslations } from 'next-intl/server'
import {
  getPortalVehicleDetail,
  getPortalVehicleTires,
} from '@/features/portal/Actions/portalActions'
import {
  PortalDetailLayout,
  PortalLoadFailed,
  PortalPageHead,
  PortalStatus,
} from '@/features/portal/Components/Detail/PortalPageParts'
import { tireSeasonKey } from '@/features/portal/Components/Home/homeCopy'
import { PortalShell } from '@/features/portal/Components/PortalShell'
import { ReportSoldButton } from '@/features/portal/Components/ReportSoldButton'
import {
  PortalBadge,
  PortalLinkButton,
  PortalPanel,
  PortalPlate,
  PortalSectionLabel,
} from '@/features/portal/Components/Ui'
import { portalConditionSummary } from '@/features/portal/Lib/inspectionSummary'
import { portalFormat } from '@/features/portal/Lib/portalFormat'
import { portalStatusLabel } from '@/features/portal/Lib/statusLabels'
import { SETTING_KEYS } from '@/features/settings/Schema/settingsSchema'
import { formatTypeKey } from '@/features/vehicles/Lib/typeKey'
import { db } from '@/lib/db'
import { resolvePortalOrg } from '@/lib/portal-slug'
import { loadPortalWorkshop } from '@/features/portal/Lib/workshop.server'
import { titleFrom } from '@/lib/page-title'
import { getWarrantyStatus, type WarrantyStatus } from '@/lib/warranty'
import { vehicleName } from '@/lib/vehicle-name'

// "Your cars" or "Your boats": the workshop read here is the one PortalShell
// loads for the page anyway (request-cached), and a failure reads as cars.
export async function generateMetadata({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params
  const org = await resolvePortalOrg(orgId).catch(() => null)
  const workshop = org ? await loadPortalWorkshop(org.id, org.name).catch(() => null) : null
  return titleFrom('portal.vehicles', workshop?.marine ? 'titleMarine' : 'title')
}

/**
 * A warranty's state, in the portal theme's own badge: running is outlined,
 * running out soon is filled with the workshop's colour so it is noticed,
 * expired sits quiet.
 */
const warrantyBadge: Record<
  Exclude<WarrantyStatus, 'none'>,
  { tone: 'outline' | 'accent' | 'neutral'; label: string }
> = {
  // The label names the warranty: a bare "Active" beside "Completed" says nothing to a customer.
  active: { tone: 'outline', label: 'warrantyActive' },
  expiring: { tone: 'accent', label: 'warrantyExpiring' },
  expired: { tone: 'neutral', label: 'warrantyExpired' },
}

/**
 * One of the customer's cars: what the workshop has done to it and checked on
 * it, down the page, with the car itself, its stored tyres and what the
 * customer can do about it in a column beside that on a desk.
 */
export default async function PortalVehicleDetailPage({
  params,
}: {
  params: Promise<{ orgId: string; vehicleId: string }>
}) {
  const { orgId, vehicleId } = await params
  const org = await resolvePortalOrg(orgId)
  // No such workshop: the shell says so.
  if (!org) return <PortalShell orgId={orgId}>{null}</PortalShell>

  const [t, tStatus, tInvoices, tHome, tNav, locale] = await Promise.all([
    getTranslations('portal.vehicles'),
    getTranslations('portal.status'),
    getTranslations('portal.invoices'),
    getTranslations('portal.home'),
    getTranslations('portal.nav'),
    getLocale(),
  ])
  const [result, tiresResult, settings, fmt] = await Promise.all([
    getPortalVehicleDetail(vehicleId),
    // The tyres are an extra: the page stands without them.
    getPortalVehicleTires(vehicleId).catch(() => null),
    db.appSetting.findMany({
      where: {
        organizationId: org.id,
        key: { in: [SETTING_KEYS.SERVICE_TYPE, SETTING_KEYS.UNIT_SYSTEM] },
      },
      select: { key: true, value: true },
    }),
    portalFormat(org.id),
  ])
  const setting = (key: string) => settings.find((s) => s.key === key)?.value
  const marine = setting(SETTING_KEYS.SERVICE_TYPE) === 'marine'
  const metric = setting(SETTING_KEYS.UNIT_SYSTEM) === 'metric'
  const day = (at: Date | string) => fmt.day(new Date(at).toISOString())
  const number = new Intl.NumberFormat(locale)
  // As the workshop's own vehicle page prints it: engine hours on a boat,
  // otherwise kilometres or miles by the workshop's unit system.
  const odometer = (value: number) => {
    const formatted = number.format(value)
    if (marine) return t('engineHours', { value: formatted })
    return t(metric ? 'distanceKm' : 'distanceMi', { value: formatted })
  }
  const back = { href: `/portal/${orgId}/vehicles`, label: t(marine ? 'backMarine' : 'back') }

  // Not this customer's, or archived: the action finds neither.
  if (!result.success || !result.data) {
    return (
      <PortalShell orgId={orgId}>
        <PortalPageHead title={t(marine ? 'titleMarine' : 'title')} back={back} />
        <PortalLoadFailed>{t('vehicleNotFound')}</PortalLoadFailed>
      </PortalShell>
    )
  }

  const v = result.data
  const tires = tiresResult?.success ? (tiresResult.data ?? []) : []
  const facts = [
    v.licensePlate ? t(marine ? 'plateMarine' : 'plate', { plate: v.licensePlate }) : null,
    v.vin ? t(marine ? 'vinMarine' : 'vin', { vin: v.vin }) : null,
    v.hsn || v.tsn ? t('typeKey', { typeKey: formatTypeKey(v.hsn, v.tsn) }) : null,
    v.fleetNumber ? t('fleetNumber', { fleetNumber: v.fleetNumber }) : null,
    v.mileage > 0 ? odometer(v.mileage) : null,
    v.color || null,
  ].filter(Boolean) as string[]

  return (
    <PortalShell orgId={orgId}>
      <PortalPageHead
        back={back}
        title={`${vehicleName(v)}`}
        badge={v.licensePlate ? <PortalPlate>{v.licensePlate}</PortalPlate> : undefined}
      />

      <PortalDetailLayout
        aside={
          <>
            <PortalPanel aria-labelledby="car-facts">
              <PortalSectionLabel id="car-facts">
                {t(marine ? 'aboutMarine' : 'about')}
              </PortalSectionLabel>
              {facts.length > 0 && (
                <ul className="mt-3 flex flex-col">
                  {facts.map((fact) => (
                    <li
                      key={fact}
                      className="break-words border-b py-2.5 text-[15px] last:border-b-0"
                    >
                      {fact}
                    </li>
                  ))}
                </ul>
              )}
              <PortalLinkButton
                variant="accent"
                block
                className="mt-4"
                href={`/portal/${orgId}/request-service?vehicle=${v.id}`}
              >
                {tNav('bookLong')}
              </PortalLinkButton>
            </PortalPanel>

            {tires.length > 0 && (
              <PortalPanel aria-labelledby="car-tires">
                <PortalSectionLabel id="car-tires">{tHome('tires')}</PortalSectionLabel>
                <ul className="mt-3 flex flex-col">
                  {tires.map((set) => (
                    <li key={set.id} className="border-b py-3 last:border-b-0">
                      <p className="text-[15px] font-semibold">
                        {tHome(tireSeasonKey(set.season, 'tiresStored'))}
                      </p>
                      <p className="p-muted mt-0.5 break-words text-sm">
                        {[
                          [set.brand, set.model].filter(Boolean).join(' ') || null,
                          set.size,
                          tHome('tiresCount', { count: set.quantity }),
                          set.studded ? tHome('tiresStudded') : null,
                          set.withRims ? tHome('tiresOnRims') : null,
                          tHome('tiresStoredSince', { day: fmt.day(set.storedSince) }),
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </p>
                    </li>
                  ))}
                </ul>
              </PortalPanel>
            )}

            <PortalPanel tone="soft">
              <ReportSoldButton
                vehicleId={v.id}
                reportedAt={v.soldReportedAt?.toISOString() ?? null}
              />
            </PortalPanel>
          </>
        }
      >
        <div className="flex flex-col gap-6">
          <PortalPanel aria-labelledby="car-history">
            <PortalSectionLabel id="car-history">
              {t('serviceHistory', { count: v.serviceRecords.length })}
            </PortalSectionLabel>
            {v.serviceRecords.length === 0 ? (
              <p className="p-muted mt-3 text-[15px]">{t('noServiceRecords')}</p>
            ) : (
              <ul className="mt-2 flex flex-col">
                {v.serviceRecords.map((sr) => {
                  // Only a finished job has a price that holds and a PDF to
                  // fetch; one still in the workshop shows where it stands.
                  const finished = sr.status === 'completed'
                  const warranty = finished
                    ? getWarrantyStatus(
                        sr.warrantyExpiresAt,
                        sr.warrantyMileage,
                        sr.mileage,
                        v.mileage
                      )
                    : 'none'
                  return (
                    <li
                      key={sr.id}
                      className="flex flex-col gap-2.5 border-b py-4 last:border-b-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
                    >
                      <div className="min-w-0">
                        <p className="break-words text-base font-semibold">
                          {finished && sr.invoiceNumber ? `#${sr.invoiceNumber} · ` : ''}
                          {sr.title}
                        </p>
                        <p className="p-muted text-sm">{day(sr.startDateTime ?? sr.serviceDate)}</p>
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <PortalStatus kind="workOrder" status={sr.status}>
                            {portalStatusLabel('job', sr.status, tStatus)}
                          </PortalStatus>
                          {warranty !== 'none' && (
                            <PortalBadge tone={warrantyBadge[warranty].tone}>
                              {t(warrantyBadge[warranty].label)}
                            </PortalBadge>
                          )}
                        </div>
                      </div>
                      {finished && (
                        <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1">
                          <span className="text-base font-bold">{fmt.money(sr.totalAmount)}</span>
                          <Link
                            href={`/portal/${orgId}/invoices/${sr.id}`}
                            className="p-link p-link--block text-sm"
                          >
                            {t('view')}
                          </Link>
                          <a
                            href={`/portal/${orgId}/invoices/${sr.id}/pdf`}
                            download
                            className="p-link p-link--block gap-1.5 text-sm"
                          >
                            <Download className="h-4 w-4 shrink-0" aria-hidden />
                            {tInvoices('download')}
                          </a>
                        </div>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
          </PortalPanel>

          <PortalPanel aria-labelledby="car-inspections">
            <PortalSectionLabel id="car-inspections">
              {t('inspectionsTab', { count: v.inspections.length })}
            </PortalSectionLabel>
            {v.inspections.length === 0 ? (
              <p className="p-muted mt-3 text-[15px]">{t('noInspections')}</p>
            ) : (
              <ul className="mt-2 flex flex-col">
                {v.inspections.map((insp) => (
                  <li
                    key={insp.id}
                    className="flex flex-col gap-2.5 border-b py-4 last:border-b-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
                  >
                    <div className="min-w-0">
                      <p className="break-words text-base font-semibold">{insp.template.name}</p>
                      <p className="p-muted text-sm">
                        {day(insp.createdAt)}
                        {insp.completedAt &&
                          ` · ${t('completed', { date: day(insp.completedAt) })}`}
                      </p>
                      <div className="mt-1 flex flex-wrap gap-x-3 text-sm">
                        {portalConditionSummary(insp.items).map((c) => (
                          <span key={c.key} className={c.className}>
                            {t(c.key, { count: c.count })}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1">
                      <PortalStatus kind="inspection" status={insp.status}>
                        {portalStatusLabel('inspection', insp.status, tStatus)}
                      </PortalStatus>
                      <Link
                        href={
                          insp.publicToken
                            ? `/share/inspection/${orgId}/${insp.publicToken}`
                            : `/portal/${orgId}/inspections/${insp.id}`
                        }
                        className="p-link p-link--block text-sm"
                      >
                        {t('view')}
                      </Link>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </PortalPanel>
        </div>
      </PortalDetailLayout>
    </PortalShell>
  )
}
