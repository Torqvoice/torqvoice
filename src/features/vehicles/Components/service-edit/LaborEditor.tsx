'use client'

import { useRef, useCallback, useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { AlertTriangle, Eye, GripVertical, Layers, Plus, Trash2, Wrench } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { formatCurrency, getCurrencySymbol } from '@/lib/format'
import { useTranslations } from 'next-intl'
import type { ServiceLaborInput } from '@/features/vehicles/Schema/serviceSchema'
import { makeEmptyLabor, makeEmptyService } from './form-types'
import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

interface LaborEditorProps {
  laborItems: ServiceLaborInput[]
  setLaborItems: React.Dispatch<React.SetStateAction<ServiceLaborInput[]>>
  updateLabor: (index: number, field: keyof ServiceLaborInput, value: string | number) => void
  laborSubtotal: number
  currencyCode: string
  defaultLaborRate: number
  hasPresets?: boolean
  onOpenPresets?: () => void
  onAddFinding?: () => void
  openObservationsCount?: number
  onShowExistingObservations?: () => void
}

function SortableLaborRow({
  id,
  labor,
  index,
  updateLabor,
  onDelete,
  currencyCode,
  t,
  dragEnabled,
}: {
  id: string
  labor: ServiceLaborInput
  index: number
  updateLabor: (index: number, field: keyof ServiceLaborInput, value: string | number) => void
  onDelete: () => void
  currencyCode: string
  t: (key: string) => string
  dragEnabled: boolean
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id })

  const style = dragEnabled ? {
    transform: CSS.Transform.toString(transform),
    transition,
  } : undefined

  const isService = labor.pricingType === 'service'

  return (
    <div
      ref={dragEnabled ? setNodeRef : undefined}
      style={style}
      className={`grid grid-cols-[auto_1fr] gap-2 sm:grid-cols-[auto_2fr_1fr_1fr_1fr_auto] ${isDragging && dragEnabled ? 'z-10 opacity-75' : ''}`}
    >
      <button
        type="button"
        className="flex h-9 w-6 cursor-grab items-center justify-center text-muted-foreground hover:text-foreground active:cursor-grabbing"
        {...(dragEnabled ? { ...attributes, ...listeners } : {})}
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <div className="grid grid-cols-2 gap-2 sm:contents">
        <div className="col-span-2 flex gap-2 sm:col-span-1">
          <Textarea
            placeholder={t('descriptionPlaceholder')}
            value={labor.description}
            onChange={(e) => updateLabor(index, 'description', e.target.value)}
            rows={1}
            className="min-h-9 flex-1 resize-none"
          />
          <button
            type="button"
            className={`shrink-0 rounded-md border px-2 text-[10px] font-medium transition-all ${
              isService
                ? 'border-blue-500/30 bg-blue-500/10 text-blue-600 hover:bg-blue-500/20 hover:border-blue-500/50'
                : 'border-muted text-muted-foreground hover:bg-muted hover:text-foreground hover:border-foreground/20'
            }`}
            onClick={() => updateLabor(index, 'pricingType', isService ? 'hourly' : 'service')}
            title={isService ? t('switchToHourlyHint') : t('switchToServiceHint')}
          >
            {isService ? t('serviceTag') : t('hourlyTag')}
          </button>
        </div>
        <Input
          type="number"
          min="0"
          step={isService ? '1' : 'any'}
          placeholder={isService ? t('qty') : t('hours')}
          value={labor.hours}
          onChange={(e) => updateLabor(index, 'hours', e.target.value)}
        />
        <Input
          type="number"
          min="0"
          step="0.01"
          value={labor.rate}
          onChange={(e) => updateLabor(index, 'rate', e.target.value)}
        />
        <div className="flex items-center rounded-md bg-muted/50 px-3 text-sm font-medium">
          {formatCurrency(labor.total, currencyCode)}
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-9 w-9 text-muted-foreground hover:text-destructive"
          onClick={onDelete}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}

export function LaborEditor({
  laborItems,
  setLaborItems,
  updateLabor,
  laborSubtotal,
  currencyCode,
  defaultLaborRate,
  hasPresets,
  onOpenPresets,
  onAddFinding,
  openObservationsCount = 0,
  onShowExistingObservations,
}: LaborEditorProps) {
  const t = useTranslations('service.labor')
  const cs = getCurrencySymbol(currencyCode)
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  const keyCounterRef = useRef(0)
  const keysRef = useRef<string[]>([])

  // Keep keys array in sync with items length
  while (keysRef.current.length < laborItems.length) {
    keysRef.current.push(`labor-${keyCounterRef.current++}`)
  }
  if (keysRef.current.length > laborItems.length) {
    keysRef.current = keysRef.current.slice(0, laborItems.length)
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = keysRef.current.indexOf(active.id as string)
    const newIndex = keysRef.current.indexOf(over.id as string)
    if (oldIndex === -1 || newIndex === -1) return
    keysRef.current = arrayMove(keysRef.current, oldIndex, newIndex)
    setLaborItems((prev) => arrayMove(prev, oldIndex, newIndex))
  }, [setLaborItems])

  const addLaborAtStart = useCallback(() => {
    const key = `labor-${keyCounterRef.current++}`
    keysRef.current = [key, ...keysRef.current]
    setLaborItems((prev) => [makeEmptyLabor(defaultLaborRate), ...prev])
  }, [setLaborItems, defaultLaborRate])

  const addServiceAtStart = useCallback(() => {
    const key = `labor-${keyCounterRef.current++}`
    keysRef.current = [key, ...keysRef.current]
    setLaborItems((prev) => [makeEmptyService(), ...prev])
  }, [setLaborItems])

  const addLaborAtEnd = useCallback(() => {
    const key = `labor-${keyCounterRef.current++}`
    keysRef.current = [...keysRef.current, key]
    setLaborItems((prev) => [...prev, makeEmptyLabor(defaultLaborRate)])
  }, [setLaborItems, defaultLaborRate])

  const addServiceAtEnd = useCallback(() => {
    const key = `labor-${keyCounterRef.current++}`
    keysRef.current = [...keysRef.current, key]
    setLaborItems((prev) => [...prev, makeEmptyService()])
  }, [setLaborItems])

  const deleteLabor = useCallback((index: number) => {
    keysRef.current = keysRef.current.filter((_, j) => j !== index)
    setLaborItems((prev) => prev.filter((_, j) => j !== index))
  }, [setLaborItems])

  return (
    <div className="rounded-lg border p-3 space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">{t('title')}</h3>
        <div className="flex flex-wrap gap-1.5">
          {hasPresets && onOpenPresets && (
            <Button type="button" variant="outline" size="sm" onClick={onOpenPresets}>
              <Layers className="mr-1 h-3.5 w-3.5" />
              <span className="hidden sm:inline">{t('fromPresets')}</span>
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={addLaborAtStart}
          >
            <Plus className="mr-1 h-3.5 w-3.5" />
            <span className="hidden sm:inline">{t('addLabor')}</span>
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={addServiceAtStart}
          >
            <Wrench className="mr-1 h-3.5 w-3.5" />
            <span className="hidden sm:inline">{t('addService')}</span>
          </Button>
          {onAddFinding && openObservationsCount > 0 && onShowExistingObservations ? (
            <DropdownMenu modal={false}>
              <DropdownMenuTrigger asChild>
                <Button type="button" variant="outline" size="sm">
                  <AlertTriangle className="mr-1 h-3.5 w-3.5 text-amber-500" />
                  <span className="hidden sm:inline">{t('addFinding')}</span>
                  <span className="ml-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-500 px-1 text-[10px] font-medium text-white">
                    {openObservationsCount}
                  </span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onClick={(e) => { e.preventDefault(); onAddFinding() }}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  {t('newObservation')}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={(e) => { e.preventDefault(); onShowExistingObservations() }}
                >
                  <Eye className="mr-2 h-4 w-4" />
                  {t('addExisting', { count: openObservationsCount })}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : onAddFinding ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onAddFinding}
            >
              <AlertTriangle className="mr-1 h-3.5 w-3.5 text-amber-500" />
              <span className="hidden sm:inline">{t('addFinding')}</span>
            </Button>
          ) : null}
        </div>
      </div>

      {laborItems.length > 0 && (
        <>
          <div className="hidden grid-cols-[auto_2fr_1fr_1fr_1fr_auto] gap-2 text-xs font-medium text-muted-foreground sm:grid">
            <span className="w-6" />
            <span>{t('description')}</span>
            <span>{t('qtyOrHours')}</span>
            <span>{t('rate', { currency: cs })}</span>
            <span>{t('total')}</span>
            <span />
          </div>
          {mounted ? (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={keysRef.current} strategy={verticalListSortingStrategy}>
                {laborItems.map((labor, i) => (
                  <SortableLaborRow
                    key={keysRef.current[i]}
                    id={keysRef.current[i]}
                    labor={labor}
                    index={i}
                    updateLabor={updateLabor}
                    onDelete={() => deleteLabor(i)}
                    currencyCode={currencyCode}
                    t={t}
                    dragEnabled
                  />
                ))}
              </SortableContext>
            </DndContext>
          ) : (
            laborItems.map((labor, i) => (
              <SortableLaborRow
                key={keysRef.current[i]}
                id={keysRef.current[i]}
                labor={labor}
                index={i}
                updateLabor={updateLabor}
                onDelete={() => deleteLabor(i)}
                currencyCode={currencyCode}
                t={t}
                dragEnabled={false}
              />
            ))
          )}
          <button
            type="button"
            className="flex w-full items-center justify-center rounded-md border border-dashed border-muted-foreground/25 py-1.5 text-muted-foreground transition-colors hover:border-muted-foreground/50 hover:text-foreground"
            onClick={addLaborAtEnd}
          >
            <Plus className="h-4 w-4" />
          </button>
          <div className="flex justify-end pt-1 text-sm">
            <span className="font-medium">
              {t('subtotal', { amount: formatCurrency(laborSubtotal, currencyCode) })}
            </span>
          </div>
        </>
      )}

      {laborItems.length === 0 && (
        <div className="flex gap-2">
          <button
            type="button"
            className="flex flex-1 items-center justify-center rounded-md border border-dashed border-muted-foreground/25 py-1.5 text-muted-foreground transition-colors hover:border-muted-foreground/50 hover:text-foreground"
            onClick={addLaborAtEnd}
          >
            <Plus className="mr-1 h-4 w-4" />
            <span className="text-sm">{t('addLabor')}</span>
          </button>
          <button
            type="button"
            className="flex flex-1 items-center justify-center rounded-md border border-dashed border-muted-foreground/25 py-1.5 text-muted-foreground transition-colors hover:border-muted-foreground/50 hover:text-foreground"
            onClick={addServiceAtEnd}
          >
            <Wrench className="mr-1 h-4 w-4" />
            <span className="text-sm">{t('addService')}</span>
          </button>
        </div>
      )}
    </div>
  )
}
