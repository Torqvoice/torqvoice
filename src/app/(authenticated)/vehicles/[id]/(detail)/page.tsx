import { stampServerRender } from '@/components/infinite-list/server-render'
import { resolveCurrencyCode } from '@/lib/currencies'
import { activeMeterTypes, vehicleMeterViews } from '@/features/meters/Lib/meters.server'
import { vehicleEquipmentView } from '@/features/equipment/Lib/equipment.server'
import { workshopTimeZone } from '@/lib/workshop-timezone'
import { zonedDayKey } from '@/lib/timezone'
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
import { getFindingRows } from '@/features/vehicles/Actions/getFindingRows'
import { getNoteRows } from '@/features/vehicles/Actions/getNoteRows'
import { getVehicleServiceRows } from '@/features/vehicles/Actions/getVehicleServiceRows'
import { getVehicleJobWarnings } from '@/features/vehicles/Actions/getVehicleJobWarnings'
import { getVehicleGlance } from '@/features/vehicles/Actions/getVehicleGlance'
import { getVehicleAppointments } from '@/features/calendar/Actions/getVehicleAppointments'
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
import { pageTitle } from '@/lib/page-title'

export function generateMetadata() {
  return pageTitle('vehicleDetails')
}

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
  // The classic page filters its service table; the new one shows the whole
  // history as a feed. See lib/vehicle-page-layout.ts for which. The tables
  // load more as they scroll, so an old ?page= (or notesPage, findingsPage)
  // link is simply ignored.
  const type = typeof sp.type === 'string' ? sp.type : 'all'

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
    serviceBatchResult,
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
    appointmentsResult,
  ] = await Promise.all([
    getVehicle(id),
    // The new page shows the vehicle's history as one feed, so it asks for all
    // of it; a car with more work orders than this is shown its latest ones.
    classic ? null : getServiceRecordsPaginated(id, { page: 1, pageSize: 250, search }),
    // The classic page's table: its first batch, the rest as it scrolls.
    classic ? getVehicleServiceRows({ vehicleId: id, search: search || undefined, type }) : null,
    getNoteRows({ vehicleId: id }),
    getDisplaySettings([SETTING_KEYS.CURRENCY_CODE, SETTING_KEYS.UNIT_SYSTEM]),
    getDisplaySettings([
      SETTING_KEYS.PREDICTED_MAINTENANCE_ENABLED,
      SETTING_KEYS.MAINTENANCE_SERVICE_INTERVAL,
      SETTING_KEYS.MAINTENANCE_APPROACHING_THRESHOLD,
    ]),
    readIfAllowed(access, S.INSPECTIONS, () => getVehicleInspections(id)),
    readIfAllowed(access, S.INSPECTIONS, () => getTemplates()),
    getVehicleQuotes(id),
    getFindingRows({ vehicleId: id }),
    readIfAllowed(access, S.TIRE_HOTEL, () => getTireSetsForVehicle(id)),
    // Asked alongside the rest rather than after it: neither needs the others.
    getVehiclePredictedMileage(id),
    auth,
    // What is wrong with the bookings of the vehicle's open jobs, flagged in
    // the new page's feed so nobody has to open each job to find out.
    classic ? null : readIfAllowed(access, S.WORK_ORDERS, () => getVehicleJobWarnings(id)),
    // The feed searches and shows every note, newest first, so it is not
    // handed the notes table's first batch; the table loads more as it scrolls.
    classic ? null : getNotesPaginated(id, { page: 1, pageSize: FEED_NOTES }),
    // Last visit, next booking and what is owed, over every work order and
    // not only the ones a search has left in the list.
    classic ? null : readIfAllowed(access, S.SERVICES, () => getVehicleGlance(id)),
    // Plain appointments, which have no work order and so are not in the
    // feed: the rail lists them so nobody scrolls the calendar to find one.
    classic ? null : readIfAllowed(access, S.SERVICES, () => getVehicleAppointments(id)),
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
    serviceResult?.success && serviceResult.data
      ? serviceResult.data
      : { records: [], total: 0, page: 1, pageSize: 10, totalPages: 0 }

  const noBatch = { rows: [], nextCursor: null, total: 0 }
  // Stamped with this render, so the tables re-read what they have loaded
  // after a refresh (stampServerRender).
  const serviceBatch = stampServerRender(
    serviceBatchResult?.success && serviceBatchResult.data ? serviceBatchResult.data : noBatch
  )
  const noteBatch = stampServerRender(
    notesResult.success && notesResult.data ? notesResult.data : noBatch
  )
  const findingBatch = stampServerRender(
    findingsResult.success && findingsResult.data ? findingsResult.data : noBatch
  )

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

  // The workshop's meters besides the odometer, and this vehicle's: nothing
  // read at all for a workshop whose plan has no custom fields, and nothing
  // shown for one that has defined no meter.
  const meterTypes = orgId ? await activeMeterTypes(orgId) : []
  const vehicleMeters =
    orgId && meterTypes.length > 0 ? await vehicleMeterViews(orgId, id, meterTypes) : []
  // Its equipment, the same way: nothing read without the plan, nothing shown
  // before the workshop has a type of equipment.
  const equipment = orgId ? await vehicleEquipmentView(orgId, id) : null
  const today = zonedDayKey(new Date(), orgId ? await workshopTimeZone(orgId) : 'UTC')

  // Both pages take the same data; the classic one also reads the type
  // filter, the new one the booking warnings.
  const viewProps = {
    vehicle: result.data,
    noteBatch,
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
    findingBatch,
    tireSets: tireSetsResult.success && tireSetsResult.data ? tireSetsResult.data : [],
    serviceRecordType: type,
    meterTypes,
    vehicleMeters,
    equipment,
    today,
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
            <VehicleDetailClassic {...viewProps} serviceBatch={serviceBatch} />
          </>
        ) : (
          <VehicleDetailClient
            {...viewProps}
            paginatedServices={paginatedServices}
            jobWarnings={
              jobWarningsResult?.success && jobWarningsResult.data ? jobWarningsResult.data : []
            }
            glance={glanceResult?.success && glanceResult.data ? glanceResult.data : null}
            appointments={
              appointmentsResult?.success && appointmentsResult.data ? appointmentsResult.data : []
            }
            feedNotes={
              feedNotesResult?.success && feedNotesResult.data
                ? feedNotesResult.data.records
                : noteBatch.rows
            }
          />
        )}
      </div>
    </>
  )
}
