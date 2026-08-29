'use client'

import { useTranslations } from 'next-intl'
import { MessageSquareQuote, Plus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { ServiceConcernInput } from '@/features/vehicles/Schema/serviceSchema'

/**
 * What the customer asked about, at the top of the working column.
 *
 * A list rather than one box, because that is how the work divides: "it pulls
 * right when braking" and "the aircon smells" are two conversations, two
 * diagnoses and two lines on the bill. The trade calls this the first of the
 * three Cs, and every serious shop system stores it as rows for the same
 * reason. Answering one and quietly dropping the other is the most common
 * reason a car comes back.
 *
 * Prominence follows content, but never at the cost of density: this is a page
 * where every other row is a record, so a concern is one row too. Empty, it is
 * a single quiet line inviting the first one. An always-empty box at the top of
 * every job teaches people to look past it, which is the one outcome that kills
 * the feature.
 */
interface ConcernsSectionProps {
  concerns: ServiceConcernInput[]
  setConcerns: (concerns: ServiceConcernInput[]) => void
  onChange: () => void
  /** Findings already recorded against a concern, keyed by concern id. */
  answeredCounts?: Record<string, number>
}

export function ConcernsSection({
  concerns,
  setConcerns,
  onChange,
  answeredCounts = {},
}: ConcernsSectionProps) {
  const t = useTranslations('service.concerns')

  const add = () => {
    setConcerns([...concerns, { description: '', sortOrder: concerns.length }])
    onChange()
  }

  const update = (index: number, description: string) => {
    setConcerns(concerns.map((c, i) => (i === index ? { ...c, description } : c)))
    onChange()
  }

  const remove = (index: number) => {
    setConcerns(concerns.filter((_, i) => i !== index))
    onChange()
  }

  // Empty, this is an offer, not a container. Full width it read as a broken
  // card sitting above the work; sized to its own text it reads as the small
  // action it is, and costs one line until somebody actually types something.
  if (concerns.length === 0) {
    return (
      <button
        type="button"
        onClick={add}
        className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-muted-foreground text-xs transition-colors hover:bg-muted hover:text-foreground"
      >
        <MessageSquareQuote className="h-3.5 w-3.5 shrink-0" />
        {t('addFirst')}
      </button>
    )
  }

  // One line per concern, the way parts and labour get one line each. This
  // started as a two-row textarea with the answered state on a line of its own
  // underneath, which spent four rows of the page on one sentence. On a screen
  // where every other row is a record, a concern is a record too.
  return (
    <div className="space-y-1.5 rounded-lg border border-l-4 border-l-primary/60 px-3 py-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <MessageSquareQuote className="h-3.5 w-3.5 text-muted-foreground" />
          <h3 className="font-medium text-sm">{t('title')}</h3>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={add}
          aria-label={t('add')}
          className="h-6 w-6 shrink-0 text-muted-foreground"
        >
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </div>

      {concerns.map((concern, index) => {
        const answered = concern.id ? (answeredCounts[concern.id] ?? 0) : 0
        return (
          <div key={concern.id ?? `new-${index}`} className="flex items-center gap-2">
            <Input
              value={concern.description}
              placeholder={t('placeholder')}
              onChange={(e) => update(index, e.target.value)}
              className="h-8 flex-1 italic"
              aria-label={t('title')}
            />
            {/* Whether anybody has answered this one yet. The point of keeping
                concerns apart is being able to see the one nobody looked at,
                so it stays on the row rather than costing a line of its own. */}
            <span
              className={`shrink-0 text-xs ${answered > 0 ? 'text-muted-foreground' : 'text-amber-600 dark:text-amber-500'}`}
            >
              {answered > 0 ? t('answered', { count: answered }) : t('notAnswered')}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => remove(index)}
              aria-label={t('remove')}
              className="h-6 w-6 shrink-0 text-muted-foreground hover:text-destructive"
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        )
      })}
    </div>
  )
}
