import { getTranslations } from 'next-intl/server'
import { getPortalVehicles } from '@/features/portal/Actions/portalActions'
import {
  PortalCard,
  PortalCardList,
  PortalLoadFailed,
  PortalPageHead,
  PortalStretchLink,
  PortalTable,
  PortalTd,
  PortalTh,
  PortalTr,
} from '@/features/portal/Components/Detail/PortalPageParts'
import { PortalShell } from '@/features/portal/Components/PortalShell'
import {
  PortalEmptyState,
  PortalLinkButton,
  PortalPanel,
  PortalPlate,
} from '@/features/portal/Components/Ui'
import { SETTING_KEYS } from '@/features/settings/Schema/settingsSchema'
import { db } from '@/lib/db'
import { resolvePortalOrg } from '@/lib/portal-slug'
import { ChevronRight } from 'lucide-react'

export default async function PortalVehiclesPage({
  params,
}: {
  params: Promise<{ orgId: string }>
}) {
  const { orgId } = await params
  const org = await resolvePortalOrg(orgId)
  // No such workshop: the shell says so.
  if (!org) return <PortalShell orgId={orgId}>{null}</PortalShell>

  const [t, tNav] = await Promise.all([
    getTranslations('portal.vehicles'),
    getTranslations('portal.nav'),
  ])
  const [result, serviceTypeSetting] = await Promise.all([
    getPortalVehicles(),
    db.appSetting.findUnique({
      where: { organizationId_key: { organizationId: org.id, key: SETTING_KEYS.SERVICE_TYPE } },
      select: { value: true },
    }),
  ])
  // A boat yard's customers own boats: the wording follows the workshop.
  const marine = serviceTypeSetting?.value === 'marine'
  const word = (key: string) => t(marine ? `${key}Marine` : key)

  if (!result.success || !result.data) {
    return (
      <PortalShell orgId={orgId}>
        <PortalPageHead title={word('title')} />
        <PortalLoadFailed>{word('failedToLoad')}</PortalLoadFailed>
      </PortalShell>
    )
  }

  const vehicles = result.data.map((v) => ({
    v,
    name: `${v.year} ${v.make} ${v.model}`,
    href: `/portal/${orgId}/vehicles/${v.id}`,
  }))

  return (
    <PortalShell orgId={orgId}>
      <PortalPageHead title={word('title')} description={word('description')} />

      {vehicles.length === 0 ? (
        <PortalPanel>
          <PortalEmptyState
            center
            title={word('noVehicles')}
            action={
              <PortalLinkButton variant="accent" href={`/portal/${orgId}/request-service`}>
                {tNav('bookLong')}
              </PortalLinkButton>
            }
          >
            {word('noVehiclesHint')}
          </PortalEmptyState>
        </PortalPanel>
      ) : (
        <>
          {/* Cards on a phone: the whole card opens the car. */}
          <PortalCardList>
            {vehicles.map(({ v, name, href }) => (
              <PortalCard key={v.id}>
                <div className="flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                      <PortalStretchLink href={href} className="break-words text-[17px]">
                        {name}
                      </PortalStretchLink>
                      {v.licensePlate && <PortalPlate>{v.licensePlate}</PortalPlate>}
                    </div>
                    <p className="p-muted mt-1.5 text-sm">
                      {t('serviceCount', { count: v._count.serviceRecords })} &middot;{' '}
                      {t('inspectionCount', { count: v._count.inspections })}
                    </p>
                  </div>
                  <ChevronRight className="p-muted h-[18px] w-[18px] shrink-0" aria-hidden />
                </div>
              </PortalCard>
            ))}
          </PortalCardList>

          {/* A table on a desk: the name is the row's one real link. */}
          <PortalTable>
            <thead>
              <tr>
                <PortalTh>{word('columnVehicle')}</PortalTh>
                <PortalTh className="w-[180px]">{word('columnPlate')}</PortalTh>
                <PortalTh className="w-[150px]">{t('columnServices')}</PortalTh>
                <PortalTh className="w-[170px]">{t('columnInspections')}</PortalTh>
                <PortalTh className="w-12" />
              </tr>
            </thead>
            <tbody>
              {vehicles.map(({ v, name, href }) => (
                <PortalTr key={v.id}>
                  <PortalTd>
                    <PortalStretchLink href={href}>{name}</PortalStretchLink>
                  </PortalTd>
                  <PortalTd>
                    {v.licensePlate ? <PortalPlate>{v.licensePlate}</PortalPlate> : null}
                  </PortalTd>
                  <PortalTd muted>{t('serviceCount', { count: v._count.serviceRecords })}</PortalTd>
                  <PortalTd muted>{t('inspectionCount', { count: v._count.inspections })}</PortalTd>
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
