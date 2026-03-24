'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useTranslations } from 'next-intl'
import {
  Bell,
  CalendarDays,
  Car,
  ClipboardCheck,
  ClipboardList,
  Columns3,
  FileText,
  History,
  Layers,
  Menu,
  Package,
  Receipt,
  Settings,
  Users,
} from 'lucide-react'
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer'
import { cn } from '@/lib/utils'

const primaryItems = [
  { href: '/vehicles', icon: Car, labelKey: 'vehicles' },
  { href: '/work-orders', icon: ClipboardList, labelKey: 'workOrders' },
  { href: '/customers', icon: Users, labelKey: 'customers' },
  { href: '/inventory', icon: Package, labelKey: 'inventory' },
] as const

const drawerItems = [
  { href: '/calendar', icon: CalendarDays, labelKey: 'calendar' },
  { href: '/work-board', icon: Columns3, labelKey: 'workBoard' },
  { href: '/quotes', icon: FileText, labelKey: 'quotes' },
  { href: '/inspections', icon: ClipboardCheck, labelKey: 'inspections' },
  { href: '/reminders', icon: Bell, labelKey: 'reminders' },
  { href: '/billing', icon: Receipt, labelKey: 'billing' },
  { href: '/labor-presets', icon: Layers, labelKey: 'laborPresets' },
  { href: '/audit-log', icon: History, labelKey: 'auditLog' },
  { href: '/settings', icon: Settings, labelKey: 'settings' },
] as const

export function MobileBottomNav() {
  const pathname = usePathname()
  const t = useTranslations('navigation.sidebar')
  const [drawerOpen, setDrawerOpen] = useState(false)

  const isMoreActive = drawerItems.some(
    (item) => pathname === item.href || pathname.startsWith(`${item.href}/`)
  )

  return (
    <>
      <nav className="fixed bottom-0 left-0 right-0 z-50 border-t bg-background pb-[env(safe-area-inset-bottom)] md:hidden">
        <div className="grid grid-cols-5">
          {primaryItems.map(({ href, icon: Icon, labelKey }) => {
            const isActive = pathname === href || pathname.startsWith(`${href}/`)
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  'flex flex-col items-center gap-0.5 py-2 text-[10px]',
                  isActive ? 'text-primary' : 'text-muted-foreground'
                )}
              >
                <Icon className="h-5 w-5" />
                <span>{t(labelKey)}</span>
              </Link>
            )
          })}
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            className={cn(
              'flex flex-col items-center gap-0.5 py-2 text-[10px]',
              isMoreActive ? 'text-primary' : 'text-muted-foreground'
            )}
          >
            <Menu className="h-5 w-5" />
            <span>{t('more')}</span>
          </button>
        </div>
      </nav>

      <Drawer open={drawerOpen} onOpenChange={setDrawerOpen}>
        <DrawerContent>
          <DrawerHeader className="sr-only">
            <DrawerTitle>{t('more')}</DrawerTitle>
          </DrawerHeader>
          <nav className="grid grid-cols-4 gap-2 p-4">
            {drawerItems.map(({ href, icon: Icon, labelKey }) => {
              const isActive = pathname === href || pathname.startsWith(`${href}/`)
              return (
                <Link
                  key={href}
                  href={href}
                  onClick={() => setDrawerOpen(false)}
                  className={cn(
                    'flex flex-col items-center gap-1.5 rounded-lg py-3 text-xs transition-colors',
                    isActive
                      ? 'bg-primary/10 text-primary'
                      : 'text-muted-foreground hover:bg-accent'
                  )}
                >
                  <Icon className="h-5 w-5" />
                  <span>{t(labelKey)}</span>
                </Link>
              )
            })}
          </nav>
        </DrawerContent>
      </Drawer>
    </>
  )
}
