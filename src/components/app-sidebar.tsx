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
  SidebarMenuButton,
  SidebarMenuItem,
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
import { SidebarInstallButton } from '@/components/pwa-install-prompt'
import { FullscreenToggle } from '@/components/fullscreen-toggle'
import { FeatureHint } from '@/components/feature-hint'
import { ANNOUNCEMENTS } from '@/features/settings/Lib/featureHints'
import { cn } from '@/lib/utils'

type OrgInfo = { id: string; name: string; role: string }

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

  const clientItems = [
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

  const workshopItems = [
    {
      titleKey: isMarine ? ('sidebar.vessels' as const) : ('sidebar.vehicles' as const),
      url: '/vehicles',
      icon: isMarine ? Ship : Car,
      subject: 'vehicles',
    },
    { titleKey: 'sidebar.reminders' as const, url: '/reminders', icon: Bell, subject: 'vehicles' },
    {
      titleKey: 'sidebar.workOrders' as const,
      url: '/work-orders',
      icon: ClipboardList,
      subject: 'work_orders',
    },
    {
      titleKey: 'sidebar.inspections' as const,
      url: '/inspections',
      icon: ClipboardCheck,
      subject: 'inspections',
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

  const businessItems = [
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
          className={cn(highlighted && 'ring-2 ring-primary ring-offset-1 ring-offset-sidebar')}
        >
          <Link href="/settings" className="font-medium" onClick={closeMobileSidebar}>
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

  const renderNavGroup = (
    items: {
      titleKey: string
      url: string
      icon: React.ComponentType<{ className?: string }>
      /** Set to point a one-time note at this link the first time it appears. */
      hint?: string
    }[]
  ) =>
    items.map((item) => {
      const isActive = pathname === item.url || (item.url !== '/' && pathname.startsWith(item.url))
      const row = (highlighted: boolean) => (
        <SidebarMenuItem key={item.titleKey}>
          <SidebarMenuButton
            asChild
            isActive={isActive}
            // Marked while the card is up, so it is obvious which of a dozen
            // links the card is talking about.
            className={cn(highlighted && 'ring-2 ring-primary ring-offset-1 ring-offset-sidebar')}
          >
            <Link href={item.url} className="font-medium" onClick={closeMobileSidebar}>
              <item.icon className="size-4" />
              {t(item.titleKey)}
            </Link>
          </SidebarMenuButton>
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
    <Sidebar variant="floating" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem className="flex items-center gap-1">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton
                  size="lg"
                  className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
                >
                  <div className="flex aspect-square size-12 items-center justify-center overflow-hidden rounded-lg">
                    <Image
                      src={companyLogo || '/torqvoice_app_logo.png'}
                      alt={activeOrg?.name ?? 'Company'}
                      width={38}
                      height={38}
                      unoptimized
                      className="h-auto w-auto object-contain"
                    />
                  </div>
                  <div className="flex flex-col gap-0.5 leading-none">
                    <span className="font-semibold">
                      {activeOrg?.name ?? t('sidebar.noOrganization')}
                    </span>
                  </div>
                  <ChevronsUpDown className="ml-auto size-4" />
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
            {isAdminOrOwner && <NotificationBell />}
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        {/* Dashboard */}
        {canAccess('dashboard') && (
          <SidebarGroup>
            <SidebarMenu className="gap-2">
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={dashboardActive}>
                  <Link href="/" className="font-medium" onClick={closeMobileSidebar}>
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
            <SidebarMenu className="gap-2">{renderNavGroup(clientItems)}</SidebarMenu>
          </SidebarGroup>
        )}

        {/* Workshop */}
        {workshopItems.length > 0 && (
          <SidebarGroup>
            <SidebarGroupLabel>{t('sidebar.workshop')}</SidebarGroupLabel>
            <SidebarMenu className="gap-2">{renderNavGroup(workshopItems)}</SidebarMenu>
          </SidebarGroup>
        )}

        {/* Business */}
        {businessItems.length > 0 && (
          <SidebarGroup>
            <SidebarGroupLabel>{t('sidebar.business')}</SidebarGroupLabel>
            <SidebarMenu className="gap-2">{renderNavGroup(businessItems)}</SidebarMenu>
          </SidebarGroup>
        )}

        {/* Settings */}
        {canAccess('settings') && (
          <SidebarGroup>
            <SidebarMenu className="gap-2">
              {/* Product announcements hang off Settings: everything they
                  point at so far lives behind it, and it is the one link on
                  the screen that is never scrolled away or filtered out by a
                  role. Which one is worth showing was decided on the server,
                  so this only says where the card goes. */}
              {settingsRow()}
            </SidebarMenu>
          </SidebarGroup>
        )}

        {isSuperAdmin && (
          <SidebarGroup>
            <SidebarGroupLabel>{t('sidebar.superAdmin')}</SidebarGroupLabel>
            <SidebarMenu className="gap-2">
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={pathname.startsWith('/admin')}>
                  <Link href="/admin" className="font-medium" onClick={closeMobileSidebar}>
                    <ShieldCheck className="size-4" />
                    {t('sidebar.adminPanel')}
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroup>
        )}
        <SidebarInstallButton />
        <FullscreenToggle />
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton
                  size="lg"
                  className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
                >
                  <Avatar className="size-8 rounded-lg">
                    <AvatarFallback className="rounded-lg bg-sidebar-primary/10 text-xs font-semibold text-sidebar-primary">
                      {initials}
                    </AvatarFallback>
                  </Avatar>
                  <div className="grid flex-1 text-left text-sm leading-tight">
                    <span className="truncate font-semibold">{session?.user?.name}</span>
                    <span className="truncate text-xs text-muted-foreground">
                      {session?.user?.email}
                    </span>
                  </div>
                  <ChevronsUpDown className="ml-auto size-4" />
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                className="w-[--radix-dropdown-menu-trigger-width] min-w-56 rounded-lg"
                side="bottom"
                align="end"
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
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleSignOut}>
                  <LogOut className="mr-2 size-4" />
                  {t('sidebar.signOut')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
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
