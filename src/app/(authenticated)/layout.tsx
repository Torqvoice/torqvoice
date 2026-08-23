import { redirect } from 'next/navigation'
import { AppSidebar } from '@/components/app-sidebar'
import { FeatureHintProvider } from '@/components/feature-hint'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import { cookies } from 'next/headers'
import { SearchCommand } from '@/features/search/Components/SearchCommand'
import { NotificationInitializer } from '@/features/notifications/Components/NotificationInitializer'
import { ConfirmProvider } from '@/components/confirm-dialog'
import { getLayoutData } from '@/lib/get-layout-data'
import { SETTING_KEYS } from '@/features/settings/Schema/settingsSchema'
import { parseHintIds } from '@/features/settings/Lib/featureHints'
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
    }
  }

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
                  <FeatureHintProvider initialSeen={seenHints} pending={pendingHints}>
                    <AppSidebar
                      companyLogo={data.companyLogo}
                      organizations={data.organizations}
                      activeOrgId={data.organizationId}
                      isSuperAdmin={data.isSuperAdmin}
                      features={features}
                      tireHotelEnabled={tireHotelEnabled}
                      visibleSubjects={visibleSubjects}
                      isAdminOrOwner={isOwnerOrAdmin}
                    />
                    <SidebarInset>
                      <div className="pb-14 md:pb-0">{children}</div>
                    </SidebarInset>
                    <SearchCommand />
                    {isOwnerOrAdmin && <NotificationInitializer />}
                    <OnlineTracker />
                    <InstallBanner />
                  </FeatureHintProvider>
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
