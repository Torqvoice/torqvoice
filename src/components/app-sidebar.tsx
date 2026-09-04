'use client'

import * as React from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname, useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { signOut, useSession } from '@/lib/auth-client'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
  useSidebar,
} from '@/components/ui/sidebar'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import {
  BarChart3,
  Bell,
  Building2,
  CalendarDays,
  Car,
  Check,
  ChevronsUpDown,
  ClipboardCheck,
  ClipboardList,
  Columns3,
  Disc3,
  FileText,
  History,
  Globe,
  Layers,
  MessageSquare,
  LayoutDashboard,
  Loader2,
  LogOut,
  Monitor,
  Package,
  Palette,
  Plus,
  Receipt,
  Settings,
  Ship,
  ShieldCheck,
  Users,
} from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { switchOrganization } from '@/features/team/Actions/switchOrganization'
import { setLocale } from '@/i18n/actions'
import { locales, localeNames } from '@/i18n/config'
import { createNewOrganization } from '@/features/team/Actions/createNewOrganization'
import type { PlanFeatures } from '@/lib/features'
import { useTheme } from '@/components/theme-provider'
import { THEMES, type ThemePreference } from '@/lib/themes'
import { useServiceType } from '@/components/service-type-context'
import {
  NotificationBell,
  NotificationPanel,
} from '@/features/notifications/Components/NotificationPanel'
import { InstallMenuItem } from '@/components/pwa-install-prompt'
import { FullscreenLauncher, FullscreenMenuItem } from '@/components/fullscreen-toggle'
import { FeatureHint } from '@/components/feature-hint'
import { ANNOUNCEMENTS } from '@/features/settings/Lib/featureHints'
import { cn } from '@/lib/utils'

type OrgInfo = { id: string; name: string; role: string }

/**
 * Live work, counted on the server for the rows that carry a pill.
 *
 * These are things still in hand, never running totals: a total would only
 * ever grow, and a four-digit pill says nothing. Work orders count the ones
 * not yet finished, inspections the ones still being walked, reminders the
 * ones past their date.
 */
export type SidebarCounts = {
  workOrders: number
  inspections: number
  reminders: number
}

type NavItem = {
  titleKey: string
  url: string
  icon: React.ComponentType<{ className?: string }>
  subject: string
  /** Set to point a one-time note at this link the first time it appears. */
  hint?: string
  /** A pill on the row, with the translation key that reads it out. */
  count?: number
  countKey?: string
}

/** Roles the sidebar has a word for; custom roles fall back to the raw name. */
const NAMED_ROLES = new Set(['owner', 'admin', 'member'])

export function AppSidebar({
  companyLogo,
  organizations = [],
  activeOrgId,
  isSuperAdmin,
  features,
  tireHotelEnabled = false,
  isAdminOrOwner = false,
  visibleSubjects,
  announcement = null,
  counts,
  ...props
}: React.ComponentProps<typeof Sidebar> & {
  companyLogo?: string
  organizations?: OrgInfo[]
  activeOrgId?: string
  isSuperAdmin?: boolean
  features?: PlanFeatures
  tireHotelEnabled?: boolean
  isAdminOrOwner?: boolean
  visibleSubjects?: string[]
  /** The one product announcement to show, worked out on the server. */
  announcement?: string | null
  counts?: SidebarCounts
}) {
  const pathname = usePathname()
  const router = useRouter()
  const { data: session } = useSession()
  const { theme, setTheme } = useTheme()
  const { setOpenMobile, isMobile } = useSidebar()
  const currentLocale = useLocale()
  const t = useTranslations('navigation')
  const tHint = useTranslations('featureHints')
  const tSettings = useTranslations('settings')
  const [showCreateOrg, setShowCreateOrg] = React.useState(false)
  const [newOrgName, setNewOrgName] = React.useState('')
  const [creatingOrg, setCreatingOrg] = React.useState(false)

  const serviceType = useServiceType()
  const isMarine = serviceType === 'marine'

  const canAccess = (subject: string) => !visibleSubjects || visibleSubjects.includes(subject)

  const clientItems: NavItem[] = [
    {
      titleKey: 'sidebar.customers' as const,
      url: '/customers',
      icon: Users,
      subject: 'customers',
    },
    {
      titleKey: 'sidebar.messages' as const,
      url: '/messages',
      icon: MessageSquare,
      subject: 'customers',
    },
  ].filter((item) => canAccess(item.subject))

  const workshopItems: NavItem[] = [
    {
      titleKey: isMarine ? ('sidebar.vessels' as const) : ('sidebar.vehicles' as const),
      url: '/vehicles',
      icon: isMarine ? Ship : Car,
      subject: 'vehicles',
    },
    {
      titleKey: 'sidebar.reminders' as const,
      url: '/reminders',
      icon: Bell,
      subject: 'vehicles',
      count: counts?.reminders,
      countKey: 'sidebar.badges.reminders',
    },
    {
      titleKey: 'sidebar.workOrders' as const,
      url: '/work-orders',
      icon: ClipboardList,
      subject: 'work_orders',
      count: counts?.workOrders,
      countKey: 'sidebar.badges.workOrders',
    },
    {
      titleKey: 'sidebar.inspections' as const,
      url: '/inspections',
      icon: ClipboardCheck,
      subject: 'inspections',
      count: counts?.inspections,
      countKey: 'sidebar.badges.inspections',
    },
    {
      titleKey: 'sidebar.calendar' as const,
      url: '/calendar',
      icon: CalendarDays,
      subject: 'work_orders',
    },
    {
      titleKey: 'sidebar.workBoard' as const,
      url: '/work-board',
      icon: Columns3,
      subject: 'work_board',
    },
    // Opt-in module: hidden entirely until the workshop turns it on in
    // settings, and pointed out once when it appears, since a link that shows
    // up on its own is easy to miss.
    ...(tireHotelEnabled
      ? [
          {
            titleKey: 'sidebar.tireHotel' as const,
            url: '/tire-hotel',
            icon: Disc3,
            subject: 'tire_hotel',
            hint: 'tire-hotel.v1',
          },
        ]
      : []),
  ].filter((item) => canAccess(item.subject))

  const businessItems: NavItem[] = [
    { titleKey: 'sidebar.quotes' as const, url: '/quotes', icon: FileText, subject: 'quotes' },
    { titleKey: 'sidebar.billing' as const, url: '/billing', icon: Receipt, subject: 'billing' },
    {
      titleKey: 'sidebar.inventory' as const,
      url: '/inventory',
      icon: Package,
      subject: 'inventory',
    },
    {
      titleKey: 'sidebar.laborPresets' as const,
      url: '/labor-presets',
      icon: Layers,
      subject: 'labor_presets',
    },
    ...(features?.reports !== false && canAccess('reports')
      ? [
          {
            titleKey: 'sidebar.reports' as const,
            url: '/reports',
            icon: BarChart3,
            subject: 'reports',
          },
        ]
      : []),
    {
      titleKey: 'sidebar.auditLog' as const,
      url: '/audit-log',
      icon: History,
      subject: 'settings',
    },
  ].filter((item) => canAccess(item.subject))

  const closeMobileSidebar = () => {
    if (isMobile) setOpenMobile(false)
  }

  /**
   * The Settings link, optionally carrying whichever product announcement the
   * server decided this account should see. Written as one row either way so
   * the announcement cannot drift from the link it points at.
   */
  const settingsRow = () => {
    const row = (highlighted: boolean) => (
      <SidebarMenuItem>
        <SidebarMenuButton
          asChild
          isActive={pathname.startsWith('/settings')}
          tooltip={t('sidebar.settings')}
          className={cn(highlighted && 'ring-2 ring-primary ring-offset-1 ring-offset-sidebar')}
        >
          <Link href="/settings" onClick={closeMobileSidebar}>
            <Settings className="size-4" />
            {t('sidebar.settings')}
          </Link>
        </SidebarMenuButton>
      </SidebarMenuItem>
    )

    const entry = ANNOUNCEMENTS.find((item) => item.id === announcement)
    if (!entry) return row(false)

    const prefix = entry.id.split('.')[0]
    return (
      <FeatureHint
        id={entry.id}
        eligible
        title={tHint(`${prefix}.title`)}
        body={tHint(`${prefix}.body`)}
        cta={tHint(`${prefix}.cta`)}
        href={entry.href}
        // Painted in the accent colour and waiting for a button: the workshop
        // is told once, between all of them, so a stray click elsewhere on the
        // screen must not spend that on everybody's behalf.
        variant="announcement"
        side={isMobile ? 'bottom' : 'right'}
      >
        {(open) => row(open)}
      </FeatureHint>
    )
  }

  const renderNavGroup = (items: NavItem[]) =>
    items.map((item) => {
      const isActive = pathname === item.url || (item.url !== '/' && pathname.startsWith(item.url))
      const count = item.count ?? 0
      const row = (highlighted: boolean) => (
        <SidebarMenuItem key={item.titleKey}>
          <SidebarMenuButton
            asChild
            isActive={isActive}
            tooltip={t(item.titleKey)}
            // Marked while the card is up, so it is obvious which of a dozen
            // links the card is talking about.
            className={cn(
              count > 0 && 'pr-10',
              highlighted && 'ring-2 ring-primary ring-offset-1 ring-offset-sidebar'
            )}
          >
            <Link href={item.url} onClick={closeMobileSidebar}>
              <item.icon className="size-4" />
              {t(item.titleKey)}
            </Link>
          </SidebarMenuButton>
          {count > 0 && item.countKey && (
            <SidebarMenuBadge title={t(item.countKey, { count })}>
              {count > 99 ? '99+' : count}
            </SidebarMenuBadge>
          )}
        </SidebarMenuItem>
      )

      if (!item.hint) return row(false)

      return (
        <FeatureHint
          key={item.titleKey}
          id={item.hint}
          eligible
          title={tHint(`${item.hint.split('.')[0]}.title`)}
          body={tHint(`${item.hint.split('.')[0]}.body`)}
          side={isMobile ? 'bottom' : 'right'}
        >
          {(open) => row(open)}
        </FeatureHint>
      )
    })

  const activeOrg = organizations.find((o) => o.id === activeOrgId) || organizations[0]
  const roleLabel = activeOrg?.role
    ? NAMED_ROLES.has(activeOrg.role)
      ? t(`sidebar.roles.${activeOrg.role}`)
      : activeOrg.role
    : null

  const handleSwitchOrg = async (orgId: string) => {
    await switchOrganization(orgId)
    router.refresh()
  }

  const handleCreateOrg = async () => {
    if (!newOrgName.trim()) return
    setCreatingOrg(true)
    const result = await createNewOrganization({ name: newOrgName.trim() })
    setCreatingOrg(false)
    if (result.success) {
      setShowCreateOrg(false)
      setNewOrgName('')
      router.refresh()
    } else if (result.error) {
      toast.error(result.error)
    }
  }

  const initials = session?.user?.name
    ? session.user.name
        .split(' ')
        .map((n) => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2)
    : '?'

  const handleSignOut = async () => {
    await signOut()
    router.push('/auth/sign-in')
  }

  const dashboardActive = pathname === '/'

  return (
    <Sidebar variant="floating" collapsible="icon" {...props}>
      <FullscreenLauncher />
      <SidebarHeader className="gap-2 p-2 pb-1">
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton
                  size="lg"
                  className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
                >
                  {/* The mark sits in its own bordered tile, so a logo of any
                      shape or colour reads as one deliberate object. */}
                  <div className="flex aspect-square size-9 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-sidebar-border bg-card p-1 group-data-[collapsible=icon]:size-8 group-data-[collapsible=icon]:p-0.5">
                    <Image
                      src={companyLogo || '/torqvoice_app_logo.png'}
                      alt={activeOrg?.name ?? 'Company'}
                      width={32}
                      height={32}
                      unoptimized
                      className="h-auto max-h-full w-auto max-w-full object-contain"
                    />
                  </div>
                  <div className="grid flex-1 text-left leading-tight group-data-[collapsible=icon]:hidden">
                    <span className="truncate font-semibold">
                      {activeOrg?.name ?? t('sidebar.noOrganization')}
                    </span>
                    {roleLabel && (
                      <span className="truncate text-xs text-sidebar-foreground/60">
                        {roleLabel}
                      </span>
                    )}
                  </div>
                  <ChevronsUpDown className="ml-auto size-4 group-data-[collapsible=icon]:hidden" />
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                className="w-[--radix-dropdown-menu-trigger-width] min-w-56 rounded-lg"
                side="bottom"
                align="start"
                sideOffset={4}
              >
                <DropdownMenuLabel className="text-xs text-muted-foreground">
                  {t('sidebar.organizations')}
                </DropdownMenuLabel>
                {organizations.map((org) => (
                  <DropdownMenuItem
                    key={org.id}
                    onClick={() => handleSwitchOrg(org.id)}
                    className="gap-2"
                  >
                    <Building2 className="size-4" />
                    <span className="flex-1">{org.name}</span>
                    {org.id === activeOrg?.id && <Check className="ml-auto size-4" />}
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => setShowCreateOrg(true)} className="gap-2">
                  <Plus className="size-4" />
                  <span>{t('sidebar.addNewCompany')}</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
          {/* The one filled button in the sidebar: the action a workshop
              reaches for most, kept where it is never scrolled away. */}
          {canAccess('work_orders') && (
            <SidebarMenuItem>
              <SidebarMenuButton
                asChild
                tooltip={t('sidebar.newWorkOrder')}
                className="justify-center bg-sidebar-primary font-medium text-sidebar-primary-foreground shadow-xs hover:bg-sidebar-primary/90 hover:text-sidebar-primary-foreground active:bg-sidebar-primary/90 active:text-sidebar-primary-foreground [&>svg]:text-sidebar-primary-foreground hover:[&>svg]:text-sidebar-primary-foreground"
              >
                <Link href="/work-orders?new=1" onClick={closeMobileSidebar}>
                  <Plus className="size-4" />
                  <span className="group-data-[collapsible=icon]:hidden">
                    {t('sidebar.newWorkOrder')}
                  </span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          )}
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent className="gap-0">
        {/* Dashboard */}
        {canAccess('dashboard') && (
          <SidebarGroup className="pb-0">
            <SidebarMenu className="gap-1">
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={dashboardActive}
                  tooltip={t('sidebar.dashboard')}
                >
                  <Link href="/" onClick={closeMobileSidebar}>
                    <LayoutDashboard className="size-4" />
                    {t('sidebar.dashboard')}
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroup>
        )}

        {/* Clients */}
        {clientItems.length > 0 && (
          <SidebarGroup>
            <SidebarGroupLabel>{t('sidebar.clients')}</SidebarGroupLabel>
            <SidebarMenu className="gap-1">{renderNavGroup(clientItems)}</SidebarMenu>
          </SidebarGroup>
        )}

        {/* Workshop */}
        {workshopItems.length > 0 && (
          <SidebarGroup>
            <SidebarGroupLabel>{t('sidebar.workshop')}</SidebarGroupLabel>
            <SidebarMenu className="gap-1">{renderNavGroup(workshopItems)}</SidebarMenu>
          </SidebarGroup>
        )}

        {/* Business */}
        {businessItems.length > 0 && (
          <SidebarGroup>
            <SidebarGroupLabel>{t('sidebar.business')}</SidebarGroupLabel>
            <SidebarMenu className="gap-1">{renderNavGroup(businessItems)}</SidebarMenu>
          </SidebarGroup>
        )}

        {/* Settings, set apart from the page groups above it */}
        {canAccess('settings') && (
          <>
            <SidebarSeparator className="mt-2" />
            <SidebarGroup>
              <SidebarMenu className="gap-1">
                {/* Product announcements hang off Settings: everything they
                    point at so far lives behind it, and it is the one link on
                    the screen that is never scrolled away or filtered out by a
                    role. Which one is worth showing was decided on the server,
                    so this only says where the card goes. */}
                {settingsRow()}
              </SidebarMenu>
            </SidebarGroup>
          </>
        )}

        {isSuperAdmin && (
          <SidebarGroup>
            <SidebarGroupLabel>{t('sidebar.superAdmin')}</SidebarGroupLabel>
            <SidebarMenu className="gap-1">
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={pathname.startsWith('/admin')}
                  tooltip={t('sidebar.adminPanel')}
                >
                  <Link href="/admin" onClick={closeMobileSidebar}>
                    <ShieldCheck className="size-4" />
                    {t('sidebar.adminPanel')}
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroup>
        )}
      </SidebarContent>
      <SidebarFooter className="border-t border-sidebar-border p-2">
        <SidebarMenu>
          <SidebarMenuItem className="flex items-center gap-1 group-data-[collapsible=icon]:flex-col">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton
                  size="lg"
                  className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
                >
                  <Avatar className="size-8 rounded-full">
                    <AvatarFallback className="rounded-full bg-sidebar-primary/15 text-xs font-semibold text-sidebar-foreground">
                      {initials}
                    </AvatarFallback>
                  </Avatar>
                  <div className="grid flex-1 text-left text-sm leading-tight">
                    <span className="truncate font-medium">{session?.user?.name}</span>
                    <span className="truncate text-xs text-sidebar-foreground/60">
                      {session?.user?.email}
                    </span>
                  </div>
                  <ChevronsUpDown className="ml-auto size-4" />
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                className="w-[--radix-dropdown-menu-trigger-width] min-w-56 rounded-lg"
                side="top"
                align="start"
                sideOffset={4}
              >
                {canAccess('settings') && (
                  <DropdownMenuItem asChild>
                    <Link href="/settings">
                      <Settings className="mr-2 size-4" />
                      {t('sidebar.settings')}
                    </Link>
                  </DropdownMenuItem>
                )}
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>
                    <Palette className="mr-2 size-4" />
                    {t('sidebar.theme')}
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent>
                    <DropdownMenuRadioGroup
                      value={theme}
                      onValueChange={(value) => setTheme(value as ThemePreference)}
                    >
                      {THEMES.map((definition) => (
                        <DropdownMenuRadioItem key={definition.id} value={definition.id}>
                          {/* Split dot: the theme's own background on one half,
                              its primary on the other, so light and dark
                              variants of the same hue stay tellable apart */}
                          <span
                            className="mr-2 size-3.5 shrink-0 rounded-full border"
                            style={{
                              background: `linear-gradient(135deg, ${definition.swatch[0]} 0 50%, ${definition.swatch[2]} 50% 100%)`,
                            }}
                          />
                          {tSettings(`appearance.themes.${definition.id}`)}
                        </DropdownMenuRadioItem>
                      ))}
                      <DropdownMenuRadioItem value="system">
                        <Monitor className="mr-2 size-3.5 shrink-0" />
                        {tSettings('appearance.themes.system')}
                      </DropdownMenuRadioItem>
                    </DropdownMenuRadioGroup>
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>
                    <Globe className="mr-2 size-4" />
                    {localeNames[currentLocale as keyof typeof localeNames] ?? currentLocale}
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent>
                    <DropdownMenuRadioGroup
                      value={currentLocale}
                      onValueChange={async (value) => {
                        await setLocale(value)
                        router.refresh()
                      }}
                    >
                      {locales.map((loc) => (
                        <DropdownMenuRadioItem key={loc} value={loc}>
                          {localeNames[loc]}
                        </DropdownMenuRadioItem>
                      ))}
                    </DropdownMenuRadioGroup>
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
                {/* Device conveniences, out of the navigation where they
                    used to pass for pages. Each renders nothing where it
                    does not apply. */}
                <InstallMenuItem />
                <FullscreenMenuItem />
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleSignOut}>
                  <LogOut className="mr-2 size-4" />
                  {t('sidebar.signOut')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            {isAdminOrOwner && <NotificationBell />}
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>

      {isAdminOrOwner && <NotificationPanel />}

      <Dialog open={showCreateOrg} onOpenChange={setShowCreateOrg}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('sidebar.addNewCompany')}</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              handleCreateOrg()
            }}
            className="space-y-4"
          >
            <div className="space-y-2">
              <Label htmlFor="sidebar-org-name">{t('sidebar.companyName')}</Label>
              <Input
                id="sidebar-org-name"
                placeholder={t('sidebar.companyPlaceholder')}
                value={newOrgName}
                onChange={(e) => setNewOrgName(e.target.value)}
                autoFocus
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setShowCreateOrg(false)}>
                {t('sidebar.cancel')}
              </Button>
              <Button type="submit" disabled={creatingOrg || !newOrgName.trim()}>
                {creatingOrg && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {t('sidebar.createCompany')}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </Sidebar>
  )
}
