'use client'

import { useRef, useCallback, useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { GripVertical, Package, Percent, Plus, ScanBarcode, Trash2 } from 'lucide-react'
import { IconActionButton } from '@/components/icon-action-button'
import { FieldRow } from '@/components/line-item-field'
import { cn } from '@/lib/utils'
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

import {
  PartNameSuggestions,
  type PartSuggestion,
} from '@/features/inventory/Components/PartNameSuggestions'
import {
  lineTotal,
  priceFromCostAndMarkup,
  resolvePartPrice,
} from '@/features/inventory/Lib/partPricing'

interface PartsEditorProps {
  partItems: ServicePartInput[]
  setPartItems: React.Dispatch<React.SetStateAction<ServicePartInput[]>>
  updatePart: (index: number, field: keyof ServicePartInput, value: string | number) => void
  partsSubtotal: number
  currencyCode: string
  hasInventory: boolean
  /** Stocked parts, used for the inline name suggestions. */
  inventoryParts?: PartSuggestion[]
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
  inventoryParts,
  onSelectSuggestion,
  defaultMarkupPercent,
  markupAppliesToInventory,
}: {
  id: string
  part: ServicePartInput
  index: number
  updatePart: (index: number, field: keyof ServicePartInput, value: string | number) => void
  onDelete: () => void
  currencyCode: string
  inventoryParts: PartSuggestion[]
  onSelectSuggestion: (index: number, part: PartSuggestion) => void
  defaultMarkupPercent: number
  markupAppliesToInventory: boolean
  t: (key: string) => string
  dragEnabled: boolean
}) {
  const formatCurrency = useFormatCurrency()
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
  })

  const style = dragEnabled
    ? {
        transform: CSS.Transform.toString(transform),
        transition,
      }
    : undefined

  const nameMissing =
    !part.name.trim() &&
    !!(part.partNumber || Number(part.unitCost) > 0 || Number(part.unitPrice) > 0)

  return (
    <div
      ref={dragEnabled ? setNodeRef : undefined}
      style={style}
      className={cn(
        // Stacked card while the editor is narrow, one table row once its
        // container is wide enough to hold every column at a usable size
        'grid grid-cols-[auto_1fr] gap-2 rounded-lg border p-2',
        '@2xl:grid-cols-[auto_1fr_2fr_0.6fr_0.9fr_0.7fr_0.9fr_0.9fr_auto] @2xl:rounded-none @2xl:border-0 @2xl:p-0',
        isDragging && dragEnabled && 'z-10 opacity-75'
      )}
    >
      <button
        type="button"
        className="flex h-9 w-6 cursor-grab items-center justify-center text-muted-foreground hover:text-foreground active:cursor-grabbing"
        {...(dragEnabled ? { ...attributes, ...listeners } : {})}
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <div className="flex min-w-0 flex-col gap-2 @2xl:contents">
        <FieldRow label={t('partNumber')}>
          <Input
            placeholder={t('partNumber')}
            value={part.partNumber ?? ''}
            onChange={(e) => updatePart(index, 'partNumber', e.target.value)}
          />
        </FieldRow>
        {/* The name identifies the row, so it leads the stacked card even
            though the part number comes first in the desktop grid */}
        <FieldRow label={t('name')} className="order-first @2xl:order-none">
          <div className="relative w-full">
            <Textarea
              placeholder={t('namePlaceholder')}
              value={part.name}
              onChange={(e) => updatePart(index, 'name', e.target.value)}
              rows={1}
              aria-invalid={nameMissing}
              className={cn(
                'min-h-9 w-full resize-none',
                nameMissing && 'border-destructive focus-visible:ring-destructive'
              )}
            />
            <PartNameSuggestions
              query={part.name}
              parts={inventoryParts}
              disabled={!!part.inventoryPartId}
              currencyCode={currencyCode}
              defaultMarkupPercent={defaultMarkupPercent}
              markupAppliesToInventory={markupAppliesToInventory}
              onSelect={(picked) => onSelectSuggestion(index, picked)}
            />
          </div>
        </FieldRow>
        <FieldRow label={t('qty')}>
          <Input
            type="number"
            min="0"
            step="0.1"
            value={part.quantity}
            onChange={(e) => updatePart(index, 'quantity', e.target.value)}
          />
        </FieldRow>
        <FieldRow label={t('unitCost')} hint={t('unitCostHint')}>
          <Input
            type="number"
            min="0"
            step="0.01"
            placeholder={t('unitCost')}
            title={t('unitCostHint')}
            value={part.unitCost ?? 0}
            onChange={(e) => updatePart(index, 'unitCost', e.target.value)}
          />
        </FieldRow>
        <FieldRow label={t('markupPercent')} hint={t('markupPercentHint')}>
          <div className="relative w-full">
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
        </FieldRow>
        <FieldRow label={t('unitPrice')}>
          <Input
            type="number"
            min="0"
            step="0.01"
            value={part.unitPrice}
            onChange={(e) => updatePart(index, 'unitPrice', e.target.value)}
          />
        </FieldRow>
        <div className="flex items-center gap-2 @2xl:contents">
          <span className="w-24 shrink-0 text-xs text-muted-foreground @2xl:hidden">
            {t('total')}
          </span>
          <div className="flex h-9 flex-1 items-center rounded-md bg-muted/50 px-3 text-sm font-medium">
            {formatCurrency(part.total, currencyCode)}
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-9 w-9 shrink-0 text-muted-foreground hover:text-destructive"
            onClick={onDelete}
            aria-label={t('deleteRow')}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
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
  inventoryParts = [],
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

  // Applying a suggestion sets name, number, cost, price and the stock link
  // together. Doing it in one setPartItems pass keeps the row consistent and
  // avoids five renders; the inventoryPartId is what makes the job deduct
  // stock when it is saved.
  const handleSelectSuggestion = useCallback(
    (index: number, picked: PartSuggestion) => {
      setPartItems((prev) =>
        prev.map((row, i) => {
          if (i !== index) return row
          // Same pricing rule as the inventory picker, so a part costs the
          // same however it was added to the line.
          const { unitPrice, markupPercent } = resolvePartPrice(picked, {
            defaultMarkupPercent,
            markupAppliesToInventory,
          })
          return {
            ...row,
            name: picked.name,
            partNumber: picked.partNumber ?? '',
            unitCost: picked.unitCost,
            unitPrice,
            markupPercent,
            // Derived from the row's own quantity, so the line still satisfies
            // total === quantity * unitPrice. Defaulting an empty or zero
            // quantity to 1 would bill a total its fields do not add up to.
            total: lineTotal(row.quantity, unitPrice),
            inventoryPartId: picked.id,
          }
        })
      )
    },
    [setPartItems, defaultMarkupPercent, markupAppliesToInventory]
  )
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
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event
      if (!over || active.id === over.id) return
      const oldIndex = keysRef.current.indexOf(active.id as string)
      const newIndex = keysRef.current.indexOf(over.id as string)
      if (oldIndex === -1 || newIndex === -1) return
      keysRef.current = arrayMove(keysRef.current, oldIndex, newIndex)
      setPartItems((prev) => arrayMove(prev, oldIndex, newIndex))
    },
    [setPartItems]
  )

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

  const deletePart = useCallback(
    (index: number) => {
      keysRef.current = keysRef.current.filter((_, j) => j !== index)
      setPartItems((prev) => prev.filter((_, j) => j !== index))
    },
    [setPartItems]
  )

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
        const unitPrice = priceFromCostAndMarkup(p.unitCost, defaultMarkupPercent)
        return {
          ...p,
          markupPercent: defaultMarkupPercent,
          unitPrice,
          total: lineTotal(p.quantity, unitPrice),
        }
      })
    )
  }, [setPartItems, defaultMarkupPercent, markupAppliesToInventory])

  return (
    // The details view splits into two resizable columns, so this editor can
    // be narrower on a wide screen than it is on a phone. It sizes itself off
    // its own container rather than the viewport.
    <div className="@container space-y-2 rounded-lg border p-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">{t('title')}</h3>
        <div className="flex gap-1.5">
          {defaultMarkupPercent > 0 && partItems.length > 0 && (
            <IconActionButton
              label={t('applyMarkup', { percent: defaultMarkupPercent })}
              icon={Percent}
              onClick={applyMarkupToAll}
            />
          )}
          {hasInventory && (
            <IconActionButton label={t('fromInventory')} icon={Package} onClick={onOpenInventory} />
          )}
          {onScanBarcode && (
            <IconActionButton label={t('scanBarcode')} icon={ScanBarcode} onClick={onScanBarcode} />
          )}
          <IconActionButton label={t('addPart')} icon={Plus} onClick={addPartAtStart} />
        </div>
      </div>

      {partItems.length > 0 && (
        <>
          <div className="hidden grid-cols-[auto_1fr_2fr_0.6fr_0.9fr_0.7fr_0.9fr_0.9fr_auto] gap-2 text-xs font-medium text-muted-foreground @2xl:grid">
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
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
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
                    inventoryParts={inventoryParts}
                    onSelectSuggestion={handleSelectSuggestion}
                    defaultMarkupPercent={defaultMarkupPercent}
                    markupAppliesToInventory={markupAppliesToInventory}
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
                inventoryParts={inventoryParts}
                onSelectSuggestion={handleSelectSuggestion}
                defaultMarkupPercent={defaultMarkupPercent}
                markupAppliesToInventory={markupAppliesToInventory}
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
          {partItems.some(
            (p) =>
              !p.name.trim() && (p.partNumber || Number(p.unitCost) > 0 || Number(p.unitPrice) > 0)
          ) && <p className="text-xs text-destructive">{t('nameMissingHint')}</p>}
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
