import { redirect } from 'next/navigation'
import { NoAccess } from './no-access'
import { AppSidebar } from '@/components/app-sidebar'
import { FeatureHintProvider } from '@/components/feature-hint'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import { cookies } from 'next/headers'
import { SearchCommand } from '@/features/search/Components/SearchCommand'
import { NotificationInitializer } from '@/features/notifications/Components/NotificationInitializer'
import { ConfirmProvider } from '@/components/confirm-dialog'
import { getLayoutData } from '@/lib/get-layout-data'
import { SETTING_KEYS } from '@/features/settings/Schema/settingsSchema'
import { announcementsToShow, parseHintIds } from '@/features/settings/Lib/featureHints'
import { getFeatures, isCloudMode } from '@/lib/features'
import { WhiteLabelCtaProvider } from '@/components/white-label-cta-context'
import { DateSettingsProvider } from '@/components/date-settings-context'
import { UpdateBanner } from '@/components/update-banner'
import { BroadcastLive } from '@/components/broadcast-live'
import { CurrencySettingsProvider } from '@/components/currency-settings-context'
import { getCachedMembership } from '@/lib/cached-session'
import { hasPermission, PermissionAction, PermissionSubject } from '@/lib/permissions'
import { OnlineTracker } from '@/components/online-tracker'
import { InstallBanner } from '@/components/pwa-install-prompt'
import { MobileBottomNav } from '@/components/mobile-bottom-nav'
import { SupportBubble } from '@/features/support/Components/SupportBubble'
import { isSupportEnabled } from '@/lib/support'
import { ServiceTypeProvider } from '@/components/service-type-context'
import { LicenseExpiryProvider } from '@/components/license-expiry-context'
import { db } from '@/lib/db'
import { isDemoMode } from '@/lib/demo'
import { isTireHotelEnabled } from '@/features/tire-hotel/Lib/tireHotelSettings'
import { findLookupConnection } from '@/features/integrations/Lib/vehicle-lookup'
import { getManifest } from '@/integrations/registry'
import { PlateLookupProvider } from '@/components/plate-lookup-context'
import { PlateLookupCommand } from '@/features/vehicles/Components/PlateLookupCommand'
import { OPEN_SERVICE_STATUSES } from '@/lib/service-record'
import { addZonedDays, safeTimeZone, startOfZonedDay } from '@/lib/timezone'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const data = await getLayoutData()
  // Render the sidebar in its saved state from the first paint: without this
  // the server always renders it expanded, and collapsed-sidebar users get a
  // ~300px layout shift after hydration (which also mismeasured the
  // dashboard grid).
  const sidebarOpen = (await cookies()).get('sidebar_state')?.value !== 'false'

  if (data.status === 'unauthenticated') redirect('/auth/sign-in')
  if (data.status === 'no-organization') redirect('/onboarding')

  // Check email verification requirement (super admins bypass this)
  if (!data.isSuperAdmin && !data.emailVerified) {
    const verificationSetting = await db.systemSetting.findUnique({
      where: { key: 'email.verificationRequired' },
      select: { value: true },
    })
    if (verificationSetting?.value === 'true') {
      redirect('/auth/verify-email')
    }
  }

  const features = await getFeatures(data.organizationId)
  const showWhiteLabelCta = !isCloudMode() && !features.brandingRemoved && !isDemoMode
  // Cloud only, and off until a platform admin turns it on. Resolved here so
  // the widget's code never reaches a self-hosted install's page.
  const supportEnabled = await isSupportEnabled()

  // Tire hotel is opt-in, so the nav entry only exists once a workshop has
  // switched the module on.
  const tireHotelEnabled = await isTireHotelEnabled(data.organizationId)

  // Read here so the first paint already knows, and a hint that was dismissed
  // months ago never flashes up before the client can suppress it.
  const hintRows = await db.appSetting.findMany({
    where: {
      organizationId: data.organizationId,
      key: { in: [SETTING_KEYS.FEATURE_HINTS_SEEN, SETTING_KEYS.FEATURE_HINTS_PENDING] },
    },
    select: { key: true, value: true },
  })
  const hintValues = new Map(hintRows.map((row) => [row.key, row.value]))
  const seenHints = parseHintIds(hintValues.get(SETTING_KEYS.FEATURE_HINTS_SEEN))
  const pendingHints = parseHintIds(hintValues.get(SETTING_KEYS.FEATURE_HINTS_PENDING))

  // Determine which subjects the user can access (for sidebar visibility)
  const isOwnerOrAdmin =
    data.role === 'owner' || data.role === 'admin' || data.role === 'super_admin'
  const allSubjects = Object.values(PermissionSubject)
  let visibleSubjects: string[] = allSubjects

  /**
   * Whether this account can reach anything at all.
   *
   * Kept separate from what the sidebar shows, because the two answer
   * different questions and conflating them is what made a roleless account
   * look like a broken product: the nav offered every screen and every screen
   * refused, one at a time.
   */
  let hasAnyAccess = true
  /** Whether the plate lookup may offer to add a vehicle it did not find. */
  let canCreateVehicles = true

  if (!isOwnerOrAdmin) {
    const membership = await getCachedMembership(data.userId)
    // Members without a custom role have full access
    if (membership?.roleId) {
      const userPermissions = membership?.customRole?.permissions ?? []
      visibleSubjects = allSubjects.filter((subject) =>
        hasPermission(userPermissions, {
          action: PermissionAction.READ,
          subject: subject as PermissionSubject,
        })
      )
      canCreateVehicles = hasPermission(userPermissions, {
        action: PermissionAction.CREATE,
        subject: PermissionSubject.VEHICLES,
      })
      // A role that grants nothing readable. Every page behind the nav would
      // answer "Your role does not allow this", so say it once instead.
      hasAnyAccess = visibleSubjects.length > 0
    }
  }

  if (!hasAnyAccess) {
    const org = data.organizations.find((o) => o.id === data.organizationId)
    return <NoAccess organizationName={org?.name ?? ''} />
  }

  // Live work for the sidebar pills. Each is a count of things still in hand,
  // never a running total, so the numbers stay small enough to mean
  // something. Only the screens this role can see are counted at all.
  const timeZone = safeTimeZone(data.timezone)
  const endOfToday = startOfZonedDay(addZonedDays(new Date(), 1, timeZone), timeZone)
  const [openWorkOrders, activeInspections, dueReminders] = await Promise.all([
    visibleSubjects.includes(PermissionSubject.WORK_ORDERS)
      ? db.serviceRecord.count({
          where: {
            organizationId: data.organizationId,
            status: { in: [...OPEN_SERVICE_STATUSES] },
          },
        })
      : 0,
    visibleSubjects.includes(PermissionSubject.INSPECTIONS)
      ? db.inspection.count({
          where: { organizationId: data.organizationId, status: 'in_progress' },
        })
      : 0,
    visibleSubjects.includes(PermissionSubject.VEHICLES)
      ? db.reminder.count({
          where: {
            organizationId: data.organizationId,
            isCompleted: false,
            dueDate: { lt: endOfToday },
          },
        })
      : 0,
  ])
  const sidebarCounts = {
    workOrders: openWorkOrders,
    inspections: activeInspections,
    reminders: dueReminders,
  }

  // Product announcements join the same queue as the hints a setting flip
  // raises, so only ever one card shows. They are worked out per request
  // rather than stored, because who may be told depends on the account
  // reading the page, not on anything written when the feature shipped.
  const announcements = announcementsToShow({
    organizationCreatedAt: data.organizationCreatedAt,
    visibleSubjects: isOwnerOrAdmin ? undefined : visibleSubjects,
    features,
    seen: seenHints,
  })

  // The header offers a plate lookup once a vehicle registry is connected.
  // Resolved here so the first paint knows, rather than a button appearing a
  // beat after the page does.
  const lookupConnection =
    features.integrations && visibleSubjects.includes(PermissionSubject.VEHICLES)
      ? await findLookupConnection(data.organizationId)
      : null
  const plateLookupAvailable = lookupConnection !== null
  const plateLookupRegistry = lookupConnection
    ? (getManifest(lookupConnection.connectorId)?.name ?? null)
    : null

  // Check license expiry (only for admin/owner with white-label)
  let daysUntilExpiry: number | null = null
  let licenseExpiryDismissed = false
  if (isOwnerOrAdmin && features.brandingRemoved) {
    const expirySettings = await db.appSetting.findMany({
      where: {
        organizationId: data.organizationId,
        key: { in: ['license.expiresAt', 'license.valid', 'license.expiryDismissed'] },
      },
      select: { key: true, value: true },
    })
    const expiryMap = new Map(expirySettings.map((s) => [s.key, s.value]))
    const expiresAt = expiryMap.get('license.expiresAt')
    const isValid = expiryMap.get('license.valid')
    licenseExpiryDismissed = expiryMap.get('license.expiryDismissed') === 'true'
    if (expiresAt && isValid === 'true') {
      const diff = new Date(expiresAt).getTime() - Date.now()
      daysUntilExpiry = Math.ceil(diff / (1000 * 60 * 60 * 24))
    }
  }

  return (
    <ServiceTypeProvider serviceType={data.serviceType}>
      <LicenseExpiryProvider daysUntilExpiry={daysUntilExpiry} dismissed={licenseExpiryDismissed}>
        <WhiteLabelCtaProvider show={showWhiteLabelCta}>
          {/* Accent line along the very top of the viewport — the card hairline at
        page scale: primary on the left, gone by the far edge. Marks where the
        app begins against the browser chrome. */}
          <div
            aria-hidden
            className="pointer-events-none fixed inset-x-0 top-0 z-50 h-px bg-linear-to-r from-primary via-primary/35 to-transparent"
          />
          {/* Watches for a notice posted while this page is already open. Here
              rather than beside the banner because the socket authenticates on
              the session cookie, which the sign-in page does not have. */}
          <BroadcastLive />
          {/* The demo banner already occupies the header, and demo image tags
        (demo-abc1234) are not versions a visitor should be notified about. */}
          {!isDemoMode && (
            <UpdateBanner
              currentVersion={process.env.APP_VERSION || 'development'}
              lastSeenVersion={data.lastSeenVersion}
              releaseNotesUrl={
                process.env.RELEASE_NOTES_URL || 'https://github.com/Torqvoice/torqvoice/releases'
              }
            />
          )}
          <SidebarProvider
            defaultOpen={sidebarOpen}
            style={
              {
                '--sidebar-width': '19rem',
              } as React.CSSProperties
            }
          >
            <DateSettingsProvider
              dateFormat={data.dateFormat}
              timeFormat={data.timeFormat}
              timezone={data.timezone}
              weekStartDay={data.weekStartDay}
            >
              <CurrencySettingsProvider
                currencyCode={data.currencyCode}
                currencyFormat={data.currencyFormat}
              >
                <ConfirmProvider>
                  <PlateLookupProvider
                    value={{
                      available: plateLookupAvailable,
                      canCreate: canCreateVehicles,
                      registryName: plateLookupRegistry,
                    }}
                  >
                    <FeatureHintProvider
                      initialSeen={seenHints}
                      pending={[...pendingHints, ...announcements]}
                    >
                      <AppSidebar
                        companyLogo={data.companyLogo}
                        organizations={data.organizations}
                        activeOrgId={data.organizationId}
                        isSuperAdmin={data.isSuperAdmin}
                        features={features}
                        tireHotelEnabled={tireHotelEnabled}
                        visibleSubjects={visibleSubjects}
                        announcement={announcements[0] ?? null}
                        isAdminOrOwner={isOwnerOrAdmin}
                        counts={sidebarCounts}
                      />
                      <SidebarInset>
                        {/* A flex column with a real height, so the `flex-1` every
                          page already writes on its wrapper actually resolves.
                          Without it a page that wants to fill the window (the
                          work board's week timeline) stopped at its content and
                          left the rest of the screen blank. */}
                        <div className="flex min-h-0 flex-1 flex-col pb-14 md:pb-0">{children}</div>
                      </SidebarInset>
                      <SearchCommand />
                      <PlateLookupCommand />
                      {isOwnerOrAdmin && <NotificationInitializer />}
                      <OnlineTracker />
                      <InstallBanner />
                    </FeatureHintProvider>
                  </PlateLookupProvider>
                </ConfirmProvider>
              </CurrencySettingsProvider>
            </DateSettingsProvider>
          </SidebarProvider>
          <MobileBottomNav isSuperAdmin={data.isSuperAdmin} tireHotelEnabled={tireHotelEnabled} />
          {supportEnabled && <SupportBubble />}
        </WhiteLabelCtaProvider>
      </LicenseExpiryProvider>
    </ServiceTypeProvider>
  )
}
