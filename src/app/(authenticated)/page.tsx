import { getTranslations } from 'next-intl/server'
import {
  getDashboardStats,
  getUpcomingReminders,
} from '@/features/vehicles/Actions/dashboardActions'
import { getSettings } from '@/features/settings/Actions/settingsActions'
import { SETTING_KEYS } from '@/features/settings/Schema/settingsSchema'
import {
  getVehiclesDueForService,
  getDismissedMaintenanceVehicles,
} from '@/features/vehicles/Actions/predictedMaintenanceActions'
import { getInspectionsPaginated } from '@/features/inspections/Actions/inspectionActions'
import { getQuoteRequests } from '@/features/inspections/Actions/quoteRequestActions'
import { getPendingServiceRequests } from '@/features/customers/Actions/customerActions'
import { getQuoteResponses } from '@/features/quotes/Actions/quoteResponseActions'
import { getAuthContext } from '@/lib/get-auth-context'
import { getFeatures } from '@/lib/features'
import { getRecentSmsThreads } from '@/features/sms/Actions/smsActions'
import { getNotifications } from '@/features/notifications/Actions/notificationActions'
import { getRecentAuditLogs } from '@/features/audit/Actions/auditActions'
import { getRecentObservations } from '@/features/vehicles/Actions/findingActions'
import { getMyActiveJobs } from '@/features/vehicles/Actions/getMyActiveJobs'
import { getOnboardingChecklist } from '@/features/onboarding/Actions/checklistActions'
import { DashboardClient } from './dashboard-client'
import { db } from '@/lib/db'
import { sanitizeConfig, type CustomWidget } from '@/features/dashboard/custom-cards/registry'
import { MyActiveJobs } from '@/features/vehicles/Components/MyActiveJobs'
import { PageHeader } from '@/components/page-header'
import { getTireHotelSummary } from '@/features/tire-hotel/Actions/getTireHotelSummary'
import { getInspectionsDueSummary } from '@/features/vehicles/Actions/inspectionStatusActions'

export default async function DashboardPage() {
  const auth = await getAuthContext()
  const features = auth ? await getFeatures(auth.organizationId) : null
  const smsEnabled = features?.sms ?? false
  // The plan decides whether the portal exists at all; the setting decides
  // whether this shop turned it on. Gate the query on the first so a shop
  // that cannot have a portal never runs it, and the card on the second.
  const portalAllowed = features?.customerPortal ?? false

  const [
    result,
    settingsResult,
    remindersResult,
    maintenanceResult,
    dismissedMaintenanceResult,
    inProgressResult,
    completedResult,
    quoteRequestsResult,
    quoteResponsesResult,
    smsResult,
    notificationsResult,
    auditLogsResult,
    recentObservationsResult,
    myJobsResult,
    checklistResult,
    tireHotelResult,
    serviceRequestsResult,
    inspectionsDueResult,
  ] = await Promise.all([
    getDashboardStats(),
    getSettings([
      SETTING_KEYS.CURRENCY_CODE,
      SETTING_KEYS.UNIT_SYSTEM,
      SETTING_KEYS.PORTAL_ENABLED,
    ]),
    getUpcomingReminders(),
    getVehiclesDueForService(),
    getDismissedMaintenanceVehicles(),
    getInspectionsPaginated({ status: 'in_progress', pageSize: 5 }),
    getInspectionsPaginated({ status: 'completed', pageSize: 5 }),
    getQuoteRequests(),
    getQuoteResponses(),
    smsEnabled ? getRecentSmsThreads(0, 5) : Promise.resolve(null),
    getNotifications(),
    getRecentAuditLogs(10),
    getRecentObservations(),
    getMyActiveJobs(),
    getOnboardingChecklist(),
    getTireHotelSummary(),
    portalAllowed ? getPendingServiceRequests() : Promise.resolve(null),
    getInspectionsDueSummary(),
  ])

  const [layoutUser, widgetRows] = auth
    ? await Promise.all([
        db.user.findUnique({
          where: { id: auth.userId },
          select: { dashboardLayout: true },
        }),
        db.dashboardWidget.findMany({
          where: { userId: auth.userId, organizationId: auth.organizationId },
          select: { id: true, name: true, config: true },
          orderBy: { createdAt: 'asc' },
        }),
      ])
    : [null, []]

  const customWidgets: CustomWidget[] = widgetRows.flatMap((w) => {
    const config = sanitizeConfig(w.config)
    return config ? [{ id: w.id, name: w.name, config }] : []
  })

  if (!result.success || !result.data) {
    const t = await getTranslations('dashboard')
    return (
      <>
        <PageHeader />
        <div className="flex h-[50vh] items-center justify-center">
          <p className="text-muted-foreground">{result.error || t('error')}</p>
        </div>
      </>
    )
  }

  const settings = settingsResult.success && settingsResult.data ? settingsResult.data : {}
  const currencyCode = settings[SETTING_KEYS.CURRENCY_CODE] || 'USD'
  const unitSystem = (settings[SETTING_KEYS.UNIT_SYSTEM] || 'imperial') as 'metric' | 'imperial'
  const smsThreads = smsResult && smsResult.success && smsResult.data ? smsResult.data.threads : []
  const notifications =
    notificationsResult.success && notificationsResult.data
      ? notificationsResult.data.notifications
      : []
  const recentAuditLogs =
    auditLogsResult.success && auditLogsResult.data ? auditLogsResult.data : []
  const recentObservations =
    recentObservationsResult.success && recentObservationsResult.data
      ? recentObservationsResult.data
      : []

  // Null rather than an empty list: no portal means no card at all, where an
  // empty list would mean a portal nobody has used yet.
  const serviceRequests =
    portalAllowed && settings[SETTING_KEYS.PORTAL_ENABLED] === 'true'
      ? (serviceRequestsResult?.success && serviceRequestsResult.data) || []
      : null

  const myJobs = myJobsResult.success && myJobsResult.data ? myJobsResult.data : []
  const onboardingChecklist =
    checklistResult.success && checklistResult.data ? checklistResult.data : null

  return (
    <>
      <PageHeader />
      <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
        <MyActiveJobs
          jobs={myJobs}
          smsEnabled={features?.sms ?? false}
          emailEnabled={features?.smtp ?? false}
          telegramEnabled={features?.telegram ?? false}
        />
        <DashboardClient
          stats={result.data}
          currencyCode={currencyCode}
          upcomingReminders={
            remindersResult.success && remindersResult.data ? remindersResult.data : []
          }
          vehiclesDueForService={
            maintenanceResult.success && maintenanceResult.data ? maintenanceResult.data : []
          }
          dismissedMaintenanceVehicles={
            dismissedMaintenanceResult.success && dismissedMaintenanceResult.data
              ? dismissedMaintenanceResult.data
              : []
          }
          unitSystem={unitSystem}
          inProgressInspections={
            inProgressResult.success && inProgressResult.data ? inProgressResult.data.records : []
          }
          completedInspections={
            completedResult.success && completedResult.data ? completedResult.data.records : []
          }
          serviceRequests={serviceRequests}
          quoteRequests={
            quoteRequestsResult.success && quoteRequestsResult.data ? quoteRequestsResult.data : []
          }
          quoteResponses={
            quoteResponsesResult.success && quoteResponsesResult.data
              ? quoteResponsesResult.data
              : []
          }
          smsThreads={smsThreads}
          smsEnabled={smsEnabled}
          notifications={notifications}
          recentAuditLogs={recentAuditLogs}
          recentObservations={recentObservations}
          initialLayout={layoutUser?.dashboardLayout ?? null}
          customWidgets={customWidgets}
          onboardingChecklist={onboardingChecklist}
          tireHotelSummary={tireHotelResult.success ? (tireHotelResult.data ?? null) : null}
          inspectionsDue={
            inspectionsDueResult.success && inspectionsDueResult.data
              ? inspectionsDueResult.data
              : null
          }
        />
      </div>
    </>
  )
}
