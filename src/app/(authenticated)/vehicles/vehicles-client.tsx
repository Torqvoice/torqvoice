'use client'

import { useState, useCallback, useTransition } from 'react'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { DataTablePagination } from '@/components/data-table-pagination'
import { useGlassModal } from '@/components/glass-modal'
import { useConfirm } from '@/components/confirm-dialog'
import { VehicleForm } from '@/features/vehicles/Components/VehicleForm'
import { deleteVehicle } from '@/features/vehicles/Actions/vehicleActions'
import { unarchiveVehicle } from '@/features/vehicles/Actions/unarchiveVehicle'
import { ArchiveVehicleDialog } from '@/features/vehicles/Components/ArchiveVehicleDialog'
import { toast } from 'sonner'
import {
  Archive,
  ArchiveRestore,
  Gauge,
  LayoutGrid,
  List,
  Loader2,
  MoreVertical,
  Pencil,
  Plus,
  Search,
  Trash2,
  Wrench,
} from 'lucide-react'
import { useTranslations } from 'next-intl'

interface Vehicle {
  id: string
  make: string
  model: string
  year: number
  vin: string | null
  licensePlate: string | null
  color: string | null
  mileage: number
  fuelType: string | null
  transmission: string | null
  engineSize: string | null
  imageUrl: string | null
  customerId: string | null
  customer: { id: string; name: string; company: string | null } | null
  _count: { serviceRecords: number }
}

interface CustomerOption {
  id: string
  name: string
  company: string | null
}

interface PaginatedData {
  vehicles: Vehicle[]
  total: number
  page: number
  pageSize: number
  totalPages: number
  archivedCount: number
}

const VIEW_COOKIE = 'torqvoice-vehicles-view'

export function VehiclesClient({
  data,
  customers,
  search,
  initialView = 'table',
  isArchived = false,
  archivedCount = 0,
}: {
  data: PaginatedData
  customers: CustomerOption[]
  search: string
  initialView?: 'table' | 'grid'
  isArchived?: boolean
  archivedCount?: number
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()
  const t = useTranslations('vehicles.list')
  const tc = useTranslations('common.buttons')
  const [searchInput, setSearchInput] = useState(search)
  const [showForm, setShowForm] = useState(false)
  const [editVehicle, setEditVehicle] = useState<Vehicle | null>(null)
  const [view, setView] = useState<'table' | 'grid'>(initialView)
  const [archiveTarget, setArchiveTarget] = useState<{ id: string; name: string } | null>(null)
  const modal = useGlassModal()
  const confirm = useConfirm()

  const toggleView = (v: 'table' | 'grid') => {
    setView(v)
    document.cookie = `${VIEW_COOKIE}=${v};path=/;max-age=${60 * 60 * 24 * 365}`
  }

  const navigate = useCallback(
    (params: Record<string, string | number | undefined>) => {
      const newParams = new URLSearchParams(searchParams.toString())
      for (const [key, value] of Object.entries(params)) {
        if (value === undefined || value === '') {
          newParams.delete(key)
        } else {
          newParams.set(key, String(value))
        }
      }
      if (!('page' in params) && 'search' in params) {
        newParams.delete('page')
      }
      startTransition(() => {
        router.push(`${pathname}?${newParams.toString()}`)
      })
    },
    [router, pathname, searchParams]
  )

  const handleSearch = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault()
      navigate({ search: searchInput || undefined })
    },
    [navigate, searchInput]
  )

  const handleDelete = async (id: string, name: string) => {
    const ok = await confirm({
      title: t('deleteTitle'),
      description: t('deleteDescription', { name }),
      confirmLabel: tc('delete'),
      destructive: true,
    })
    if (!ok) return
    const result = await deleteVehicle(id)
    if (result.success) {
      router.refresh()
    } else {
      modal.open('error', 'Error', result.error || t('deleteError'))
    }
  }

  const handleUnarchive = async (id: string, name: string) => {
    const ok = await confirm({
      title: t('unarchiveTitle'),
      description: t('unarchiveDescription', { name }),
      confirmLabel: t('unarchive'),
    })
    if (!ok) return
    const result = await unarchiveVehicle(id)
    if (result.success) {
      toast.success(t('vehicleUnarchived'))
      router.refresh()
    } else {
      modal.open('error', 'Error', result.error || t('unarchiveError'))
    }
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-1 items-center gap-2">
          <div className="flex gap-1 rounded-lg border p-1">
            <button
              onClick={() => router.push('/vehicles')}
              className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                !isArchived
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {t('active')}
            </button>
            <button
              onClick={() => router.push('/vehicles?archived=true')}
              className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                isArchived
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {t('archived')}{archivedCount > 0 ? ` (${archivedCount})` : ''}
            </button>
          </div>
          <form onSubmit={handleSearch} className="relative flex-1 sm:max-w-sm">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder={t('searchPlaceholder')}
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="pl-9"
            />
          </form>
          {isPending && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
        </div>
        <div className="flex items-center gap-1">
          <div className="flex items-center rounded-md border">
            <Button
              variant={view === 'table' ? 'secondary' : 'ghost'}
              size="icon"
              className="h-8 w-8 rounded-r-none"
              onClick={() => toggleView('table')}
            >
              <List className="h-4 w-4" />
            </Button>
            <Button
              variant={view === 'grid' ? 'secondary' : 'ghost'}
              size="icon"
              className="h-8 w-8 rounded-l-none"
              onClick={() => toggleView('grid')}
            >
              <LayoutGrid className="h-4 w-4" />
            </Button>
          </div>
          {!isArchived && (
            <Button size="sm" onClick={() => setShowForm(true)}>
              <Plus className="mr-1 h-3.5 w-3.5" />
              {t('addVehicle')}
            </Button>
          )}
        </div>
      </div>

      {data.vehicles.length === 0 ? (
        <div className="flex h-32 items-center justify-center rounded-lg border text-muted-foreground">
          {search ? t('emptySearch') : isArchived ? t('emptyArchived') : t('empty')}
        </div>
      ) : view === 'table' ? (
        /* Table view */
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[120px]">{t('table.plate')}</TableHead>
                <TableHead>{t('table.vehicle')}</TableHead>
                <TableHead className="hidden sm:table-cell">{t('table.customer')}</TableHead>
                <TableHead className="hidden md:table-cell w-[100px] text-right">{t('table.mileage')}</TableHead>
                <TableHead className="w-[80px] text-center">{t('table.services')}</TableHead>
                <TableHead className="w-[50px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.vehicles.map((v) => (
                <TableRow
                  key={v.id}
                  className="cursor-pointer"
                  onClick={() => router.push(`/vehicles/${v.id}`)}
                >
                  <TableCell className="font-mono text-sm">{v.licensePlate || '-'}</TableCell>
                  <TableCell>
                    <span className="font-medium">
                      {v.year} {v.make} {v.model}
                    </span>
                  </TableCell>
                  <TableCell className="hidden sm:table-cell text-muted-foreground">
                    {v.customer?.name || '-'}
                  </TableCell>
                  <TableCell className="hidden md:table-cell text-right font-mono text-sm">
                    {v.mileage.toLocaleString()}
                  </TableCell>
                  <TableCell className="text-center">{v._count.serviceRecords}</TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {!isArchived && (
                          <DropdownMenuItem
                            onClick={(e) => {
                              e.stopPropagation()
                              setEditVehicle(v)
                              setShowForm(true)
                            }}
                          >
                            <Pencil className="mr-2 h-4 w-4" />
                            {t('edit')}
                          </DropdownMenuItem>
                        )}
                        {isArchived ? (
                          <DropdownMenuItem
                            onClick={(e) => {
                              e.stopPropagation()
                              handleUnarchive(v.id, `${v.year} ${v.make} ${v.model}`)
                            }}
                          >
                            <ArchiveRestore className="mr-2 h-4 w-4" />
                            {t('unarchive')}
                          </DropdownMenuItem>
                        ) : (
                          <DropdownMenuItem
                            onClick={(e) => {
                              e.stopPropagation()
                              setArchiveTarget({ id: v.id, name: `${v.year} ${v.make} ${v.model}` })
                            }}
                          >
                            <Archive className="mr-2 h-4 w-4" />
                            {t('archive')}
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem
                          className="text-destructive"
                          onClick={(e) => {
                            e.stopPropagation()
                            handleDelete(v.id, `${v.year} ${v.make} ${v.model}`)
                          }}
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          {t('delete')}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : isPending ? (
        /* Grid skeleton */
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i} className="overflow-hidden border-0 shadow-sm">
              <Skeleton className="aspect-[16/10] rounded-none" />
              <CardContent className="flex items-center justify-between p-4">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-16" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        /* Grid view */
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {data.vehicles.map((v) => (
            <Card
              key={v.id}
              className="group overflow-hidden border-0 shadow-sm transition-all hover:shadow-lg hover:-translate-y-0.5"
            >
              <Link href={`/vehicles/${v.id}`}>
                <div className="relative aspect-[16/10] overflow-hidden bg-muted">
                  <Image
                    src={v.imageUrl || '/car_placeholder.avif'}
                    alt={`${v.year} ${v.make} ${v.model}`}
                    fill
                    unoptimized
                    className="object-cover transition-transform duration-300 group-hover:scale-105"
                  />
                  <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/60 to-transparent" />
                  <div className="absolute inset-x-0 bottom-0 p-4">
                    <h3 className="text-lg font-bold text-white drop-shadow-sm">
                      {v.year} {v.make} {v.model}
                    </h3>
                    {v.licensePlate && (
                      <p className="mt-0.5 font-mono text-xs text-white/80">{v.licensePlate}</p>
                    )}
                  </div>
                  {/* Action menu */}
                  <div className="absolute right-2 top-2 opacity-0 transition-opacity group-hover:opacity-100">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild onClick={(e) => e.preventDefault()}>
                        <Button variant="secondary" size="icon" className="h-8 w-8">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {!isArchived && (
                          <DropdownMenuItem
                            onClick={(e) => {
                              e.preventDefault()
                              setEditVehicle(v)
                              setShowForm(true)
                            }}
                          >
                            <Pencil className="mr-2 h-4 w-4" />
                            {t('edit')}
                          </DropdownMenuItem>
                        )}
                        {isArchived ? (
                          <DropdownMenuItem
                            onClick={(e) => {
                              e.preventDefault()
                              handleUnarchive(v.id, `${v.year} ${v.make} ${v.model}`)
                            }}
                          >
                            <ArchiveRestore className="mr-2 h-4 w-4" />
                            {t('unarchive')}
                          </DropdownMenuItem>
                        ) : (
                          <DropdownMenuItem
                            onClick={(e) => {
                              e.preventDefault()
                              setArchiveTarget({ id: v.id, name: `${v.year} ${v.make} ${v.model}` })
                            }}
                          >
                            <Archive className="mr-2 h-4 w-4" />
                            {t('archive')}
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem
                          className="text-destructive"
                          onClick={(e) => {
                            e.preventDefault()
                            handleDelete(v.id, `${v.year} ${v.make} ${v.model}`)
                          }}
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          {t('delete')}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
                <CardContent className="flex items-center justify-between p-4">
                  <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    <Gauge className="h-3.5 w-3.5" />
                    <span className="font-medium">{v.mileage.toLocaleString()}</span>
                  </div>
                  <div className="flex items-center gap-3 text-sm text-muted-foreground">
                    {v.customer && <span className="text-xs">{v.customer.name}</span>}
                    <div className="flex items-center gap-1">
                      <Wrench className="h-3.5 w-3.5" />
                      <span>{v._count.serviceRecords}</span>
                    </div>
                  </div>
                </CardContent>
              </Link>
            </Card>
          ))}
        </div>
      )}

      <DataTablePagination
        total={data.total}
        page={data.page}
        pageSize={data.pageSize}
        totalPages={data.totalPages}
        onNavigate={navigate}
      />

      <VehicleForm
        open={showForm}
        onOpenChange={(open) => {
          setShowForm(open)
          if (!open) setEditVehicle(null)
        }}
        vehicle={editVehicle ?? undefined}
        customers={customers}
      />

      <ArchiveVehicleDialog
        open={!!archiveTarget}
        onOpenChange={(open) => {
          if (!open) setArchiveTarget(null)
        }}
        vehicleId={archiveTarget?.id ?? ''}
        vehicleName={archiveTarget?.name ?? ''}
      />
    </div>
  )
}
