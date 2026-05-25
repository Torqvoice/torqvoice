'use client'

import { useRef, useCallback, useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { GripVertical, Package, Percent, Plus, ScanBarcode, Trash2 } from 'lucide-react'
import { useFormatCurrency } from '@/components/currency-settings-context'
import { useTranslations } from 'next-intl'
import type { ServicePartInput } from '@/features/vehicles/Schema/serviceSchema'
import { emptyPart } from './form-types'
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

interface PartsEditorProps {
  partItems: ServicePartInput[]
  setPartItems: React.Dispatch<React.SetStateAction<ServicePartInput[]>>
  updatePart: (index: number, field: keyof ServicePartInput, value: string | number) => void
  partsSubtotal: number
  currencyCode: string
  hasInventory: boolean
  onOpenInventory: () => void
  onScanBarcode?: () => void
  /** Default markup % applied to new manually-added rows. Hidden from customers. */
  defaultMarkupPercent?: number
  /** When true, the bulk "Apply markup" button affects inventory-sourced rows too. */
  markupAppliesToInventory?: boolean
}

function SortablePartRow({
  id,
  part,
  index,
  updatePart,
  onDelete,
  currencyCode,
  t,
  dragEnabled,
}: {
  id: string
  part: ServicePartInput
  index: number
  updatePart: (index: number, field: keyof ServicePartInput, value: string | number) => void
  onDelete: () => void
  currencyCode: string
  t: (key: string) => string
  dragEnabled: boolean
}) {
  const formatCurrency = useFormatCurrency()
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

  return (
    <div
      ref={dragEnabled ? setNodeRef : undefined}
      style={style}
      className={`grid grid-cols-[auto_1fr] gap-2 sm:grid-cols-[auto_1fr_2fr_0.6fr_0.9fr_0.7fr_0.9fr_0.9fr_auto] ${isDragging && dragEnabled ? 'z-10 opacity-75' : ''}`}
    >
      <button
        type="button"
        className="flex h-9 w-6 cursor-grab items-center justify-center text-muted-foreground hover:text-foreground active:cursor-grabbing"
        {...(dragEnabled ? { ...attributes, ...listeners } : {})}
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <div className="grid grid-cols-2 gap-2 sm:contents">
        <Input
          placeholder={t('partNumber')}
          value={part.partNumber ?? ''}
          onChange={(e) => updatePart(index, 'partNumber', e.target.value)}
        />
        <Textarea
          placeholder={t('namePlaceholder')}
          value={part.name}
          onChange={(e) => updatePart(index, 'name', e.target.value)}
          rows={1}
          className="min-h-9 resize-none"
        />
        <Input
          type="number"
          min="0"
          step="0.01"
          value={part.quantity}
          onChange={(e) => updatePart(index, 'quantity', e.target.value)}
        />
        <Input
          type="number"
          min="0"
          step="0.01"
          placeholder={t('unitCost')}
          title={t('unitCostHint')}
          value={part.unitCost ?? 0}
          onChange={(e) => updatePart(index, 'unitCost', e.target.value)}
        />
        <div className="relative">
          <Input
            type="number"
            min="0"
            step="0.1"
            placeholder={t('markupPercent')}
            title={t('markupPercentHint')}
            value={part.markupPercent ?? 0}
            onChange={(e) => updatePart(index, 'markupPercent', e.target.value)}
            className="pr-6"
          />
          <Percent className="pointer-events-none absolute right-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
        </div>
        <Input
          type="number"
          min="0"
          step="0.01"
          value={part.unitPrice}
          onChange={(e) => updatePart(index, 'unitPrice', e.target.value)}
        />
        <div className="flex items-center rounded-md bg-muted/50 px-3 text-sm font-medium">
          {formatCurrency(part.total, currencyCode)}
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-9 w-9 text-muted-foreground hover:text-destructive"
          onClick={onDelete}
          aria-label={t('deleteRow')}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}

export function PartsEditor({
  partItems,
  setPartItems,
  updatePart,
  partsSubtotal,
  currencyCode,
  hasInventory,
  onOpenInventory,
  onScanBarcode,
  defaultMarkupPercent = 0,
  markupAppliesToInventory = false,
}: PartsEditorProps) {
  const formatCurrency = useFormatCurrency()
  const t = useTranslations('service.parts')
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  const keyCounterRef = useRef(0)
  const keysRef = useRef<string[]>([])

  // Keep keys array in sync with items length
  while (keysRef.current.length < partItems.length) {
    keysRef.current.push(`part-${keyCounterRef.current++}`)
  }
  if (keysRef.current.length > partItems.length) {
    keysRef.current = keysRef.current.slice(0, partItems.length)
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
    setPartItems((prev) => arrayMove(prev, oldIndex, newIndex))
  }, [setPartItems])

  const addPartAtStart = useCallback(() => {
    const key = `part-${keyCounterRef.current++}`
    keysRef.current = [key, ...keysRef.current]
    setPartItems((prev) => [emptyPart(defaultMarkupPercent), ...prev])
  }, [setPartItems, defaultMarkupPercent])

  const addPartAtEnd = useCallback(() => {
    const key = `part-${keyCounterRef.current++}`
    keysRef.current = [...keysRef.current, key]
    setPartItems((prev) => [...prev, emptyPart(defaultMarkupPercent)])
  }, [setPartItems, defaultMarkupPercent])

  const deletePart = useCallback((index: number) => {
    keysRef.current = keysRef.current.filter((_, j) => j !== index)
    setPartItems((prev) => prev.filter((_, j) => j !== index))
  }, [setPartItems])

  /**
   * Apply the default markup % to every eligible row. Eligible means:
   *  - non-inventory rows always, OR
   *  - all rows when `markupAppliesToInventory` is true.
   * Recomputes unitPrice = unitCost * (1 + markup/100) and total = qty * unitPrice.
   * Customer never sees cost or markup — only unitPrice/total.
   */
  const applyMarkupToAll = useCallback(() => {
    setPartItems((prev) =>
      prev.map((p) => {
        const eligible = markupAppliesToInventory || !p.inventoryPartId
        if (!eligible) return p
        const cost = Number(p.unitCost) || 0
        const markup = defaultMarkupPercent
        const unitPrice = Math.round(cost * (1 + markup / 100) * 100) / 100
        return {
          ...p,
          markupPercent: markup,
          unitPrice,
          total: Number(p.quantity) * unitPrice,
        }
      })
    )
  }, [setPartItems, defaultMarkupPercent, markupAppliesToInventory])

  return (
    <div className="rounded-lg border p-3 space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">{t('title')}</h3>
        <div className="flex gap-1.5">
          {defaultMarkupPercent > 0 && partItems.length > 0 && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={applyMarkupToAll}
              title={t('applyMarkupHint', { percent: defaultMarkupPercent })}
            >
              <Percent className="h-3.5 w-3.5 sm:mr-1" />
              <span className="hidden sm:inline">
                {t('applyMarkup', { percent: defaultMarkupPercent })}
              </span>
            </Button>
          )}
          {hasInventory && (
            <Button type="button" variant="outline" size="sm" onClick={onOpenInventory}>
              <Package className="h-3.5 w-3.5 sm:mr-1" />
              <span className="hidden sm:inline">{t('fromInventory')}</span>
            </Button>
          )}
          {onScanBarcode && (
            <Button type="button" variant="outline" size="sm" onClick={onScanBarcode}>
              <ScanBarcode className="h-3.5 w-3.5 sm:mr-1" />
              <span className="hidden sm:inline">{t('scanBarcode')}</span>
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={addPartAtStart}
          >
            <Plus className="h-3.5 w-3.5 sm:mr-1" />
            <span className="hidden sm:inline">{t('addPart')}</span>
          </Button>
        </div>
      </div>

      {partItems.length > 0 && (
        <>
          <div className="hidden grid-cols-[auto_1fr_2fr_0.6fr_0.9fr_0.7fr_0.9fr_0.9fr_auto] gap-2 text-xs font-medium text-muted-foreground sm:grid">
            <span className="w-6" />
            <span>{t('partNumber')}</span>
            <span>{t('name')}</span>
            <span>{t('qty')}</span>
            <span title={t('unitCostHint')}>{t('unitCost')}</span>
            <span title={t('markupPercentHint')}>{t('markupPercent')}</span>
            <span>{t('unitPrice')}</span>
            <span>{t('total')}</span>
            <span />
          </div>
          {mounted ? (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={keysRef.current} strategy={verticalListSortingStrategy}>
                {partItems.map((part, i) => (
                  <SortablePartRow
                    key={keysRef.current[i]}
                    id={keysRef.current[i]}
                    part={part}
                    index={i}
                    updatePart={updatePart}
                    onDelete={() => deletePart(i)}
                    currencyCode={currencyCode}
                    t={t}
                    dragEnabled
                  />
                ))}
              </SortableContext>
            </DndContext>
          ) : (
            partItems.map((part, i) => (
              <SortablePartRow
                key={keysRef.current[i]}
                id={keysRef.current[i]}
                part={part}
                index={i}
                updatePart={updatePart}
                onDelete={() => deletePart(i)}
                currencyCode={currencyCode}
                t={t}
                dragEnabled={false}
              />
            ))
          )}
          <button
            type="button"
            className="flex w-full items-center justify-center rounded-md border border-dashed border-muted-foreground/25 py-1.5 text-muted-foreground transition-colors hover:border-muted-foreground/50 hover:text-foreground"
            onClick={addPartAtEnd}
          >
            <Plus className="h-4 w-4" />
          </button>
          <div className="flex justify-end pt-1 text-sm">
            <span className="font-medium">
              {t('subtotal', { amount: formatCurrency(partsSubtotal, currencyCode) })}
            </span>
          </div>
        </>
      )}

      {partItems.length === 0 && (
        <button
          type="button"
          className="flex w-full items-center justify-center rounded-md border border-dashed border-muted-foreground/25 py-1.5 text-muted-foreground transition-colors hover:border-muted-foreground/50 hover:text-foreground"
          onClick={addPartAtEnd}
        >
          <Plus className="mr-1 h-4 w-4" />
          <span className="text-sm">{t('addPart')}</span>
        </button>
      )}
    </div>
  )
}
