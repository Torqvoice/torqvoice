'use client'

import { useState, useCallback } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import {
  BarChart3,
  Bell,
  CalendarDays,
  Car,
  ClipboardCheck,
  ClipboardList,
  Columns3,
  FileText,
  History,
  Layers,
  Loader2,
  Menu,
  Package,
  Pencil,
  Plus,
  Receipt,
  ScanBarcode,
  Settings,
  ShieldCheck,
  Users,
} from 'lucide-react'
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerFooter,
} from '@/components/ui/drawer'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { BarcodeScannerDialog } from '@/components/barcode-scanner-dialog'
import { InventoryPartForm } from '@/features/inventory/Components/InventoryPartForm'
import { lookupPartByBarcode } from '@/features/inventory/Actions/lookupPartByBarcode'
import { adjustInventoryStock, getInventoryPart } from '@/features/inventory/Actions/inventoryActions'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

const primaryItems = [
  { href: '/vehicles', icon: Car, labelKey: 'vehicles' },
  { href: '/work-orders', icon: ClipboardList, labelKey: 'workOrders' },
  { href: '/customers', icon: Users, labelKey: 'customers' },
  { href: '/inventory', icon: Package, labelKey: 'inventory' },
] as const

const workshopItems = [
  { href: '/calendar', icon: CalendarDays, labelKey: 'calendar' },
  { href: '/work-board', icon: Columns3, labelKey: 'workBoard' },
  { href: '/inspections', icon: ClipboardCheck, labelKey: 'inspections' },
  { href: '/reminders', icon: Bell, labelKey: 'reminders' },
] as const

const businessItems = [
  { href: '/quotes', icon: FileText, labelKey: 'quotes' },
  { href: '/billing', icon: Receipt, labelKey: 'billing' },
  { href: '/labor-presets', icon: Layers, labelKey: 'laborPresets' },
  { href: '/reports', icon: BarChart3, labelKey: 'reports' },
  { href: '/audit-log', icon: History, labelKey: 'auditLog' },
] as const

const allDrawerItems = [...workshopItems, ...businessItems, { href: '/settings', icon: Settings, labelKey: 'settings' }, { href: '/admin', icon: ShieldCheck, labelKey: 'adminPanel' }] as const

export function MobileBottomNav({ isSuperAdmin }: { isSuperAdmin?: boolean }) {
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
  const [addQty, setAddQty] = useState(1)
  const [addingStock, setAddingStock] = useState(false)

  const isMoreActive = allDrawerItems.some(
    (item) => pathname === item.href || pathname.startsWith(`${item.href}/`)
  )

  const handleBarcodeScan = useCallback(async (barcode: string) => {
    const result = await lookupPartByBarcode(barcode)
    setScannedBarcode(barcode)
    setAddQty(1)
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
        <DrawerContent aria-describedby={undefined}>
          <DrawerHeader className="sr-only">
            <DrawerTitle>{t('more')}</DrawerTitle>
          </DrawerHeader>
          <div className="px-4 pb-4 space-y-4">
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

            {/* Workshop */}
            <div>
              <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-2 px-1">{t('workshop')}</p>
              <nav className="grid grid-cols-4 gap-2">
                {workshopItems.map(({ href, icon: Icon, labelKey }) => {
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

            {/* Business */}
            <div>
              <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-2 px-1">{t('business')}</p>
              <nav className="grid grid-cols-4 gap-2">
                {businessItems.map(({ href, icon: Icon, labelKey }) => {
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

            <Separator />

            {/* Settings & Admin */}
            <nav className="grid grid-cols-4 gap-2">
              <Link
                href="/settings"
                onClick={() => setDrawerOpen(false)}
                className={cn(
                  'flex flex-col items-center gap-1.5 rounded-lg py-3 text-xs transition-colors',
                  pathname.startsWith('/settings')
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:bg-accent'
                )}
              >
                <Settings className="h-5 w-5" />
                <span>{t('settings')}</span>
              </Link>
              {isSuperAdmin && (
                <Link
                  href="/admin"
                  onClick={() => setDrawerOpen(false)}
                  className={cn(
                    'flex flex-col items-center gap-1.5 rounded-lg py-3 text-xs transition-colors',
                    pathname.startsWith('/admin')
                      ? 'bg-primary/10 text-primary'
                      : 'text-muted-foreground hover:bg-accent'
                  )}
                >
                  <ShieldCheck className="h-5 w-5" />
                  <span>{t('adminPanel')}</span>
                </Link>
              )}
            </nav>
          </div>
        </DrawerContent>
      </Drawer>

      <BarcodeScannerDialog
        open={scannerOpen}
        onOpenChange={setScannerOpen}
        onScan={handleBarcodeScan}
      />

      <Drawer open={showScanActions} onOpenChange={(open) => {
        setShowScanActions(open)
        if (!open) router.refresh()
      }}>
        <DrawerContent aria-describedby={undefined}>
          <DrawerHeader>
            <DrawerTitle>{tScan('title')}</DrawerTitle>
          </DrawerHeader>
          {scannedPart ? (
            <div className="px-4">
              <div className="flex items-center gap-3 rounded-lg border p-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                  <Package className="h-5 w-5 text-primary" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-medium truncate">{scannedPart.name}</p>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    {scannedPart.partNumber && <span className="font-mono text-xs">{scannedPart.partNumber}</span>}
                    {scannedPart.category && <Badge variant="secondary" className="text-[10px]">{scannedPart.category}</Badge>}
                  </div>
                </div>
                <div className="text-right text-sm text-muted-foreground shrink-0">
                  {tScan('currentStock', { quantity: scannedPart.quantity })}
                </div>
              </div>

              <div className="flex items-center justify-center gap-4 py-6">
                <Button
                  variant="outline"
                  size="icon"
                  className="h-12 w-12 rounded-full text-lg"
                  onClick={() => setAddQty(Math.max(1, addQty - 1))}
                  disabled={addingStock || addQty <= 1}
                >
                  -
                </Button>
                <span className="w-16 text-center text-3xl font-semibold tabular-nums">{addQty}</span>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-12 w-12 rounded-full text-lg"
                  onClick={() => setAddQty(addQty + 1)}
                  disabled={addingStock}
                >
                  +
                </Button>
              </div>
            </div>
          ) : (
            <div className="px-4">
              <div className="flex flex-col items-center rounded-lg border border-dashed p-6">
                <Package className="h-8 w-8 text-muted-foreground" />
                <p className="mt-2 text-sm text-muted-foreground">
                  {tScan('notFound', { barcode: scannedBarcode })}
                </p>
              </div>
            </div>
          )}
          <DrawerFooter>
            {scannedPart ? (
              <div className="flex gap-2">
                <Button
                  size="lg"
                  className="flex-1"
                  onClick={async () => {
                    setAddingStock(true)
                    const result = await adjustInventoryStock({ id: scannedPart.id, adjustment: addQty })
                    setAddingStock(false)
                    if (result.success) {
                      toast.success(tScan('addedStock', { amount: addQty }))
                      setShowScanActions(false)
                      router.refresh()
                    }
                  }}
                  disabled={addingStock}
                >
                  {addingStock ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
                  {tScan('addStock')} (+{addQty})
                </Button>
                <Button
                  size="lg"
                  variant="outline"
                  onClick={async () => {
                    const result = await getInventoryPart(scannedPart.id)
                    if (result.success && result.data) {
                      setEditPartData(result.data)
                    }
                    setShowScanActions(false)
                    setShowPartForm(true)
                  }}
                >
                  <Pencil className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <Button
                size="lg"
                className="w-full"
                onClick={() => {
                  setShowScanActions(false)
                  setShowPartForm(true)
                }}
              >
                <Plus className="mr-2 h-4 w-4" />
                {tScan('createNew')}
              </Button>
            )}
          </DrawerFooter>
        </DrawerContent>
      </Drawer>

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
