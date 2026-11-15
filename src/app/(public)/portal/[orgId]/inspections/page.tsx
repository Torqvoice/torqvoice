import { ChevronRight } from 'lucide-react'
import { getTranslations } from 'next-intl/server'
import { getPortalInspections } from '@/features/portal/Actions/portalActions'
import {
  PortalCard,
  PortalCardList,
  PortalLoadFailed,
  PortalPageHead,
  PortalStatus,
  PortalStretchLink,
  PortalTable,
  PortalTd,
  PortalTh,
  PortalTr,
} from '@/features/portal/Components/Detail/PortalPageParts'
import { PortalDocumentsTabs } from '@/features/portal/Components/PortalDocumentsTabs'
import { PortalShell } from '@/features/portal/Components/PortalShell'
import { PortalEmptyState, PortalPanel, PortalPlate } from '@/features/portal/Components/Ui'
import { portalConditionSummary } from '@/features/portal/Lib/inspectionSummary'
import { portalFormat } from '@/features/portal/Lib/portalFormat'
import { portalStatusLabel } from '@/features/portal/Lib/statusLabels'
import { resolvePortalOrg } from '@/lib/portal-slug'

export default async function PortalInspectionsPage({
  params,
}: {
  params: Promise<{ orgId: string }>
}) {
  const { orgId } = await params
  const org = await resolvePortalOrg(orgId)
  // No such workshop: the shell says so.
  if (!org) return <PortalShell orgId={orgId}>{null}</PortalShell>

  const [t, tStatus, fmt, result] = await Promise.all([
    getTranslations('portal.inspections'),
    getTranslations('portal.status'),
    portalFormat(org.id),
    getPortalInspections(),
  ])

  if (!result.success || !result.data) {
    return (
      <PortalShell orgId={orgId}>
        <PortalDocumentsTabs orgId={orgId} active="inspections" />
        <PortalPageHead title={t('title')} />
        <PortalLoadFailed>{t('failedToLoad')}</PortalLoadFailed>
      </PortalShell>
    )
  }

  const rows = result.data.map((insp) => ({
    insp,
    date: fmt.day(new Date(insp.completedAt ?? insp.createdAt).toISOString()),
    summary: portalConditionSummary(insp.items),
    // A shared report opens as shared; one without a link opens in the portal.
    href: insp.publicToken
      ? `/share/inspection/${orgId}/${insp.publicToken}`
      : `/portal/${orgId}/inspections/${insp.id}`,
  }))

  const summaryLine = (summary: (typeof rows)[number]['summary']) =>
    summary.map((c) => (
      <span key={c.key} className={c.className}>
        {t(c.key, { count: c.count })}
      </span>
    ))

  return (
    <PortalShell orgId={orgId}>
      <PortalDocumentsTabs orgId={orgId} active="inspections" />
      <PortalPageHead title={t('title')} description={t('description')} />

      {rows.length === 0 ? (
        <PortalPanel>
          <PortalEmptyState center title={t('noInspections')}>
            {t('noInspectionsHint')}
          </PortalEmptyState>
        </PortalPanel>
      ) : (
        <>
          {/* Cards on a phone: the whole card is the link. */}
          <PortalCardList>
            {rows.map(({ insp, date, summary, href }) => (
              <PortalCard key={insp.id}>
                <div className="flex items-start justify-between gap-3">
                  <PortalStretchLink href={href} className="min-w-0 flex-1 break-words text-[17px]">
                    {insp.template.name}
                  </PortalStretchLink>
                  <PortalStatus kind="inspection" status={insp.status} className="shrink-0">
                    {portalStatusLabel('inspection', insp.status, tStatus)}
                  </PortalStatus>
                </div>
                <p className="p-muted mt-1.5 break-words text-sm">
                  {insp.vehicle.make} {insp.vehicle.model}
                  {insp.vehicle.licensePlate && ` (${insp.vehicle.licensePlate})`}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm">
                  {summaryLine(summary)}
                  <span className="p-muted">{date}</span>
                </div>
              </PortalCard>
            ))}
          </PortalCardList>

          {/* A table on a desk: the row is the link. */}
          <PortalTable>
            <thead>
              <tr>
                <PortalTh>{t('template')}</PortalTh>
                <PortalTh>{t('vehicle')}</PortalTh>
                <PortalTh>{t('status')}</PortalTh>
                <PortalTh>{t('date')}</PortalTh>
                <PortalTh>{t('summary')}</PortalTh>
                <PortalTh className="w-12" />
              </tr>
            </thead>
            <tbody>
              {rows.map(({ insp, date, summary, href }) => (
                <PortalTr key={insp.id}>
                  <PortalTd>
                    <PortalStretchLink href={href}>{insp.template.name}</PortalStretchLink>
                  </PortalTd>
                  <PortalTd>
                    <span className="flex flex-wrap items-center gap-2">
                      {insp.vehicle.make} {insp.vehicle.model}
                      {insp.vehicle.licensePlate && (
                        <PortalPlate>{insp.vehicle.licensePlate}</PortalPlate>
                      )}
                    </span>
                  </PortalTd>
                  <PortalTd>
                    <PortalStatus kind="inspection" status={insp.status}>
                      {portalStatusLabel('inspection', insp.status, tStatus)}
                    </PortalStatus>
                  </PortalTd>
                  <PortalTd muted>{date}</PortalTd>
                  <PortalTd>
                    <div className="flex flex-wrap gap-x-3 text-sm">{summaryLine(summary)}</div>
                  </PortalTd>
                  <PortalTd>
                    <ChevronRight className="p-muted h-[18px] w-[18px]" aria-hidden />
                  </PortalTd>
                </PortalTr>
              ))}
            </tbody>
          </PortalTable>
        </>
      )}
    </PortalShell>
  )
}
