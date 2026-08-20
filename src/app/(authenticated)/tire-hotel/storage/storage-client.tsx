'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { AppCard } from '@/components/app-card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '@/components/ui/context-menu'
import { useConfirm } from '@/components/confirm-dialog'
import { CapacityBar } from '@/features/tire-hotel/Components/CapacityBar'
import {
  LocationFormDialog,
  type EditableLocation,
} from '@/features/tire-hotel/Components/LocationFormDialog'
import {
  createWarehouse,
  deleteLocation,
  deleteWarehouse,
} from '@/features/tire-hotel/Actions/storageActions'
import { OCCUPANCY_TOKENS } from '@/features/tire-hotel/Lib/tireConstants'
import { cn } from '@/lib/utils'
import { Building2, Loader2, Pencil, Plus, Trash2, Warehouse } from 'lucide-react'

type LocationRow = EditableLocation & {
  used: number
  free: number
  band: keyof typeof OCCUPANCY_TOKENS
}

type WarehouseRow = {
  id: string
  name: string
  address: string | null
  isDefault: boolean
  summary: {
    capacity: number
    used: number
    free: number
    locationCount: number
    occupiedLocationCount: number
    band: keyof typeof OCCUPANCY_TOKENS
  }
  locations: LocationRow[]
}

/**
 * The shelf overview. A workshop sets its geography up here once, then reads
 * this page whenever it needs to know whether another set will fit. The unit
 * throughout is individual tires, because that is what actually occupies a
 * shelf, since a set can be two tires or five.
 */
export function StorageClient({
  warehouses,
  defaultCapacity,
}: {
  warehouses: WarehouseRow[]
  defaultCapacity: number
}) {
  const router = useRouter()
  const t = useTranslations('tireHotel')
  const confirm = useConfirm()

  const [showWarehouse, setShowWarehouse] = useState(false)
  const [warehouseName, setWarehouseName] = useState('')
  const [warehouseAddress, setWarehouseAddress] = useState('')
  const [savingWarehouse, setSavingWarehouse] = useState(false)

  const [locationDialog, setLocationDialog] = useState<{
    warehouseId: string
    warehouseName: string
    location?: EditableLocation
  } | null>(null)

  const totals = warehouses.reduce(
    (acc, w) => ({
      capacity: acc.capacity + w.summary.capacity,
      used: acc.used + w.summary.used,
      free: acc.free + w.summary.free,
      locations: acc.locations + w.summary.locationCount,
    }),
    { capacity: 0, used: 0, free: 0, locations: 0 }
  )

  const handleCreateWarehouse = async () => {
    if (!warehouseName.trim()) return
    setSavingWarehouse(true)
    const result = await createWarehouse({
      name: warehouseName.trim(),
      address: warehouseAddress.trim(),
    })
    setSavingWarehouse(false)
    if (!result.success) {
      toast.error(result.error ?? t('storage.saveFailed'))
      return
    }
    toast.success(t('storage.warehouseCreated'))
    setShowWarehouse(false)
    setWarehouseName('')
    setWarehouseAddress('')
    router.refresh()
  }

  const handleDeleteLocation = async (location: LocationRow) => {
    const ok = await confirm({
      title: t('storage.deleteLocationTitle', { code: location.code }),
      description: t('storage.deleteLocationBody'),
      confirmLabel: t('common.delete'),
      destructive: true,
    })
    if (!ok) return
    const result = await deleteLocation(location.id)
    if (!result.success) {
      toast.error(result.error ?? t('storage.deleteFailed'))
      return
    }
    toast.success(t('storage.locationDeleted', { code: location.code }))
    router.refresh()
  }

  const handleDeleteWarehouse = async (warehouse: WarehouseRow) => {
    const ok = await confirm({
      title: t('storage.deleteWarehouseTitle', { name: warehouse.name }),
      description:
        warehouse.summary.used > 0
          ? t('storage.deleteWarehouseBodyOccupied', { count: warehouse.summary.used })
          : t('storage.deleteWarehouseBody'),
      confirmLabel: t('common.delete'),
      destructive: true,
    })
    if (!ok) return
    const result = await deleteWarehouse(warehouse.id)
    if (!result.success) {
      toast.error(result.error ?? t('storage.deleteFailed'))
      return
    }
    toast.success(
      result.data?.archived
        ? t('storage.warehouseArchived', { name: warehouse.name })
        : t('storage.warehouseDeleted', { name: warehouse.name })
    )
    router.refresh()
  }

  return (
    <div className="space-y-6">
      {/* Whole-operation totals: the one number an owner checks before saying
          yes to another storage customer. */}
      {warehouses.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-4">
          <SummaryStat label={t('storage.totalCapacity')} value={totals.capacity} />
          <SummaryStat label={t('storage.totalStored')} value={totals.used} />
          <SummaryStat label={t('storage.totalFree')} value={totals.free} accent />
          <SummaryStat label={t('storage.totalLocations')} value={totals.locations} />
        </div>
      )}

      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">{t('storage.title')}</h2>
          <p className="text-sm text-muted-foreground">{t('storage.description')}</p>
        </div>
        <Button size="sm" onClick={() => setShowWarehouse(true)}>
          <Plus className="mr-1 h-4 w-4" />
          {t('storage.addWarehouse')}
        </Button>
      </div>

      {warehouses.length === 0 ? (
        <div className="rounded-lg border border-dashed p-10 text-center">
          <Warehouse className="mx-auto h-10 w-10 text-muted-foreground" />
          <p className="mt-3 font-medium">{t('storage.emptyTitle')}</p>
          <p className="mt-1 text-sm text-muted-foreground">{t('storage.emptyBody')}</p>
          <Button className="mt-4" onClick={() => setShowWarehouse(true)}>
            <Plus className="mr-1 h-4 w-4" />
            {t('storage.addWarehouse')}
          </Button>
        </div>
      ) : (
        <div className="space-y-6">
          {warehouses.map((warehouse) => (
            <AppCard
              key={warehouse.id}
              icon={Building2}
              title={
                <span className="flex items-center gap-2">
                  {warehouse.name}
                  {warehouse.isDefault && (
                    <Badge variant="secondary" className="text-[10px]">
                      {t('storage.default')}
                    </Badge>
                  )}
                </span>
              }
              description={warehouse.address ?? undefined}
              action={
                <div className="flex items-center gap-1">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      setLocationDialog({
                        warehouseId: warehouse.id,
                        warehouseName: warehouse.name,
                      })
                    }
                  >
                    <Plus className="mr-1 h-3.5 w-3.5" />
                    {t('storage.addShelves')}
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8"
                    onClick={() => handleDeleteWarehouse(warehouse)}
                    aria-label={t('storage.deleteWarehouse')}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              }
              contentClassName="space-y-4"
            >
              <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                <CapacityBar
                  used={warehouse.summary.used}
                  capacity={warehouse.summary.capacity}
                  free={warehouse.summary.free}
                />
                <p className="text-xs text-muted-foreground tabular-nums">
                  {t('storage.locationSummary', {
                    occupied: warehouse.summary.occupiedLocationCount,
                    total: warehouse.summary.locationCount,
                  })}
                </p>
              </div>

              {warehouse.locations.length === 0 ? (
                <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                  {t('storage.noLocations')}
                </div>
              ) : (
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {warehouse.locations.map((location) => (
                    <ContextMenu key={location.id} modal={false}>
                      <ContextMenuTrigger asChild>
                        <div
                          className={cn(
                            'rounded-lg border bg-card p-3 ring-1 ring-inset transition-colors',
                            OCCUPANCY_TOKENS[location.band].ring
                          )}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <span className="font-mono text-sm font-medium">{location.code}</span>
                            <span
                              className={cn(
                                'shrink-0 text-xs font-medium tabular-nums',
                                OCCUPANCY_TOKENS[location.band].text
                              )}
                            >
                              {t('capacity.freeShort', { count: location.free })}
                            </span>
                          </div>
                          <CapacityBar
                            used={location.used}
                            capacity={location.capacity}
                            free={location.free}
                            showLabel={false}
                            size="sm"
                            className="mt-2"
                          />
                          <p className="mt-1.5 text-xs text-muted-foreground tabular-nums">
                            {t('capacity.used', {
                              used: location.used,
                              capacity: location.capacity,
                            })}
                          </p>
                        </div>
                      </ContextMenuTrigger>
                      <ContextMenuContent className="min-w-48">
                        <ContextMenuItem
                          onClick={() =>
                            setLocationDialog({
                              warehouseId: warehouse.id,
                              warehouseName: warehouse.name,
                              location,
                            })
                          }
                        >
                          <Pencil className="mr-2 h-4 w-4" />
                          {t('storage.editLocation')}
                        </ContextMenuItem>
                        <ContextMenuItem
                          variant="destructive"
                          onClick={() => handleDeleteLocation(location)}
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          {t('common.delete')}
                        </ContextMenuItem>
                      </ContextMenuContent>
                    </ContextMenu>
                  ))}
                </div>
              )}
            </AppCard>
          ))}
        </div>
      )}

      <Dialog open={showWarehouse} onOpenChange={setShowWarehouse}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('storage.addWarehouse')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="warehouseName">{t('storage.warehouseName')}</Label>
              <Input
                id="warehouseName"
                value={warehouseName}
                onChange={(e) => setWarehouseName(e.target.value)}
                placeholder={t('storage.warehouseNamePlaceholder')}
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="warehouseAddress">{t('storage.warehouseAddress')}</Label>
              <Input
                id="warehouseAddress"
                value={warehouseAddress}
                onChange={(e) => setWarehouseAddress(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowWarehouse(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              onClick={handleCreateWarehouse}
              disabled={savingWarehouse || !warehouseName.trim()}
            >
              {savingWarehouse && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t('common.create')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {locationDialog && (
        <LocationFormDialog
          open
          onOpenChange={(open) => !open && setLocationDialog(null)}
          warehouseId={locationDialog.warehouseId}
          warehouseName={locationDialog.warehouseName}
          location={locationDialog.location}
          defaultCapacity={defaultCapacity}
        />
      )}
    </div>
  )
}

function SummaryStat({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return (
    <div className="rounded-lg border bg-card p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={cn(
          'mt-0.5 text-2xl font-semibold tabular-nums',
          accent && 'text-emerald-600 dark:text-emerald-500'
        )}
      >
        {value}
      </p>
    </div>
  )
}
