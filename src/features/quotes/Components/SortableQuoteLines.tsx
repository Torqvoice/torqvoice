'use client'

import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react'
import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { LineDragHandle } from '@/components/line-drag-handle'
import { cn } from '@/lib/utils'

/**
 * Lines on a quote, each with a grip to drag it up or down, the way lines
 * move on the work order. The list itself lives in the quote's form state;
 * this only says which line went where.
 *
 * dnd-kit needs an id per line that stays with the line while it moves. The
 * lines have none until they are saved, so each gets a key here that follows
 * it through moves and deletes, as the work order's editors do.
 */
export function SortableQuoteLines({
  count,
  keyPrefix,
  handleLabel,
  onMove,
  onDelete,
  renderLine,
}: {
  count: number
  keyPrefix: string
  /** What a screen reader calls the grip. */
  handleLabel: string
  onMove: (from: number, to: number) => void
  onDelete: (index: number) => void
  /** Draws line `index`; its delete must call the `onDelete` handed to it. */
  renderLine: (index: number, onDelete: (index: number) => void) => ReactNode
}) {
  // Rendering the drag context only once mounted, as the work order does, so
  // the server and the browser agree on the ids dnd-kit generates.
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  const counterRef = useRef(0)
  const keysRef = useRef<string[]>([])
  // Lines are added at the end, so new keys go there too.
  while (keysRef.current.length < count) {
    keysRef.current.push(`${keyPrefix}-${counterRef.current++}`)
  }
  if (keysRef.current.length > count) {
    keysRef.current = keysRef.current.slice(0, count)
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event
      if (!over || active.id === over.id) return
      const from = keysRef.current.indexOf(active.id as string)
      const to = keysRef.current.indexOf(over.id as string)
      if (from === -1 || to === -1) return
      keysRef.current = arrayMove(keysRef.current, from, to)
      onMove(from, to)
    },
    [onMove]
  )

  // A deleted line takes its key with it, so the lines below keep theirs.
  const deleteLine = useCallback(
    (index: number) => {
      keysRef.current = keysRef.current.filter((_, j) => j !== index)
      onDelete(index)
    },
    [onDelete]
  )

  const lines = keysRef.current.map((key, index) => (
    <SortableQuoteLine key={key} id={key} dragEnabled={mounted} handleLabel={handleLabel}>
      {renderLine(index, deleteLine)}
    </SortableQuoteLine>
  ))

  if (!mounted) return <>{lines}</>
  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={keysRef.current} strategy={verticalListSortingStrategy}>
        {lines}
      </SortableContext>
    </DndContext>
  )
}

function SortableQuoteLine({
  id,
  dragEnabled,
  handleLabel,
  children,
}: {
  id: string
  dragEnabled: boolean
  handleLabel: string
  children: ReactNode
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
  })
  return (
    <div
      ref={dragEnabled ? setNodeRef : undefined}
      data-testid="sortable-line"
      style={dragEnabled ? { transform: CSS.Transform.toString(transform), transition } : undefined}
      className={cn(
        'flex items-start gap-1',
        isDragging && dragEnabled && 'relative z-10 opacity-75'
      )}
    >
      <LineDragHandle
        aria-label={handleLabel}
        title={handleLabel}
        {...(dragEnabled ? { ...attributes, ...listeners } : {})}
      />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  )
}
