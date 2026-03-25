'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
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
  ScanBarcode,
  Settings,
  Users,
} from 'lucide-react'
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer'
import { BarcodeScannerDialog } from '@/components/barcode-scanner-dialog'
import { lookupPartByBarcode } from '@/features/inventory/Actions/lookupPartByBarcode'
import { adjustInventoryStock } from '@/features/inventory/Actions/inventoryActions'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

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
  const router = useRouter()
  const t = useTranslations('navigation.sidebar')
  const tScan = useTranslations('inventory.barcodeScan')
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [scannerOpen, setScannerOpen] = useState(false)

  const isMoreActive = drawerItems.some(
    (item) => pathname === item.href || pathname.startsWith(`${item.href}/`)
  )

  const handleBarcodeScan = async (barcode: string) => {
    const result = await lookupPartByBarcode(barcode)
    if (result.success && result.data) {
      const part = result.data
      await adjustInventoryStock({ id: part.id, adjustment: 1 })
      toast.success(tScan('addedStock', { amount: 1 }))
      router.refresh()
    } else {
      toast.error(tScan('notFound', { barcode }))
    }
  }

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
          <div className="p-4">
            {/* Quick action */}
            <button
              type="button"
              onClick={() => {
                setDrawerOpen(false)
                setTimeout(() => setScannerOpen(true), 200)
              }}
              className="flex w-full items-center gap-3 rounded-lg bg-primary/5 px-4 py-3 text-sm font-medium text-primary transition-colors hover:bg-primary/10"
            >
              <ScanBarcode className="h-5 w-5" />
              {tScan('scanParts')}
            </button>

            <Separator className="my-4" />

            {/* Navigation grid */}
            <nav className="grid grid-cols-4 gap-2">
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
          </div>
        </DrawerContent>
      </Drawer>

      <BarcodeScannerDialog
        open={scannerOpen}
        onOpenChange={setScannerOpen}
        onScan={handleBarcodeScan}
      />
    </>
  )
}
