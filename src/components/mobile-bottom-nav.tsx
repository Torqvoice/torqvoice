'use client'

import { useState, useCallback } from 'react'
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
import { BarcodeScanActionDialog } from '@/features/inventory/Components/BarcodeScanActionDialog'
import { InventoryPartForm } from '@/features/inventory/Components/InventoryPartForm'
import { lookupPartByBarcode } from '@/features/inventory/Actions/lookupPartByBarcode'
import { getInventoryPart } from '@/features/inventory/Actions/inventoryActions'
import { Separator } from '@/components/ui/separator'
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
  const router = useRouter()
  const t = useTranslations('navigation.sidebar')
  const tScan = useTranslations('inventory.barcodeScan')
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [scannerOpen, setScannerOpen] = useState(false)
  const [scannedPart, setScannedPart] = useState<{
    id: string
    name: string
    partNumber: string | null
    barcode: string | null
    quantity: number
    category: string | null
  } | null>(null)
  const [scannedBarcode, setScannedBarcode] = useState('')
  const [showScanActions, setShowScanActions] = useState(false)
  const [showPartForm, setShowPartForm] = useState(false)
  const [editPartData, setEditPartData] = useState<Parameters<typeof InventoryPartForm>[0]['part']>(undefined)

  const isMoreActive = drawerItems.some(
    (item) => pathname === item.href || pathname.startsWith(`${item.href}/`)
  )

  const handleBarcodeScan = useCallback(async (barcode: string) => {
    const result = await lookupPartByBarcode(barcode)
    setScannedBarcode(barcode)
    if (result.success && result.data) {
      setScannedPart(result.data)
    } else {
      setScannedPart(null)
    }
    setShowScanActions(true)
  }, [])

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

      <BarcodeScanActionDialog
        open={showScanActions}
        onOpenChange={(open) => {
          setShowScanActions(open)
          if (!open) router.refresh()
        }}
        part={scannedPart}
        barcode={scannedBarcode}
        onEditPart={async (partId) => {
          const result = await getInventoryPart(partId)
          if (result.success && result.data) {
            setEditPartData(result.data)
          }
          setShowScanActions(false)
          setShowPartForm(true)
        }}
        onCreatePart={(barcode) => {
          setScannedBarcode(barcode)
          setScannedPart(null)
          setShowScanActions(false)
          setShowPartForm(true)
        }}
      />

      <InventoryPartForm
        key={editPartData?.id ?? scannedBarcode ?? 'mobile-new'}
        open={showPartForm}
        onOpenChange={(open) => {
          setShowPartForm(open)
          if (!open) {
            setScannedBarcode('')
            setScannedPart(null)
            setEditPartData(undefined)
            router.refresh()
          }
        }}
        part={editPartData}
        initialBarcode={!editPartData ? scannedBarcode : undefined}
      />
    </>
  )
}
