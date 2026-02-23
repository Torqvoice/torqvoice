'use client'

import * as React from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname, useRouter } from 'next/navigation'
import { signOut, useSession } from '@/lib/auth-client'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
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
} from '@/components/ui/sidebar'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import {
  BarChart3,
  Building2,
  CalendarDays,
  Car,
  Check,
  ChevronsUpDown,
  ClipboardCheck,
  ClipboardList,
  Columns3,
  FileText,
  MessageSquare,
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
import { switchOrganization } from '@/features/team/Actions/switchOrganization'
import { createNewOrganization } from '@/features/team/Actions/createNewOrganization'
import type { PlanFeatures } from '@/lib/features'
import { useTheme } from '@/components/theme-provider'
import { NotificationBell, NotificationPanel } from '@/features/notifications/Components/NotificationPanel'

const adminNavItems = [{ title: 'Admin Panel', url: '/admin', icon: ShieldCheck }]

type OrgInfo = { id: string; name: string; role: string }

export function AppSidebar({
  companyLogo,
  organizations = [],
  activeOrgId,
  isSuperAdmin,
  features,
  canAccessSettings = true,
  canAccessReports = true,
  isAdminOrOwner = false,
  ...props
}: React.ComponentProps<typeof Sidebar> & {
  companyLogo?: string
  organizations?: OrgInfo[]
  activeOrgId?: string
  isSuperAdmin?: boolean
  features?: PlanFeatures
  canAccessSettings?: boolean
  canAccessReports?: boolean
  isAdminOrOwner?: boolean
}) {
  const pathname = usePathname()
  const router = useRouter()
  const { data: session } = useSession()
  const { theme, setTheme } = useTheme()
  const [showCreateOrg, setShowCreateOrg] = React.useState(false)
  const [newOrgName, setNewOrgName] = React.useState('')
  const [creatingOrg, setCreatingOrg] = React.useState(false)

  const showReports = features?.reports !== false && canAccessReports

  const clientItems = [
    { title: 'Customers', url: '/customers', icon: Users },
    { title: 'Messages', url: '/messages', icon: MessageSquare },
  ]

  const workshopItems = [
    { title: 'Vehicles', url: '/vehicles', icon: Car },
    { title: 'Work Orders', url: '/work-orders', icon: ClipboardList },
    { title: 'Inspections', url: '/inspections', icon: ClipboardCheck },
    { title: 'Calendar', url: '/calendar', icon: CalendarDays },
    { title: 'Work Board', url: '/work-board', icon: Columns3 },
  ]

  const businessItems = [
    { title: 'Quotes', url: '/quotes', icon: FileText },
    { title: 'Billing', url: '/billing', icon: Receipt },
    { title: 'Inventory', url: '/inventory', icon: Package },
    ...(showReports ? [{ title: 'Reports', url: '/reports', icon: BarChart3 }] : []),
  ]

  const renderNavGroup = (items: { title: string; url: string; icon: React.ComponentType<{ className?: string }> }[]) =>
    items.map((item) => {
      const isActive = pathname === item.url || (item.url !== '/' && pathname.startsWith(item.url))
      return (
        <SidebarMenuItem key={item.title}>
          <SidebarMenuButton asChild isActive={isActive}>
            <Link href={item.url} className="font-medium">
              <item.icon className="size-4" />
              {item.title}
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
                      {activeOrg?.name ?? 'No organization'}
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
                  Organizations
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
                  <span>Add New Company</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            {isAdminOrOwner && <NotificationBell />}
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        {/* Dashboard */}
        <SidebarGroup>
          <SidebarMenu className="gap-2">
            <SidebarMenuItem>
              <SidebarMenuButton asChild isActive={dashboardActive}>
                <Link href="/" className="font-medium">
                  <LayoutDashboard className="size-4" />
                  Dashboard
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroup>

        {/* Clients */}
        <SidebarGroup>
          <SidebarGroupLabel>Clients</SidebarGroupLabel>
          <SidebarMenu className="gap-2">
            {renderNavGroup(clientItems)}
          </SidebarMenu>
        </SidebarGroup>

        {/* Workshop */}
        <SidebarGroup>
          <SidebarGroupLabel>Workshop</SidebarGroupLabel>
          <SidebarMenu className="gap-2">
            {renderNavGroup(workshopItems)}
          </SidebarMenu>
        </SidebarGroup>

        {/* Business */}
        <SidebarGroup>
          <SidebarGroupLabel>Business</SidebarGroupLabel>
          <SidebarMenu className="gap-2">
            {renderNavGroup(businessItems)}
          </SidebarMenu>
        </SidebarGroup>

        {/* Settings */}
        {canAccessSettings && (
          <SidebarGroup>
            <SidebarMenu className="gap-2">
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={pathname.startsWith('/settings')}>
                  <Link href="/settings" className="font-medium">
                    <Settings className="size-4" />
                    Settings
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroup>
        )}

        {isSuperAdmin && (
          <SidebarGroup>
            <SidebarGroupLabel>Super Admin</SidebarGroupLabel>
            <SidebarMenu className="gap-2">
              {adminNavItems.map((item) => {
                const isActive = pathname.startsWith(item.url)

                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild isActive={isActive}>
                      <Link href={item.url} className="font-medium">
                        <item.icon className="size-4" />
                        {item.title}
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )
              })}
            </SidebarMenu>
          </SidebarGroup>
        )}
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
                {canAccessSettings && (
                  <DropdownMenuItem asChild>
                    <Link href="/settings">
                      <Settings className="mr-2 size-4" />
                      Settings
                    </Link>
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
                  {theme === 'dark' ? (
                    <Sun className="mr-2 size-4" />
                  ) : (
                    <Moon className="mr-2 size-4" />
                  )}
                  {theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleSignOut}>
                  <LogOut className="mr-2 size-4" />
                  Sign Out
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
            <DialogTitle>Add New Company</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              handleCreateOrg()
            }}
            className="space-y-4"
          >
            <div className="space-y-2">
              <Label htmlFor="sidebar-org-name">Company Name</Label>
              <Input
                id="sidebar-org-name"
                placeholder="e.g. Joe's Auto Repair"
                value={newOrgName}
                onChange={(e) => setNewOrgName(e.target.value)}
                autoFocus
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setShowCreateOrg(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={creatingOrg || !newOrgName.trim()}>
                {creatingOrg && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Create Company
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </Sidebar>
  )
}
