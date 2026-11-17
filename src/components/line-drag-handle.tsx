'use client'

import type { ButtonHTMLAttributes } from 'react'
import { GripVertical } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * The grip a document line is dragged by, on the work order and the quote
 * alike. Pass it dnd-kit's `attributes` and `listeners`, which also make it
 * move with the arrow keys once focused and picked up with Space.
 *
 * `touch-none` keeps a finger on the grip dragging the line instead of
 * scrolling the page; the rest of the row still scrolls as usual.
 */
export function LineDragHandle({ className, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className={cn(
        'flex h-9 w-6 shrink-0 cursor-grab touch-none items-center justify-center text-muted-foreground hover:text-foreground active:cursor-grabbing',
        className
      )}
      {...props}
    >
      <GripVertical className="h-4 w-4" />
    </button>
  )
}
