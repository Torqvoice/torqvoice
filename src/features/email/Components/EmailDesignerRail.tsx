'use client'

import { Eye, EyeOff, GripVertical, Palette, Plus, Trash2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import {
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useRef,
  useState,
} from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { type EmailBlock, type EmailBlockType, blockWords } from '../Lib/emailTemplate'

/** What a row says under its label: the first line of whatever the block holds. */
function snippetOf(block: EmailBlock): string {
  const source =
    block.type === 'button'
      ? (block.label ?? '')
      : block.type === 'image'
        ? imageSnippet(block)
        : blockWords(block)
  const line = source.split('\n').find((part) => part.trim()) ?? ''
  return line.length > 48 ? `${line.slice(0, 48)}…` : line
}

/** An image row reads as its description, or failing that the file it was stored as. */
function imageSnippet(block: EmailBlock): string {
  if (block.alt?.trim()) return block.alt
  return block.src?.split('/').pop() ?? ''
}

/** A visible block that would still print nothing with what it has. */
function isEmpty(block: EmailBlock): boolean {
  switch (block.type) {
    case 'heading':
    case 'paragraph':
    case 'callout':
    case 'attachment_note':
      return !blockWords(block).trim()
    case 'button':
      return !block.label?.trim() || !block.href?.trim()
    case 'image':
      return !block.src
    default:
      return false
  }
}

/**
 * The blocks in the order the mail says them, with the same drag-to-reorder
 * the document designer's rail has. Order is the whole layout of a mail, so
 * this list is the canvas as much as the preview is.
 */
export function EmailDesignerRail({
  blocks,
  selected,
  addable,
  canRemove,
  onSelect,
  onToggle,
  onMove,
  onAdd,
  onRemove,
}: {
  blocks: EmailBlock[]
  selected: string | null
  /** Block types the add menu offers, already filtered for this kind. */
  addable: EmailBlockType[]
  /** False when one block is all that is left; a mail cannot be empty. */
  canRemove: boolean
  onSelect: (id: string | null) => void
  onToggle: (id: string) => void
  /** Put the block at this position in the list, counted with the block itself taken out. */
  onMove: (draggedId: string, toIndex: number) => void
  onAdd: (type: EmailBlockType) => void
  onRemove: (id: string) => void
}) {
  const t = useTranslations('settings.emailTemplates')
  const [adding, setAdding] = useState(false)
  const list = useRef<HTMLDivElement>(null)

  /**
   * Dragging is done with pointer events rather than the browser's drag and
   * drop, so the row can lift under the pointer and a line can show the slot
   * it will snap into. `slot` is the gap the block would land in, counted in
   * the list as it stands; the block is lifted from its own place only on
   * release.
   */
  const [drag, setDrag] = useState<{ id: string; y: number; slot: number } | null>(null)
  const dragRef = useRef<{ id: string; grabOffset: number } | null>(null)

  const slotAt = (clientY: number): number => {
    const rows = Array.from(list.current?.querySelectorAll<HTMLElement>('[data-rail-block]') ?? [])
    let slot = 0
    for (const row of rows) {
      const rect = row.getBoundingClientRect()
      if (clientY > rect.top + rect.height / 2) slot += 1
    }
    return slot
  }

  const onGrab = (event: ReactPointerEvent<HTMLElement>, id: string) => {
    if (event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()
    const row = (event.currentTarget as HTMLElement).closest<HTMLElement>('[data-rail-block]')
    const top = row?.getBoundingClientRect().top ?? event.clientY
    dragRef.current = { id, grabOffset: event.clientY - top }
    ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
    setDrag({ id, y: event.clientY, slot: slotAt(event.clientY) })
  }

  const onDragMove = (event: ReactPointerEvent<HTMLElement>) => {
    const current = dragRef.current
    if (!current) return
    // Keep the list scrolling when the pointer reaches its edges.
    const box = list.current
    if (box) {
      const rect = box.getBoundingClientRect()
      if (event.clientY < rect.top + 28) box.scrollTop -= 8
      else if (event.clientY > rect.bottom - 28) box.scrollTop += 8
    }
    setDrag({ id: current.id, y: event.clientY, slot: slotAt(event.clientY) })
  }

  const onDrop = (event: ReactPointerEvent<HTMLElement>) => {
    const current = dragRef.current
    dragRef.current = null
    ;(event.currentTarget as HTMLElement).releasePointerCapture?.(event.pointerId)
    if (!current) return
    const slot = slotAt(event.clientY)
    const from = blocks.findIndex((block) => block.id === current.id)
    const to = slot > from ? slot - 1 : slot
    setDrag(null)
    if (from !== -1 && to !== from) onMove(current.id, to)
  }

  const cancelDrag = () => {
    dragRef.current = null
    setDrag(null)
  }

  /**
   * The keyboard's reorder: one step up or down from where the block is.
   * `onMove` counts the target with the block taken out, so a step of one
   * is a step of one there too.
   */
  const step = (id: string, index: number, direction: -1 | 1) => {
    const to = index + direction
    if (to < 0 || to >= blocks.length) return
    onMove(id, to)
  }

  /** Alt with an arrow moves the block from anywhere in its row; the grip needs no Alt. */
  const arrowOf = (event: ReactKeyboardEvent, needsAlt: boolean): -1 | 1 | 0 => {
    if (needsAlt && !event.altKey) return 0
    if (event.key === 'ArrowUp') return -1
    if (event.key === 'ArrowDown') return 1
    return 0
  }

  useEffect(() => {
    if (!drag) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') cancelDrag()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [drag])

  const dragged = drag ? blocks.find((block) => block.id === drag.id) : null
  const dragFrom = drag ? blocks.findIndex((block) => block.id === drag.id) : -1
  // A slot right beside the lifted row would put it back where it was.
  const slotShown = drag && drag.slot !== dragFrom && drag.slot !== dragFrom + 1 ? drag.slot : null

  // A block picked in the preview may be further down than the rail shows.
  useEffect(() => {
    if (!selected) return
    const row = list.current?.querySelector<HTMLElement>(
      `[data-rail-block="${CSS.escape(selected)}"]`
    )
    row?.scrollIntoView({ block: 'nearest' })
  }, [selected])

  return (
    <div className="flex w-[252px] flex-none flex-col border-r border-border bg-card text-card-foreground">
      <div className="px-2 pt-2.5">
        <button
          type="button"
          onClick={() => onSelect(null)}
          className={cn(
            'flex w-full items-center gap-2 rounded-md px-2 py-2 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring',
            selected === null
              ? 'bg-primary/10 text-foreground ring-1 ring-primary/40'
              : 'hover:bg-accent hover:text-accent-foreground'
          )}
        >
          <Palette size={14} className="text-muted-foreground" />
          <span className="flex-1 text-[13.5px] font-medium">{t('subjectAndTheme')}</span>
        </button>
      </div>

      <div className="flex items-center justify-between px-3.5 pb-2 pt-3">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          {t('blocksTitle')}
        </span>
        <Popover open={adding} onOpenChange={setAdding}>
          <PopoverTrigger asChild>
            <Button type="button" variant="outline" size="xs" disabled={addable.length === 0}>
              <Plus /> {t('addBlock')}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-52 p-1">
            {addable.map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => {
                  onAdd(type)
                  setAdding(false)
                }}
                className="flex w-full items-center rounded-md px-2 py-1.5 text-left text-[13px] outline-none hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent focus-visible:text-accent-foreground"
              >
                {t(`blocks.${type}`)}
              </button>
            ))}
          </PopoverContent>
        </Popover>
      </div>

      <div
        ref={list}
        className={cn(
          'relative flex flex-1 flex-col gap-[3px] overflow-y-auto px-2 pb-3.5',
          drag && 'select-none'
        )}
      >
        {blocks.map((block, index) => {
          const visible = block.visible !== false
          const active = selected === block.id
          const lifted = drag?.id === block.id
          const snippet = snippetOf(block)
          return (
            <div key={block.id} className="relative">
              {slotShown === index && <DropLine />}
              <div
                data-rail-block={block.id}
                role="button"
                tabIndex={0}
                aria-pressed={active}
                onClick={() => onSelect(block.id)}
                onKeyDown={(event) => {
                  const direction = arrowOf(event, true)
                  if (direction) {
                    event.preventDefault()
                    step(block.id, index, direction)
                    return
                  }
                  // Enter or Space on a button inside the row is that button's.
                  if (event.target !== event.currentTarget) return
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    onSelect(block.id)
                  }
                }}
                className={cn(
                  'group flex cursor-pointer items-center gap-1.5 rounded-md py-1.5 pr-1.5 pl-1 outline-none transition-[opacity,transform,background-color] duration-150 focus-visible:ring-2 focus-visible:ring-ring',
                  active
                    ? 'bg-primary/10 text-foreground ring-1 ring-primary/40'
                    : 'hover:bg-accent hover:text-accent-foreground',
                  !visible && 'opacity-45',
                  lifted && 'opacity-30 ring-1 ring-dashed ring-border'
                )}
              >
                <span
                  role="button"
                  tabIndex={0}
                  aria-label={t('dragHandleKeyboard')}
                  title={t('dragHandle')}
                  onPointerDown={(event) => onGrab(event, block.id)}
                  onPointerMove={onDragMove}
                  onPointerUp={onDrop}
                  onPointerCancel={cancelDrag}
                  onLostPointerCapture={cancelDrag}
                  onClick={(event) => event.stopPropagation()}
                  onKeyDown={(event) => {
                    const direction = arrowOf(event, false)
                    if (!direction) return
                    event.preventDefault()
                    event.stopPropagation()
                    step(block.id, index, direction)
                  }}
                  className={cn(
                    'flex h-6 w-5 flex-none touch-none items-center justify-center rounded text-muted-foreground/50 outline-none transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring',
                    lifted ? 'cursor-grabbing' : 'cursor-grab'
                  )}
                >
                  <GripVertical size={14} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13.5px]">{t(`blocks.${block.type}`)}</span>
                  {snippet && (
                    <span className="block truncate text-[11px] text-muted-foreground">
                      {snippet}
                    </span>
                  )}
                </span>
                {visible && isEmpty(block) && (
                  <Badge
                    variant="outline"
                    className="px-1.5 py-0 text-[10px] text-muted-foreground"
                    title={t('blockEmptyHint')}
                  >
                    {t('blockEmpty')}
                  </Badge>
                )}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    onToggle(block.id)
                  }}
                  className={cn(
                    'rounded px-0.5 outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring',
                    visible ? 'text-muted-foreground' : 'text-muted-foreground/50'
                  )}
                  title={visible ? t('blockShownHint') : t('blockHiddenHint')}
                  aria-label={visible ? t('blockShownHint') : t('blockHiddenHint')}
                >
                  {visible ? <Eye size={14} /> : <EyeOff size={14} />}
                </button>
                <button
                  type="button"
                  disabled={!canRemove}
                  onClick={(e) => {
                    e.stopPropagation()
                    onRemove(block.id)
                  }}
                  className={cn(
                    'rounded px-0.5 text-muted-foreground outline-none transition-opacity hover:text-destructive focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring disabled:hover:text-muted-foreground group-hover:opacity-100 disabled:group-hover:opacity-40',
                    active ? 'opacity-100' : 'opacity-0'
                  )}
                  title={canRemove ? t('removeBlock') : t('removeBlockLast')}
                  aria-label={t('removeBlock')}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          )
        })}
        {slotShown === blocks.length && (
          <div className="relative h-0">
            <DropLine />
          </div>
        )}

        {/* The lifted row, following the pointer above the list. */}
        {drag && dragged && (
          <div
            aria-hidden
            className="pointer-events-none fixed z-50 flex items-center gap-1.5 rounded-md border border-primary/40 bg-card py-1.5 pr-3 pl-1 shadow-lg ring-1 ring-primary/20"
            style={{
              left: (list.current?.getBoundingClientRect().left ?? 0) + 8,
              width: (list.current?.clientWidth ?? 240) - 16,
              top: drag.y - (dragRef.current?.grabOffset ?? 12),
            }}
          >
            <span className="flex h-6 w-5 items-center justify-center text-primary">
              <GripVertical size={14} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13.5px]">{t(`blocks.${dragged.type}`)}</span>
              {snippetOf(dragged) && (
                <span className="block truncate text-[11px] text-muted-foreground">
                  {snippetOf(dragged)}
                </span>
              )}
            </span>
          </div>
        )}
      </div>

      <div className="border-t border-border px-3.5 py-2.5 text-[11.5px] leading-relaxed text-muted-foreground">
        {t('railHint')}
      </div>
    </div>
  )
}

/** The slot a dragged block will snap into: a line across the list with a dot at its start. */
function DropLine() {
  return (
    <div className="pointer-events-none absolute inset-x-1 -top-[3px] z-10 flex items-center">
      <span className="h-2 w-2 flex-none rounded-full bg-primary ring-2 ring-card" />
      <span className="h-[2px] flex-1 rounded-full bg-primary" />
    </div>
  )
}
