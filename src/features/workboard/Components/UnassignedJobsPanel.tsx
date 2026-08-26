'use client'

import { useState } from 'react'
import { Search } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useDroppable } from '@dnd-kit/core'
import { useWorkBoardStore } from '../store/workboardStore'
import { UnassignedJobCard } from './BoardJobCard'
import { useTranslations } from 'next-intl'
import { cn } from '@/lib/utils'

export function UnassignedJobsPanel() {
  const serviceRecords = useWorkBoardStore((s) => s.unassignedServiceRecords)
  const inspections = useWorkBoardStore((s) => s.unassignedInspections)
  const [search, setSearch] = useState('')
  const t = useTranslations('workBoard.unassigned')

  const { isOver, setNodeRef } = useDroppable({
    id: 'unassigned-drop',
    data: { unassigned: true },
  })

  const lowerSearch = search.toLowerCase()

  const filteredSR = serviceRecords.filter((sr) => {
    if (!search) return true
    return (
      sr.title.toLowerCase().includes(lowerSearch) ||
      sr.vehicle?.make.toLowerCase().includes(lowerSearch) ||
      sr.vehicle?.model.toLowerCase().includes(lowerSearch) ||
      sr.vehicle?.licensePlate?.toLowerCase().includes(lowerSearch)
    )
  })

  const filteredInsp = inspections.filter((i) => {
    if (!search) return true
    return (
      i.template.name.toLowerCase().includes(lowerSearch) ||
      i.vehicle.make.toLowerCase().includes(lowerSearch) ||
      i.vehicle.model.toLowerCase().includes(lowerSearch) ||
      i.vehicle.licensePlate?.toLowerCase().includes(lowerSearch)
    )
  })

  const totalCount = filteredSR.length + filteredInsp.length

  return (
    <div
      ref={setNodeRef}
      className={cn(
        // The sidebar is a desktop affordance: below md the board needs every
        // pixel of width it has, so the same list opens as a drawer instead.
        'hidden w-64 shrink-0 flex-col rounded-lg border bg-muted/30 transition-colors md:flex',
        isOver && 'ring-2 ring-primary/50 bg-primary/5'
      )}
    >
      <div className="border-b p-3">
        <h3 className="mb-2 text-sm font-semibold">{t('title', { count: totalCount })}</h3>
        <div className="relative">
          <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={t('searchPlaceholder')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 pl-7 text-xs"
          />
        </div>
      </div>
      <ScrollArea className="flex-1">
        <div className="flex flex-col gap-1 p-2">
          {filteredSR.map((sr) => (
            <UnassignedJobCard key={sr.id} job={sr} type="serviceRecord" />
          ))}
          {filteredInsp.map((insp) => (
            <UnassignedJobCard key={insp.id} job={insp} type="inspection" />
          ))}
          {totalCount === 0 && (
            <p className="py-8 text-center text-xs text-muted-foreground">{t('empty')}</p>
          )}
        </div>
      </ScrollArea>
    </div>
  )
}

/**
 * The same list, for the drawer that replaces the sidebar on a phone.
 *
 * Not a drop target: while the drawer is open it covers the board, so there is
 * nowhere to drop onto. It is for seeing and searching what is waiting; the
 * dragging happens on a screen wide enough to show both at once.
 */
export function UnassignedJobsList() {
  const serviceRecords = useWorkBoardStore((s) => s.unassignedServiceRecords)
  const inspections = useWorkBoardStore((s) => s.unassignedInspections)
  const [search, setSearch] = useState('')
  const t = useTranslations('workBoard.unassigned')

  const lowerSearch = search.toLowerCase()
  const filteredSR = serviceRecords.filter(
    (sr) =>
      !search ||
      sr.title.toLowerCase().includes(lowerSearch) ||
      sr.vehicle?.make.toLowerCase().includes(lowerSearch) ||
      sr.vehicle?.model.toLowerCase().includes(lowerSearch) ||
      sr.vehicle?.licensePlate?.toLowerCase().includes(lowerSearch)
  )
  const filteredInsp = inspections.filter(
    (i) =>
      !search ||
      i.template.name.toLowerCase().includes(lowerSearch) ||
      i.vehicle.make.toLowerCase().includes(lowerSearch) ||
      i.vehicle.model.toLowerCase().includes(lowerSearch) ||
      i.vehicle.licensePlate?.toLowerCase().includes(lowerSearch)
  )
  const totalCount = filteredSR.length + filteredInsp.length

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="relative px-4 pb-3">
        <Search className="absolute left-6 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder={t('searchPlaceholder')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-9 pl-7"
        />
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <div className="flex flex-col gap-1 px-4 pb-4">
          {filteredSR.map((sr) => (
            <UnassignedJobCard key={sr.id} job={sr} type="serviceRecord" />
          ))}
          {filteredInsp.map((insp) => (
            <UnassignedJobCard key={insp.id} job={insp} type="inspection" />
          ))}
          {totalCount === 0 && (
            <p className="py-8 text-center text-xs text-muted-foreground">{t('empty')}</p>
          )}
        </div>
      </ScrollArea>
    </div>
  )
}
