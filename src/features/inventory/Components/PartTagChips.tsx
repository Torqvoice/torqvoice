'use client'

import { useTranslations } from 'next-intl'
import { cn } from '@/lib/utils'
import { sameTag } from '../Lib/partTags'

/**
 * A part's tags as small chips. With `onPick` each chip is a button (the list
 * filters by it); without, the chips are only read. Tags in `highlight` are
 * drawn in the primary colour, which the pickers use for the ones that fit the
 * job's vehicle, and are shown first so a long list never hides them.
 */
export function PartTagChips({
  tags,
  max = 4,
  highlight = [],
  active,
  onPick,
  className,
}: {
  tags: readonly string[]
  /** Chips shown before the rest collapse into "+N". */
  max?: number
  highlight?: readonly string[]
  /** The tag the list is filtered by, drawn as pressed. */
  active?: string
  onPick?: (tag: string) => void
  className?: string
}) {
  const t = useTranslations('inventory')
  if (tags.length === 0) return null

  const isHighlighted = (tag: string) => highlight.some((h) => sameTag(h, tag))
  const ordered = [...tags.filter(isHighlighted), ...tags.filter((tag) => !isHighlighted(tag))]
  const shown = ordered.slice(0, max)
  const hidden = ordered.slice(max)

  return (
    <span className={cn('flex flex-wrap items-center gap-1', className)}>
      {shown.map((tag) => {
        const pressed = active !== undefined && sameTag(active, tag)
        const chipClass = cn(
          'inline-flex max-w-40 items-center rounded px-1.5 py-px text-[11px] leading-4 font-medium',
          isHighlighted(tag) ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground',
          pressed && 'ring-1 ring-primary'
        )
        return onPick ? (
          <button
            key={tag}
            type="button"
            className={cn(chipClass, 'hover:bg-accent hover:text-accent-foreground')}
            title={t('tags.filterBy', { tag })}
            aria-pressed={pressed}
            onClick={(e) => {
              e.stopPropagation()
              onPick(tag)
            }}
          >
            <span className="truncate">{tag}</span>
          </button>
        ) : (
          <span key={tag} className={chipClass} title={tag}>
            <span className="truncate">{tag}</span>
          </span>
        )
      })}
      {hidden.length > 0 && (
        <span className="text-[11px] text-muted-foreground" title={hidden.join(', ')}>
          {t('tags.more', { count: hidden.length })}
        </span>
      )}
    </span>
  )
}
