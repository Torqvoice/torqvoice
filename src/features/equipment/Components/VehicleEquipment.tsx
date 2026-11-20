'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useFormatter, useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { ChevronDown, ChevronRight, FileText, History, MoreHorizontal, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useConfirm } from '@/components/confirm-dialog'
import { useServiceType } from '@/components/service-type-context'
import { useDateSettings } from '@/components/date-settings-context'
import { cn } from '@/lib/utils'
import { VehicleMeters } from '@/features/meters/Components/VehicleMeters'
import type { EquipmentItemView, VehicleEquipmentView } from '../Lib/equipment.server'
import { examinationState } from '../Lib/equipmentDays'
import {
  deleteEquipmentItem,
  refitEquipmentItem,
  removeEquipmentItem,
} from '../Actions/equipmentItemActions'
import { EquipmentItemDialog } from './EquipmentItemDialog'
import { MoveEquipmentDialog } from './MoveEquipmentDialog'

/** A day key ("2026-11-20") as the person reads dates, never moved by a clock. */
export function useDayText() {
  const format = useFormatter()
  return (day: string) =>
    format.dateTime(new Date(`${day}T00:00:00Z`), { dateStyle: 'medium', timeZone: 'UTC' })
}

type Dialog =
  | { kind: 'add' }
  | { kind: 'edit'; item: EquipmentItemView }
  | { kind: 'move'; item: EquipmentItemView }
  | null

/**
 * The equipment fitted to a vehicle: each item with its examination due
 * date, its details, report and meters a click away, and what was on the
 * vehicle before. Draws nothing while equipment is off.
 */
export function VehicleEquipment({
  vehicleId,
  equipment,
  today,
  className,
}: {
  vehicleId: string
  equipment: VehicleEquipmentView | null
  /** Today on the workshop's calendar, for what is overdue. */
  today: string
  className?: string
}) {
  const t = useTranslations('equipment.vehicle')
  const isMarine = useServiceType() === 'marine'
  const [dialog, setDialog] = useState<Dialog>(null)
  const [showHistory, setShowHistory] = useState(false)
  if (!equipment) return null
  const canAdd = equipment.types.some((type) => type.isActive)

  return (
    <div className={cn('space-y-2', className)} data-testid="vehicle-equipment">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-[13px] font-semibold">{t('title')}</h2>
        {canAdd && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={() => setDialog({ kind: 'add' })}
          >
            <Plus className="mr-1 h-3.5 w-3.5" />
            {t('add')}
          </Button>
        )}
      </div>

      {equipment.items.length === 0 ? (
        <p className="text-xs text-muted-foreground">{t(isMarine ? 'emptyMarine' : 'empty')}</p>
      ) : (
        <ul className="space-y-1">
          {equipment.items.map((item) => (
            <ItemRow
              key={item.id}
              item={item}
              vehicleId={vehicleId}
              equipment={equipment}
              today={today}
              onEdit={() => setDialog({ kind: 'edit', item })}
              onMove={() => setDialog({ kind: 'move', item })}
            />
          ))}
        </ul>
      )}

      {equipment.history.length > 0 && (
        <div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 px-1 text-xs text-muted-foreground"
            aria-expanded={showHistory}
            onClick={() => setShowHistory((open) => !open)}
          >
            <History className="mr-1 h-3.5 w-3.5" />
            {t('history', { count: equipment.history.length })}
          </Button>
          {showHistory && <HistoryList equipment={equipment} />}
        </div>
      )}

      {(dialog?.kind === 'add' || dialog?.kind === 'edit') && (
        <EquipmentItemDialog
          vehicleId={vehicleId}
          types={equipment.types}
          item={dialog.kind === 'edit' ? dialog.item : null}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === 'move' && (
        <MoveEquipmentDialog item={dialog.item} onClose={() => setDialog(null)} />
      )}
    </div>
  )
}

function ItemRow({
  item,
  vehicleId,
  equipment,
  today,
  onEdit,
  onMove,
}: {
  item: EquipmentItemView
  vehicleId: string
  equipment: VehicleEquipmentView
  today: string
  onEdit: () => void
  onMove: () => void
}) {
  const t = useTranslations('equipment.vehicle')
  const tf = useTranslations('equipment.form')
  const isMarine = useServiceType() === 'marine'
  const router = useRouter()
  const confirm = useConfirm()
  const dayText = useDayText()
  const [open, setOpen] = useState(false)
  const state = examinationState(item.nextExaminationDue, today)
  const detailsId = `equipment-details-${item.id}`

  const remove = async () => {
    const ok = await confirm({
      title: t('removeTitle', { name: item.label }),
      description: t(isMarine ? 'removeHintMarine' : 'removeHint'),
      confirmLabel: t('remove'),
    })
    if (!ok) return
    const result = await removeEquipmentItem(item.id)
    if (!result.success) {
      toast.error(result.error || t('saveError'))
      return
    }
    toast.success(t('removed', { name: item.label }))
    router.refresh()
  }

  const destroy = async () => {
    const ok = await confirm({
      title: t('deleteTitle', { name: item.label }),
      description: t('deleteHint'),
      confirmLabel: t('delete'),
      destructive: true,
      irreversible: true,
    })
    if (!ok) return
    const result = await deleteEquipmentItem(item.id)
    if (!result.success) {
      toast.error(result.error || t('saveError'))
      return
    }
    toast.success(t('deleted', { name: item.label }))
    router.refresh()
  }

  const name = [item.make, item.model].filter(Boolean).join(' ')
  const details: [string, string][] = [
    [tf('serialNumber'), item.serialNumber ?? ''],
    [
      tf('manufacture'),
      item.manufactureDay ? dayText(item.manufactureDay) : String(item.manufactureYear ?? ''),
    ],
    [tf('installDate'), item.installDate ? dayText(item.installDate) : ''],
    [tf('ratedCapacity'), item.ratedCapacity ?? ''],
    [tf('lastExaminedAt'), item.lastExaminedAt ? dayText(item.lastExaminedAt) : ''],
    [tf('certificateReference'), item.certificateReference ?? ''],
  ]
  const shown = details.filter(([, value]) => value)

  return (
    <li className="rounded-md px-1 py-1 text-[13px]" data-testid={`equipment-item-${item.id}`}>
      <div className="flex items-start gap-2">
        <button
          type="button"
          className="mt-0.5 shrink-0 rounded text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-expanded={open}
          aria-controls={detailsId}
          aria-label={t(open ? 'hideDetails' : 'showDetails', { name: item.label })}
          onClick={() => setOpen((value) => !value)}
        >
          {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline justify-between gap-x-2">
            <span className="font-medium">{item.typeName}</span>
            {item.nextExaminationDue && (
              <span
                className={cn(
                  'text-xs tabular-nums',
                  state === 'overdue'
                    ? 'font-medium text-destructive'
                    : state === 'soon'
                      ? 'font-medium text-foreground'
                      : 'text-muted-foreground'
                )}
                data-testid="equipment-examination"
              >
                {t(
                  state === 'overdue'
                    ? 'examinationOverdue'
                    : state === 'soon'
                      ? 'examinationSoon'
                      : 'examinationDue',
                  { date: dayText(item.nextExaminationDue) }
                )}
              </span>
            )}
          </div>
          {(name || item.serialNumber) && (
            <p className="truncate text-xs text-muted-foreground">
              {[name, item.serialNumber ? t('serial', { serial: item.serialNumber }) : '']
                .filter(Boolean)
                .join(' · ')}
            </p>
          )}
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 shrink-0"
              aria-label={t('more', { name: item.label })}
            >
              <MoreHorizontal className="h-3.5 w-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={onEdit}>{t('edit')}</DropdownMenuItem>
            <DropdownMenuItem onSelect={onMove}>
              {t(isMarine ? 'moveMarine' : 'move')}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={remove}>{t('remove')}</DropdownMenuItem>
            <DropdownMenuItem onSelect={destroy} className="text-destructive">
              {t('delete')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {open && (
        <div id={detailsId} className="mt-2 space-y-3 pl-6">
          {shown.length > 0 && (
            <dl className="grid grid-cols-[minmax(0,auto)_minmax(0,1fr)] gap-x-3 gap-y-1 text-xs">
              {shown.map(([label, value]) => (
                <div key={label} className="contents">
                  <dt className="text-muted-foreground">{label}</dt>
                  <dd className="min-w-0 break-words">{value}</dd>
                </div>
              ))}
            </dl>
          )}
          {item.notes && (
            <p className="whitespace-pre-wrap break-words text-xs text-muted-foreground">
              {item.notes}
            </p>
          )}
          {item.report && (
            <a
              href={item.report.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex max-w-full items-center gap-1 text-xs text-primary underline-offset-2 hover:underline"
            >
              <FileText className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{item.report.name}</span>
            </a>
          )}
          <VehicleMeters
            vehicleId={vehicleId}
            equipmentItemId={item.id}
            types={equipment.meterTypes}
            meters={item.meters}
          />
        </div>
      )}
    </li>
  )
}

function HistoryList({ equipment }: { equipment: VehicleEquipmentView }) {
  const t = useTranslations('equipment.vehicle')
  const router = useRouter()
  const format = useFormatter()
  const { timezone } = useDateSettings()
  // When it left is a moment: its day is the workshop's.
  const day = (iso: string) =>
    format.dateTime(new Date(iso), { dateStyle: 'medium', timeZone: timezone || undefined })

  const refit = async (item: EquipmentItemView) => {
    const result = await refitEquipmentItem(item.id)
    if (!result.success) {
      toast.error(result.error || t('saveError'))
      return
    }
    toast.success(t('refitted', { name: item.label }))
    router.refresh()
  }

  return (
    <ul className="mt-1 space-y-2 pl-1" data-testid="equipment-history">
      {equipment.history.map((entry) => (
        <li key={entry.fittingId} className="space-y-0.5 text-xs">
          <p className="min-w-0 break-words">{entry.item.label}</p>
          <p className="text-muted-foreground">
            {entry.movedTo ? (
              t.rich('movedTo', {
                date: day(entry.endedAt),
                vehicle: () => (
                  <Link href={`/vehicles/${entry.movedTo?.id}`} className="underline">
                    {entry.movedTo?.name}
                  </Link>
                ),
              })
            ) : (
              <>
                {t('removedOn', { date: day(entry.endedAt) })}
                {entry.item.removedAt &&
                  entry.item.vehicleId &&
                  !hasNewerFitting(equipment, entry) && (
                    <Badge
                      asChild
                      variant="outline"
                      className="ml-2 cursor-pointer align-middle hover:bg-accent"
                    >
                      <button type="button" onClick={() => refit(entry.item)}>
                        {t('refit')}
                      </button>
                    </Badge>
                  )}
              </>
            )}
          </p>
        </li>
      ))}
    </ul>
  )
}

/** Only the newest removal of an item offers to put it back. */
function hasNewerFitting(
  equipment: VehicleEquipmentView,
  entry: VehicleEquipmentView['history'][number]
): boolean {
  return equipment.history.some(
    (other) =>
      other.item.id === entry.item.id &&
      other.fittingId !== entry.fittingId &&
      other.endedAt > entry.endedAt
  )
}
