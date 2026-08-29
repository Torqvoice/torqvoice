'use client'

import { useTranslations } from 'next-intl'
import { MessageSquareQuote, Plus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
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
 * Prominence follows content. Empty, it is a single quiet line inviting the
 * first one; filled, the quotes earn the space. An always-empty box at the top
 * of every job teaches people to look past it, which is the one outcome that
 * kills the feature.
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

  if (concerns.length === 0) {
    return (
      <button
        type="button"
        onClick={add}
        className="flex w-full items-center gap-2 rounded-lg border border-dashed px-3 py-2 text-left text-muted-foreground text-sm transition-colors hover:border-solid hover:text-foreground"
      >
        <MessageSquareQuote className="h-4 w-4 shrink-0" />
        {t('addFirst')}
      </button>
    )
  }

  return (
    <div className="space-y-2 rounded-lg border border-l-4 border-l-primary/60 p-3">
      <div className="flex items-center gap-2">
        <MessageSquareQuote className="h-4 w-4 text-muted-foreground" />
        <h3 className="font-semibold text-sm">{t('title')}</h3>
      </div>

      {concerns.map((concern, index) => {
        const answered = concern.id ? (answeredCounts[concern.id] ?? 0) : 0
        return (
          <div key={concern.id ?? `new-${index}`} className="space-y-1">
            <div className="flex items-start gap-2">
              <Textarea
                rows={2}
                value={concern.description}
                placeholder={t('placeholder')}
                onChange={(e) => update(index, e.target.value)}
                className="resize-none italic"
                aria-label={t('title')}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => remove(index)}
                aria-label={t('remove')}
                className="shrink-0 text-muted-foreground hover:text-destructive"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            {/* Whether anybody has answered this one yet. The point of keeping
                concerns apart is being able to see the one nobody looked at. */}
            <p className="pl-1 text-muted-foreground text-xs">
              {answered > 0 ? t('answered', { count: answered }) : t('notAnswered')}
            </p>
          </div>
        )
      })}

      <Button type="button" variant="ghost" size="sm" onClick={add} className="text-xs">
        <Plus className="mr-1 h-3 w-3" />
        {t('add')}
      </Button>
    </div>
  )
}
