'use client'

import { useRef, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { GripVertical, Package, Plus, ScanBarcode, Trash2 } from 'lucide-react'
import { formatCurrency } from '@/lib/format'
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
}

function SortablePartRow({
  id,
  part,
  index,
  updatePart,
  onDelete,
  currencyCode,
  t,
}: {
  id: string
  part: ServicePartInput
  index: number
  updatePart: (index: number, field: keyof ServicePartInput, value: string | number) => void
  onDelete: () => void
  currencyCode: string
  t: (key: string) => string
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`grid grid-cols-[auto_1fr] gap-2 sm:grid-cols-[auto_1fr_2fr_0.7fr_1fr_1fr_auto] ${isDragging ? 'z-10 opacity-75' : ''}`}
    >
      <button
        type="button"
        className="flex h-9 w-6 cursor-grab items-center justify-center text-muted-foreground hover:text-foreground active:cursor-grabbing"
        {...attributes}
        {...listeners}
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
}: PartsEditorProps) {
  const t = useTranslations('service.parts')
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
    setPartItems((prev) => [emptyPart(), ...prev])
  }, [setPartItems])

  const addPartAtEnd = useCallback(() => {
    const key = `part-${keyCounterRef.current++}`
    keysRef.current = [...keysRef.current, key]
    setPartItems((prev) => [...prev, emptyPart()])
  }, [setPartItems])

  const deletePart = useCallback((index: number) => {
    keysRef.current = keysRef.current.filter((_, j) => j !== index)
    setPartItems((prev) => prev.filter((_, j) => j !== index))
  }, [setPartItems])

  return (
    <div className="rounded-lg border p-3 space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">{t('title')}</h3>
        <div className="flex gap-1.5">
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
          <div className="hidden grid-cols-[auto_1fr_2fr_0.7fr_1fr_1fr_auto] gap-2 text-xs font-medium text-muted-foreground sm:grid">
            <span className="w-6" />
            <span>{t('partNumber')}</span>
            <span>{t('name')}</span>
            <span>{t('qty')}</span>
            <span>{t('unitPrice')}</span>
            <span>{t('total')}</span>
            <span />
          </div>
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
                />
              ))}
            </SortableContext>
          </DndContext>
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
