import { PortalShell } from '@/features/portal/Components/PortalShell'
import { getPortalVehicleDetail } from '@/features/portal/Actions/portalActions'
import { AppCard } from '@/components/app-card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ClipboardCheck, Download, Wrench } from 'lucide-react'
import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { db } from '@/lib/db'
import { getWarrantyStatus, type WarrantyStatus } from '@/lib/warranty'

const warrantyBadgeStyles: Record<WarrantyStatus, string> = {
  active: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  expiring: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  expired: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  none: 'bg-muted text-muted-foreground',
}

export default async function PortalVehicleDetailPage({
  params,
}: {
  params: Promise<{ orgId: string; vehicleId: string }>
}) {
  const { orgId, vehicleId } = await params
  const t = await getTranslations('portal.vehicles')
  const tInvoices = await getTranslations('portal.invoices')
  const tWarranty = await getTranslations('vehicles.services.warranty.status')
  const [result, serviceTypeSetting] = await Promise.all([
    getPortalVehicleDetail(vehicleId),
    db.appSetting.findUnique({
      where: { organizationId_key: { organizationId: orgId, key: 'workshop.serviceType' } },
      select: { value: true },
    }),
  ])
  const serviceType = (serviceTypeSetting?.value || 'automotive') as 'automotive' | 'marine'

  if (!result.success || !result.data) {
    return (
      <PortalShell orgId={orgId}>
        <p className="text-muted-foreground">{result.error ?? t('vehicleNotFound')}</p>
      </PortalShell>
    )
  }

  const v = result.data

  return (
    <PortalShell orgId={orgId}>
      <div className="space-y-6">
        {/* Vehicle info header */}
        <div className="flex items-start gap-4">
          <div>
            <h1 className="text-2xl font-bold">
              {v.year} {v.make} {v.model}
            </h1>
            <div className="mt-1 flex flex-wrap gap-3 text-sm text-muted-foreground">
              {v.licensePlate && (
                <span>
                  {serviceType === 'marine'
                    ? `Reg: ${v.licensePlate}`
                    : t('plate', { plate: v.licensePlate })}
                </span>
              )}
              {v.vin && (
                <span>{serviceType === 'marine' ? `HIN: ${v.vin}` : t('vin', { vin: v.vin })}</span>
              )}
              {v.mileage > 0 && (
                <span>
                  {serviceType === 'marine'
                    ? `${v.mileage.toLocaleString()} hrs`
                    : `${v.mileage.toLocaleString()} mi`}
                </span>
              )}
              {v.color && <span>{v.color}</span>}
            </div>
          </div>
        </div>

        <Tabs defaultValue="service-history">
          <TabsList>
            <TabsTrigger value="service-history">
              {t('serviceHistory', { count: v.serviceRecords.length })}
            </TabsTrigger>
            <TabsTrigger value="inspections">
              {t('inspectionsTab', { count: v.inspections.length })}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="service-history" className="mt-4">
            <AppCard
              icon={Wrench}
              title={t('serviceHistoryTitle')}
              badge={v.serviceRecords.length || undefined}
              contentClassName="p-0"
            >
              {v.serviceRecords.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  {t('noServiceRecords')}
                </p>
              ) : (
              <div className="divide-y">
                {v.serviceRecords.map((sr) => (
                    <div key={sr.id} className="flex flex-col gap-2 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">
                          {sr.invoiceNumber ? `#${sr.invoiceNumber} - ` : ''}
                          {sr.title}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(sr.startDateTime ?? sr.serviceDate).toLocaleDateString()}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <Badge variant="outline">{sr.status}</Badge>
                        {(() => {
                          const ws = getWarrantyStatus(
                            sr.warrantyExpiresAt,
                            sr.warrantyMileage,
                            sr.mileage,
                            v.mileage,
                          )
                          return ws !== 'none' ? (
                            <Badge
                              variant="outline"
                              className={`text-xs ${warrantyBadgeStyles[ws]}`}
                            >
                              {tWarranty(ws)}
                            </Badge>
                          ) : null
                        })()}
                        <span className="text-sm font-medium">${sr.totalAmount.toFixed(2)}</span>
                        {sr.publicToken && (
                          <Link
                            href={`/share/invoice/${orgId}/${sr.publicToken}`}
                            className="text-xs text-primary hover:underline"
                          >
                            {t('view')}
                          </Link>
                        )}
                        <a
                          href={`/portal/${orgId}/invoices/${sr.id}/pdf`}
                          download
                          className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                        >
                          <Download className="h-3.5 w-3.5" />
                          {tInvoices('download')}
                        </a>
                      </div>
                    </div>
                ))}
              </div>
              )}
            </AppCard>
          </TabsContent>

          <TabsContent value="inspections" className="mt-4">
            <AppCard
              icon={ClipboardCheck}
              title={t('inspectionsTitle')}
              badge={v.inspections.length || undefined}
              contentClassName="p-0"
            >
              {v.inspections.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">{t('noInspections')}</p>
              ) : (
              <div className="divide-y">
                {v.inspections.map((insp) => {
                  const conditions = insp.items.reduce(
                    (acc, item) => {
                      acc[item.condition] = (acc[item.condition] || 0) + 1
                      return acc
                    },
                    {} as Record<string, number>
                  )

                  return (
                    <div key={insp.id} className="flex flex-col gap-2 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{insp.template.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {new Date(insp.createdAt).toLocaleDateString()}
                            {insp.completedAt &&
                              ` - ${t('completed', { date: new Date(insp.completedAt).toLocaleDateString() })}`}
                          </p>
                          <div className="mt-1 flex gap-2">
                            {conditions.good && (
                              <span className="text-xs text-green-600">
                                {t('good', { count: conditions.good })}
                              </span>
                            )}
                            {conditions.fair && (
                              <span className="text-xs text-yellow-600">
                                {t('fair', { count: conditions.fair })}
                              </span>
                            )}
                            {conditions.poor && (
                              <span className="text-xs text-red-600">
                                {t('poor', { count: conditions.poor })}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline">{insp.status}</Badge>
                          {insp.publicToken && (
                            <Link
                              href={`/share/inspection/${orgId}/${insp.publicToken}`}
                              className="text-xs text-primary hover:underline"
                            >
                              {t('view')}
                            </Link>
                          )}
                        </div>
                      </div>
                  )
                })}
              </div>
              )}
            </AppCard>
          </TabsContent>
        </Tabs>
      </div>
    </PortalShell>
  )
}
