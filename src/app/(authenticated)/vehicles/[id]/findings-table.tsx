'use client'

import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useState } from 'react'
import { useFormatDate } from '@/lib/use-format-date'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
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
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '@/components/ui/context-menu'
import { useInfiniteRows } from '@/components/infinite-list/use-infinite-rows'
import {
  InfiniteListCount,
  InfiniteListFooter,
  InfiniteTableFooter,
} from '@/components/infinite-list/infinite-list-footer'
import { getFindingRows } from '@/features/vehicles/Actions/getFindingRows'
import type { Cursor } from '@/lib/keyset'
import { cn } from '@/lib/utils'
import { Loader2, MoreVertical, Pencil, Plus, Trash2, Wrench, ExternalLink } from 'lucide-react'
import { useTranslations } from 'next-intl'

export interface FindingRow {
  id: string
  description: string
  severity: string
  status: string
  notes: string | null
  imageUrls: string[]
  createdAt: Date
  serviceRecord: { id: string; title: string } | null
  resolvedServiceRecord: { id: string; title: string } | null
}

/** One batch of the list; the first also carries the total. */
export interface FindingBatch {
  rows: FindingRow[]
  nextCursor: Cursor | null
  total?: number
}

interface FindingsTableProps {
  vehicleId: string
  /** The first batch, rendered on the server; the rest load as the list scrolls. */
  initial: FindingBatch
  /**
   * Where the sticky header stops: under the page header while the window
   * scrolls, at the top of the box when the list sits in one.
   */
  stickyHeaderClassName?: string
  /** Leave out where the page has its own button for adding an observation. */
  onAddFinding?: () => void
  onEditFinding: (finding: FindingRow) => void
  onDeleteFinding: (id: string) => void
  /** The selected observations, out of every row loaded so far. */
  onCreateWorkOrder: (findings: FindingRow[]) => void
  isCreatingWorkOrder?: boolean
}

const severityColors: Record<string, string> = {
  urgent: 'bg-red-500/10 text-red-500 border-red-500/20',
  needs_work: 'bg-amber-500/10 text-amber-600 border-amber-500/20',
  monitor: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
}

export function FindingsTable({
  vehicleId,
  initial,
  stickyHeaderClassName = 'top-16',
  onAddFinding,
  onEditFinding,
  onDeleteFinding,
  onCreateWorkOrder,
  isCreatingWorkOrder = false,
}: FindingsTableProps) {
  const router = useRouter()
  const { formatDate } = useFormatDate()
  const t = useTranslations('vehicles.findings')
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const list = useInfiniteRows<FindingRow, Cursor, FindingBatch>({
    queryKey: ['vehicle-findings', vehicleId],
    initial,
    fetchPage: (cursor) => getFindingRows({ vehicleId, cursor }),
  })
  const records = list.rows
  // Only rows still in the list count: one deleted since it was ticked is gone.
  const chosen = records.filter((r) => selected.has(r.id))
  const allChosen = records.length > 0 && chosen.length === records.length

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // The header box covers the rows loaded so far; ticks stay as more arrive.
  const toggleAll = () => {
    setSelected(allChosen ? new Set() : new Set(records.map((r) => r.id)))
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div
        className={cn(
          'flex items-center justify-between gap-2',
          !onAddFinding && list.total === 0 && 'hidden'
        )}
      >
        <div className="flex items-center gap-2">
          {chosen.length > 0 ? (
            <Button
              size="sm"
              className="h-9 md:h-8"
              onClick={() => onCreateWorkOrder(chosen)}
              disabled={isCreatingWorkOrder}
            >
              {isCreatingWorkOrder ? (
                <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Wrench className="mr-1 h-3.5 w-3.5" />
              )}
              {t('createWorkOrder', { count: chosen.length })}
            </Button>
          ) : (
            <InfiniteListCount shown={records.length} total={list.total} />
          )}
        </div>
        {onAddFinding && (
          <Button
            size="sm"
            onClick={onAddFinding}
            aria-label={t('addFinding')}
            title={t('addFinding')}
            className="h-9 w-9 p-0 md:h-8 md:w-auto md:px-3"
          >
            <Plus className="h-4 w-4 md:mr-1 md:h-3.5 md:w-3.5" />
            <span className="hidden md:inline">{t('addFinding')}</span>
          </Button>
        )}
      </div>

      {/* Card list (phones + small tablets) */}
      <div className="space-y-2 md:hidden">
        {records.length === 0 ? (
          <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
            {t('empty')}
          </div>
        ) : (
          records.map((f) => (
            <div key={f.id} className="rounded-lg border bg-card p-3">
              <div className="flex items-start gap-3">
                <Checkbox
                  className="mt-0.5"
                  checked={selected.has(f.id)}
                  onCheckedChange={() => toggleSelect(f.id)}
                />
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{f.description}</p>
                  {f.notes && <p className="mt-0.5 text-xs text-muted-foreground">{f.notes}</p>}
                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                    <Badge
                      variant="outline"
                      className={`text-xs ${severityColors[f.severity] || ''}`}
                    >
                      {t(
                        `severity.${f.severity}` as
                          | 'severity.urgent'
                          | 'severity.needs_work'
                          | 'severity.monitor'
                      )}
                    </Badge>
                    <span className="font-mono text-xs text-muted-foreground">
                      {formatDate(new Date(f.createdAt))}
                    </span>
                  </div>
                  {f.serviceRecord && (
                    <Link
                      href={`/vehicles/${vehicleId}/service/${f.serviceRecord.id}`}
                      className="mt-1.5 inline-flex items-center gap-1 text-xs text-blue-600 underline decoration-blue-600/30 dark:text-blue-400 dark:decoration-blue-400/30"
                    >
                      <ExternalLink className="h-3 w-3" />
                      {t('discoveredIn')}: {f.serviceRecord.title}
                    </Link>
                  )}
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="-mr-1 h-9 w-9 shrink-0"
                      aria-label={t('openMenu')}
                    >
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => onEditFinding(f)}>
                      <Pencil className="mr-2 h-4 w-4" />
                      {t('edit')}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="text-destructive"
                      onClick={() => onDeleteFinding(f.id)}
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      {t('delete')}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          ))
        )}
        {records.length > 0 && <InfiniteListFooter state={list} />}
      </div>

      {/* Table (md and up). The rows scroll with the page (or the box the page
          puts the list in), so the table's own box must not clip them. */}
      <div className="hidden rounded-lg border md:block">
        <Table containerClassName="overflow-visible">
          <TableHeader sticky className={stickyHeaderClassName}>
            <TableRow>
              <TableHead className="w-10 px-2">
                {records.length > 0 && (
                  <Checkbox
                    checked={allChosen ? true : chosen.length > 0 ? 'indeterminate' : false}
                    onCheckedChange={toggleAll}
                    aria-label={t('selectAll')}
                  />
                )}
              </TableHead>
              <TableHead className="w-28">{t('table.severity')}</TableHead>
              <TableHead>{t('table.description')}</TableHead>
              <TableHead className="hidden w-30 sm:table-cell">{t('table.date')}</TableHead>
              <TableHead className="w-12.5"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {records.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="h-32 text-center text-muted-foreground">
                  {t('empty')}
                </TableCell>
              </TableRow>
            ) : (
              records.map((f) => (
                <ContextMenu key={f.id} modal={false}>
                  <ContextMenuTrigger asChild>
                    <TableRow>
                      <TableCell className="px-2">
                        <Checkbox
                          checked={selected.has(f.id)}
                          onCheckedChange={() => toggleSelect(f.id)}
                        />
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={`text-xs ${severityColors[f.severity] || ''}`}
                        >
                          {t(
                            `severity.${f.severity}` as
                              | 'severity.urgent'
                              | 'severity.needs_work'
                              | 'severity.monitor'
                          )}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div>
                          <span className="font-medium">{f.description}</span>
                          {f.notes && (
                            <p className="mt-0.5 truncate text-xs text-muted-foreground">
                              {f.notes}
                            </p>
                          )}
                          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs">
                            {f.serviceRecord && (
                              <Link
                                href={`/vehicles/${vehicleId}/service/${f.serviceRecord.id}`}
                                className="inline-flex items-center gap-1 text-blue-600 underline decoration-blue-600/30 hover:decoration-blue-600 dark:text-blue-400 dark:decoration-blue-400/30 dark:hover:decoration-blue-400"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <ExternalLink className="h-3 w-3" />
                                {t('discoveredIn')}: {f.serviceRecord.title}
                              </Link>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="hidden font-mono text-xs text-muted-foreground sm:table-cell">
                        {formatDate(new Date(f.createdAt))}
                      </TableCell>
                      <TableCell className="px-2">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              aria-label={t('openMenu')}
                            >
                              <MoreVertical className="h-3.5 w-3.5" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => onEditFinding(f)}>
                              <Pencil className="mr-2 h-4 w-4" />
                              {t('edit')}
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="text-destructive"
                              onClick={() => onDeleteFinding(f.id)}
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              {t('delete')}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  </ContextMenuTrigger>
                  <ContextMenuContent className="min-w-52">
                    <ContextMenuItem onClick={() => onEditFinding(f)}>
                      <Pencil className="mr-2 h-4 w-4" />
                      {t('edit')}
                    </ContextMenuItem>
                    {f.serviceRecord && (
                      <ContextMenuItem
                        onClick={() =>
                          router.push(`/vehicles/${vehicleId}/service/${f.serviceRecord?.id}`)
                        }
                      >
                        <ExternalLink className="mr-2 h-4 w-4" />
                        {t('discoveredIn')}
                      </ContextMenuItem>
                    )}
                    <ContextMenuItem variant="destructive" onClick={() => onDeleteFinding(f.id)}>
                      <Trash2 className="mr-2 h-4 w-4" />
                      {t('delete')}
                    </ContextMenuItem>
                  </ContextMenuContent>
                </ContextMenu>
              ))
            )}
            {records.length > 0 && <InfiniteTableFooter state={list} colSpan={5} />}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
