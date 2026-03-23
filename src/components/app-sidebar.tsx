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
  FileText,
  History,
  Globe,
  Layers,
  MessageSquare,
  Send,
  LayoutDashboard,
  Loader2,
  LogOut,
  Moon,
  Package,
  Plus,
  Receipt,
  Settings,
  ShieldCheck,
  Sun,
  Users,
} from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { switchOrganization } from '@/features/team/Actions/switchOrganization'
import { setLocale } from '@/i18n/actions'
import { locales, localeNames } from '@/i18n/config'
import { createNewOrganization } from '@/features/team/Actions/createNewOrganization'
import type { PlanFeatures } from '@/lib/features'
import { useTheme } from '@/components/theme-provider'
import { NotificationBell, NotificationPanel } from '@/features/notifications/Components/NotificationPanel'
import { SidebarInstallButton } from '@/components/pwa-install-prompt'

type OrgInfo = { id: string; name: string; role: string }

export function AppSidebar({
  companyLogo,
  organizations = [],
  activeOrgId,
  isSuperAdmin,
  features,
  isAdminOrOwner = false,
  visibleSubjects,
  ...props
}: React.ComponentProps<typeof Sidebar> & {
  companyLogo?: string
  organizations?: OrgInfo[]
  activeOrgId?: string
  isSuperAdmin?: boolean
  features?: PlanFeatures
  isAdminOrOwner?: boolean
  visibleSubjects?: string[]
}) {
  const pathname = usePathname()
  const router = useRouter()
  const { data: session } = useSession()
  const { theme, setTheme } = useTheme()
  const { setOpenMobile, isMobile } = useSidebar()
  const currentLocale = useLocale()
  const t = useTranslations('navigation')
  const [showCreateOrg, setShowCreateOrg] = React.useState(false)
  const [newOrgName, setNewOrgName] = React.useState('')
  const [creatingOrg, setCreatingOrg] = React.useState(false)

  const canAccess = (subject: string) => !visibleSubjects || visibleSubjects.includes(subject)

  const clientItems = [
    { titleKey: 'sidebar.customers' as const, url: '/customers', icon: Users, subject: 'customers' },
    ...(features?.sms ? [{ titleKey: 'sidebar.smsMessages' as const, url: '/messages', icon: MessageSquare, subject: 'customers' }] : []),
    ...(features?.telegram ? [{ titleKey: 'sidebar.telegram' as const, url: '/telegram', icon: Send, subject: 'customers' }] : []),
  ].filter((item) => canAccess(item.subject))

  const workshopItems = [
    { titleKey: 'sidebar.vehicles' as const, url: '/vehicles', icon: Car, subject: 'vehicles' },
    { titleKey: 'sidebar.reminders' as const, url: '/reminders', icon: Bell, subject: 'vehicles' },
    { titleKey: 'sidebar.workOrders' as const, url: '/work-orders', icon: ClipboardList, subject: 'work_orders' },
    { titleKey: 'sidebar.inspections' as const, url: '/inspections', icon: ClipboardCheck, subject: 'inspections' },
    { titleKey: 'sidebar.calendar' as const, url: '/calendar', icon: CalendarDays, subject: 'work_orders' },
    { titleKey: 'sidebar.workBoard' as const, url: '/work-board', icon: Columns3, subject: 'work_board' },
  ].filter((item) => canAccess(item.subject))

  const businessItems = [
    { titleKey: 'sidebar.quotes' as const, url: '/quotes', icon: FileText, subject: 'quotes' },
    { titleKey: 'sidebar.billing' as const, url: '/billing', icon: Receipt, subject: 'billing' },
    { titleKey: 'sidebar.inventory' as const, url: '/inventory', icon: Package, subject: 'inventory' },
    { titleKey: 'sidebar.laborPresets' as const, url: '/labor-presets', icon: Layers, subject: 'labor_presets' },
    ...(features?.reports !== false && canAccess('reports') ? [{ titleKey: 'sidebar.reports' as const, url: '/reports', icon: BarChart3, subject: 'reports' }] : []),
    { titleKey: 'sidebar.auditLog' as const, url: '/audit-log', icon: History, subject: 'settings' },
  ].filter((item) => canAccess(item.subject))

  const closeMobileSidebar = () => {
    if (isMobile) setOpenMobile(false)
  }

  const renderNavGroup = (items: { titleKey: string; url: string; icon: React.ComponentType<{ className?: string }> }[]) =>
    items.map((item) => {
      const isActive = pathname === item.url || (item.url !== '/' && pathname.startsWith(item.url))
      return (
        <SidebarMenuItem key={item.titleKey}>
          <SidebarMenuButton asChild isActive={isActive}>
            <Link href={item.url} className="font-medium" onClick={closeMobileSidebar}>
              <item.icon className="size-4" />
              {t(item.titleKey)}
            </Link>
          </SidebarMenuButton>
        </SidebarMenuItem>
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
                      className="object-contain"
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
            <SidebarMenu className="gap-2">
              {renderNavGroup(clientItems)}
            </SidebarMenu>
          </SidebarGroup>
        )}

        {/* Workshop */}
        {workshopItems.length > 0 && (
          <SidebarGroup>
            <SidebarGroupLabel>{t('sidebar.workshop')}</SidebarGroupLabel>
            <SidebarMenu className="gap-2">
              {renderNavGroup(workshopItems)}
            </SidebarMenu>
          </SidebarGroup>
        )}

        {/* Business */}
        {businessItems.length > 0 && (
          <SidebarGroup>
            <SidebarGroupLabel>{t('sidebar.business')}</SidebarGroupLabel>
            <SidebarMenu className="gap-2">
              {renderNavGroup(businessItems)}
            </SidebarMenu>
          </SidebarGroup>
        )}

        {/* Settings */}
        {canAccess('settings') && (
          <SidebarGroup>
            <SidebarMenu className="gap-2">
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={pathname.startsWith('/settings')}>
                  <Link href="/settings" className="font-medium" onClick={closeMobileSidebar}>
                    <Settings className="size-4" />
                    {t('sidebar.settings')}
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
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
                <DropdownMenuItem onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
                  {theme === 'dark' ? (
                    <Sun className="mr-2 size-4" />
                  ) : (
                    <Moon className="mr-2 size-4" />
                  )}
                  {theme === 'dark' ? t('sidebar.lightMode') : t('sidebar.darkMode')}
                </DropdownMenuItem>
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
