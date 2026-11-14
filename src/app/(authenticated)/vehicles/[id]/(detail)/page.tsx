import { resolveCurrencyCode } from '@/lib/currencies'
import { getTranslations } from 'next-intl/server'
import { getVehicle } from '@/features/vehicles/Actions/vehicleActions'
import { getServiceRecordsPaginated } from '@/features/vehicles/Actions/serviceActions'
import { getNotesPaginated } from '@/features/vehicles/Actions/noteActions'
import { getDisplaySettings } from '@/features/settings/Actions/settingsActions'
import { SETTING_KEYS } from '@/features/settings/Schema/settingsSchema'
import { getVehiclePredictedMileage } from '@/features/vehicles/Actions/predictedMaintenanceActions'
import { getVehicleInspections } from '@/features/inspections/Actions/inspectionActions'
import { getTemplates } from '@/features/inspections/Actions/templateActions'
import { getVehicleQuotes } from '@/features/quotes/Actions/quoteActions'
import { getVehicleFindings } from '@/features/vehicles/Actions/findingActions'
import { getVehicleJobWarnings } from '@/features/vehicles/Actions/getVehicleJobWarnings'
import { getVehicleGlance } from '@/features/vehicles/Actions/getVehicleGlance'
import { getFeatures } from '@/lib/features'
import { findSafetyConnection } from '@/features/integrations/Lib/vehicle-safety'
import { isAiConfigured } from '@/features/integrations/Lib/ai'
import { getAuthContext } from '@/lib/get-auth-context'
import { getTireSetsForVehicle } from '@/features/tire-hotel/Actions/tireJobActions'
import { VehicleDetailClient } from '../vehicle-detail-client'
import { VehicleDetailClassic } from '../_classic/vehicle-detail-classic'
import {
  TryNewVehiclePageBanner,
  VehiclePageViewed,
} from '@/features/vehicles/Components/VehiclePageLayoutSwitch'
import { resolveVehiclePageLayout } from '@/lib/vehicle-page-layout.server'
import { PageHeader } from '@/components/page-header'
import { redirect } from 'next/navigation'
import { PermissionSubject } from '@/lib/permissions'
import { getViewerAccess, readIfAllowed } from '@/lib/viewer-access'

/** The most notes the new page's feed holds: the same reach as its work orders. */
const FEED_NOTES = 250

export default async function VehicleDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const { id } = await params
  const sp = await searchParams

  // Payment notifications used to link here with the invoice as `record`,
  // which this page never read, so they opened the vehicle instead of the
  // invoice. Those links are still in people's bells.
  if (typeof sp.record === 'string' && sp.record) {
    redirect(`/vehicles/${id}/service/${sp.record}`)
  }

  const search = typeof sp.search === 'string' ? sp.search : ''
  // The classic page pages and filters its service table; the new one shows
  // the whole history as a feed. See lib/vehicle-page-layout.ts for which.
  const page = Number(sp.page) || 1
  const pageSize = Number(sp.pageSize) || 10
  const type = typeof sp.type === 'string' ? sp.type : 'all'

  const notesPage = Number(sp.notesPage) || 1
  const notesPageSize = Number(sp.notesPageSize) || 10
  const findingsPage = Number(sp.findingsPage) || 1
  const findingsPageSize = Number(sp.findingsPageSize) || 10

  // The inspections and tire hotel panels belong to permissions of their own.
  // A role without them is not shown the panels, and is not asked for their
  // data either: a refused call is a wasted query and a refusal in the audit
  // log on every vehicle somebody opens (lib/viewer-access).
  // Which layout this browser gets decides how the history is read below;
  // it is worked out while the viewer's access is, not after.
  const auth = getAuthContext()
  const layoutChoice = auth.then((ctx) => resolveVehiclePageLayout(ctx?.organizationId))
  const access = await getViewerAccess()
  const { layout, chosen: layoutChosen } = await layoutChoice
  const classic = layout === 'classic'
  const S = PermissionSubject

  const [
    result,
    serviceResult,
    notesResult,
    settingsResult,
    maintenanceSettingsResult,
    inspectionsResult,
    templatesResult,
    quotesResult,
    findingsResult,
    tireSetsResult,
    predResult,
    authContext,
    jobWarningsResult,
    feedNotesResult,
    glanceResult,
  ] = await Promise.all([
    getVehicle(id),
    // The new page shows the vehicle's history as one feed, so it asks for all
    // of it; a car with more work orders than this is shown its latest ones.
    classic
      ? getServiceRecordsPaginated(id, { page, pageSize, search, type })
      : getServiceRecordsPaginated(id, { page: 1, pageSize: 250, search }),
    getNotesPaginated(id, { page: notesPage, pageSize: notesPageSize }),
    getDisplaySettings([SETTING_KEYS.CURRENCY_CODE, SETTING_KEYS.UNIT_SYSTEM]),
    getDisplaySettings([
      SETTING_KEYS.PREDICTED_MAINTENANCE_ENABLED,
      SETTING_KEYS.MAINTENANCE_SERVICE_INTERVAL,
      SETTING_KEYS.MAINTENANCE_APPROACHING_THRESHOLD,
    ]),
    readIfAllowed(access, S.INSPECTIONS, () => getVehicleInspections(id)),
    readIfAllowed(access, S.INSPECTIONS, () => getTemplates()),
    getVehicleQuotes(id),
    getVehicleFindings(id, { page: findingsPage, pageSize: findingsPageSize }),
    readIfAllowed(access, S.TIRE_HOTEL, () => getTireSetsForVehicle(id)),
    // Asked alongside the rest rather than after it: neither needs the others.
    getVehiclePredictedMileage(id),
    auth,
    // What is wrong with the bookings of the vehicle's open jobs, flagged in
    // the new page's feed so nobody has to open each job to find out.
    classic ? null : readIfAllowed(access, S.WORK_ORDERS, () => getVehicleJobWarnings(id)),
    // The feed searches and shows every note, newest first, so it is not
    // handed the notes table's current page; the table keeps its paging.
    classic ? null : getNotesPaginated(id, { page: 1, pageSize: FEED_NOTES }),
    // Last visit, next booking and what is owed, over every work order and
    // not only the ones a search has left in the list.
    classic ? null : readIfAllowed(access, S.SERVICES, () => getVehicleGlance(id)),
  ])

  if (!result.success || !result.data) {
    return (
      <>
        <PageHeader />
        <div className="flex h-[50vh] items-center justify-center">
          <p className="text-muted-foreground">
            {result.error || (await getTranslations('vehicles.detail'))('notFound')}
          </p>
        </div>
      </>
    )
  }

  const paginatedServices =
    serviceResult.success && serviceResult.data
      ? serviceResult.data
      : { records: [], total: 0, page: 1, pageSize: 10, totalPages: 0 }

  const paginatedNotes =
    notesResult.success && notesResult.data
      ? notesResult.data
      : { records: [], total: 0, page: 1, pageSize: 10, totalPages: 0 }

  const paginatedFindings =
    findingsResult.success && findingsResult.data
      ? findingsResult.data
      : { records: [], total: 0, page: 1, pageSize: 10, totalPages: 0 }

  const currencySettings = settingsResult.success && settingsResult.data ? settingsResult.data : {}
  const currencyCode = resolveCurrencyCode(currencySettings[SETTING_KEYS.CURRENCY_CODE])
  const unitSystem = (currencySettings[SETTING_KEYS.UNIT_SYSTEM] || 'imperial') as
    | 'metric'
    | 'imperial'

  const maintenanceSettings =
    maintenanceSettingsResult.success && maintenanceSettingsResult.data
      ? maintenanceSettingsResult.data
      : {}
  const maintenanceEnabled =
    maintenanceSettings[SETTING_KEYS.PREDICTED_MAINTENANCE_ENABLED] === 'true'
  const serviceInterval = parseInt(
    maintenanceSettings[SETTING_KEYS.MAINTENANCE_SERVICE_INTERVAL] || '15000',
    10
  )

  let predictionData: {
    predictedMileage: number
    avgPerDay: number
    lastServiceMileage: number
    serviceInterval: number
    mileageSinceLastService: number
    status: 'overdue' | 'approaching' | 'ok' | null
    maintenanceDismissed: boolean
    confidencePercent: number
  } | null = null

  if (predResult.success && predResult.data) {
    const p = predResult.data
    const mileageSinceLastService = p.predictedMileage - p.lastServiceMileage

    let status: 'overdue' | 'approaching' | 'ok' | null = null
    if (maintenanceEnabled) {
      const approachingThreshold = parseInt(
        maintenanceSettings[SETTING_KEYS.MAINTENANCE_APPROACHING_THRESHOLD] || '1000',
        10
      )
      status = 'ok'
      if (mileageSinceLastService >= serviceInterval) {
        status = 'overdue'
      } else if (mileageSinceLastService >= serviceInterval - approachingThreshold) {
        status = 'approaching'
      }
    }

    predictionData = {
      predictedMileage: p.predictedMileage,
      avgPerDay: p.avgPerDay,
      lastServiceMileage: p.lastServiceMileage,
      serviceInterval,
      mileageSinceLastService,
      status,
      maintenanceDismissed: result.data.maintenanceDismissed,
      confidencePercent: p.confidencePercent,
    }
  }

  // Check AI enabled
  const orgId = authContext?.organizationId
  let aiEnabled = false
  let safetyAvailable = false
  if (orgId) {
    const [features, aiConfigured, safetyConnection] = await Promise.all([
      getFeatures(orgId),
      // An AI vendor connected in the catalog, or the settings a workshop
      // saved before AI moved there. Nothing is adopted from a page render.
      isAiConfigured(orgId).catch(() => false),
      // An integration must never take the vehicle page down with it: a
      // failed lookup means no panel, nothing more.
      findSafetyConnection(orgId).catch(() => null),
    ])
    // Recall and complaint data needs a safety authority connected and a
    // model to ask about; the panel is left out entirely otherwise.
    safetyAvailable =
      features?.integrations === true &&
      safetyConnection !== null &&
      Boolean(result.data.make && result.data.model && result.data.year)
    aiEnabled = features?.ai === true && aiConfigured
  }

  // Both pages take the same data; the classic one also reads the type
  // filter, the new one the booking warnings.
  const viewProps = {
    vehicle: result.data,
    paginatedServices,
    paginatedNotes,
    serviceSearch: search,
    currencyCode,
    unitSystem,
    predictionData,
    inspections: inspectionsResult.success && inspectionsResult.data ? inspectionsResult.data : [],
    inspectionTemplates:
      templatesResult.success && templatesResult.data ? templatesResult.data : [],
    quotes: quotesResult.success && quotesResult.data ? quotesResult.data : [],
    aiEnabled,
    safetyAvailable,
    paginatedFindings,
    tireSets: tireSetsResult.success && tireSetsResult.data ? tireSetsResult.data : [],
    serviceRecordType: type,
  }

  return (
    <>
      <PageHeader />
      {/* Which layout each visit got, so the classic page can be retired
          once nobody is left on it. */}
      <VehiclePageViewed vehicleId={result.data.id} layout={layout} chosen={layoutChosen} />
      <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
        {classic ? (
          <>
            <TryNewVehiclePageBanner />
            <VehicleDetailClassic {...viewProps} />
          </>
        ) : (
          <VehicleDetailClient
            {...viewProps}
            jobWarnings={
              jobWarningsResult?.success && jobWarningsResult.data ? jobWarningsResult.data : []
            }
            glance={glanceResult?.success && glanceResult.data ? glanceResult.data : null}
            feedNotes={
              feedNotesResult?.success && feedNotesResult.data
                ? feedNotesResult.data.records
                : paginatedNotes.records
            }
          />
        )}
      </div>
    </>
  )
}
