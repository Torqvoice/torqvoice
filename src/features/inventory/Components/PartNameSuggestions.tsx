'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { useFormatCurrency } from '@/components/currency-settings-context'
import { Package } from 'lucide-react'
import { resolvePartPrice } from '@/features/inventory/Lib/partPricing'

/** The subset of an inventory part this picker needs. */
export interface PartSuggestion {
  id: string
  name: string
  partNumber: string | null
  barcode?: string | null
  category?: string | null
  description?: string | null
  unitCost: number
  sellPrice: number
  quantity: number
}

const MAX_SUGGESTIONS = 3
const MIN_QUERY_LENGTH = 2

/**
 * Rank matches so the most useful three surface.
 *
 * A prefix match on the name is what someone typing "bra..." for "Brake pad"
 * expects to see first; an exact part-number hit is even stronger, since that
 * is a deliberate lookup rather than a guess.
 */
function rank(part: PartSuggestion, query: string): number {
  const name = part.name.toLowerCase()
  const number = (part.partNumber ?? '').toLowerCase()

  if (number && number === query) return 0
  if (name === query) return 1
  if (number.startsWith(query)) return 2
  if (name.startsWith(query)) return 3
  if (name.includes(query)) return 4
  if (number.includes(query)) return 5
  return 6
}

function matches(part: PartSuggestion, query: string): boolean {
  return rank(part, query) < 6
}

/**
 * Inline typeahead under a part's Name field.
 *
 * Free-typing a part name that already exists in stock is the main way a line
 * ends up unlinked, which means the job never deducts inventory. Surfacing the
 * stocked match at the moment of typing makes linking the path of least
 * resistance, rather than something you remember to do via the picker dialog.
 *
 * Capped at three: this sits inside a dense editable row, and a longer list
 * would cover the fields below it.
 */
export function PartNameSuggestions({
  query,
  parts,
  onSelect,
  /** Already linked to stock, so there is nothing to suggest. */
  disabled = false,
  currencyCode,
  defaultMarkupPercent = 0,
  markupAppliesToInventory = false,
}: {
  query: string
  parts: PartSuggestion[]
  onSelect: (part: PartSuggestion) => void
  disabled?: boolean
  currencyCode?: string
  /** Same pricing inputs the inventory picker takes, so both agree. */
  defaultMarkupPercent?: number
  markupAppliesToInventory?: boolean
}) {
  const t = useTranslations('inventory')
  const formatCurrency = useFormatCurrency()
  const [dismissed, setDismissed] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const trimmed = query.trim().toLowerCase()

  const suggestions = useMemo(() => {
    if (disabled || trimmed.length < MIN_QUERY_LENGTH) return []
    return parts
      .filter((p) => matches(p, trimmed))
      .sort((a, b) => rank(a, trimmed) - rank(b, trimmed))
      .slice(0, MAX_SUGGESTIONS)
  }, [parts, trimmed, disabled])

  // Typing again after dismissing should bring the list back.
  useEffect(() => {
    setDismissed(false)
  }, [query])

  // Escape closes without stealing the click-away behaviour of the row.
  useEffect(() => {
    if (suggestions.length === 0 || dismissed) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDismissed(true)
    }
    const onClickAway = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setDismissed(true)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onClickAway)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onClickAway)
    }
  }, [suggestions.length, dismissed])

  // An exact name hit means the row already holds that part; nothing to offer.
  const alreadyExact =
    suggestions.length === 1 && suggestions[0].name.toLowerCase() === trimmed

  if (dismissed || alreadyExact || suggestions.length === 0) return null

  const priceOf = (part: PartSuggestion) =>
    resolvePartPrice(part, { defaultMarkupPercent, markupAppliesToInventory })
      .unitPrice

  const choose = (part: PartSuggestion) => {
    onSelect(part)
    setDismissed(true)
  }

  return (
    <div
      ref={containerRef}
      // Grows past the narrow Name field so long part names are readable
      // without hovering. Kept to the field width on mobile, where the field
      // sits in the right-hand column and a wider panel would run off-screen.
      className="absolute left-0 top-full z-30 mt-1 w-full overflow-hidden rounded-md border bg-popover shadow-md sm:w-max sm:min-w-full sm:max-w-[min(30rem,60vw)]"
    >
      <p className="border-b px-2 py-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        {t('suggestions.title')}
      </p>
      {suggestions.map((part) => (
        <button
          key={part.id}
          type="button"
          // Pointer and keyboard are handled separately and never both fire.
          // mousedown (not click) beats the field's blur, which would otherwise
          // unmount this button before the click landed. Keyboard activation
          // does not raise mousedown at all, so Enter/Space needs its own
          // handler or tabbing to a suggestion does nothing.
          onMouseDown={(e) => {
            e.preventDefault()
            choose(part)
          }}
          onKeyDown={(e) => {
            if (e.key !== 'Enter' && e.key !== ' ') return
            e.preventDefault()
            choose(part)
          }}
          className="flex w-full items-center justify-between gap-3 whitespace-nowrap px-2 py-1.5 text-left text-sm hover:bg-accent"
        >
          <span className="flex min-w-0 items-center gap-2">
            <Package className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <span className="truncate" title={part.name}>
              {part.name}
            </span>
            {part.partNumber && (
              <span className="shrink-0 font-mono text-xs text-muted-foreground">
                {part.partNumber}
              </span>
            )}
            {part.category && (
              <span className="shrink-0 text-xs text-muted-foreground">
                {part.category}
              </span>
            )}
          </span>
          <span className="flex shrink-0 items-center gap-3 text-xs text-muted-foreground">
            {/* The price actually applied on pick, not the raw sell price:
                a part with no sell price is billed at cost, and showing 0
                here contradicted what landed on the line. */}
            <span className="font-medium text-foreground">
              {formatCurrency(priceOf(part), currencyCode)}
            </span>
            {part.sellPrice > 0 && part.sellPrice !== part.unitCost && (
              <span className="line-through">
                {formatCurrency(part.unitCost, currencyCode)}
              </span>
            )}
            {part.quantity > 0 ? (
              <span>{t('suggestions.inStock', { quantity: part.quantity })}</span>
            ) : part.quantity === 0 ? (
              <span className="font-medium text-amber-600 dark:text-amber-500">
                {t('suggestions.outOfStock')}
              </span>
            ) : (
              <span className="font-medium text-red-600 dark:text-red-500">
                {t('suggestions.onBackorder', { count: Math.abs(part.quantity) })}
              </span>
            )}
          </span>
        </button>
      ))}
    </div>
  )
}
