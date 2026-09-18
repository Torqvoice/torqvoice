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
 * It is always a field, with somewhere to type. It used to be one grey link
 * until somebody clicked it, on the reasoning that an empty box teaches people
 * to look past it; what it taught instead was that the feature was not there,
 * and a workshop asked for it to be made visible. The customer's words are
 * the reason for the job, so they get a named place at the top of it, the
 * room to run over a line, and ordinary type rather than italics.
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

  // With nothing written yet there is still one row to type into. It is not a
  // concern until it has words: the list stays empty, so nothing blank is
  // saved, and the first keystroke is what creates the row. The key is the one
  // that row will have, so the field keeps its focus as it becomes real.
  const unwritten = concerns.length === 0
  const rows: ServiceConcernInput[] = unwritten ? [{ description: '', sortOrder: 0 }] : concerns
  const hasBlankRow = rows.some((c) => !c.description.trim())

  const add = () => {
    setConcerns([...concerns, { description: '', sortOrder: concerns.length }])
    onChange()
  }

  const update = (index: number, description: string) => {
    setConcerns(
      unwritten
        ? [{ description, sortOrder: 0 }]
        : concerns.map((c, i) => (i === index ? { ...c, description } : c))
    )
    onChange()
  }

  const remove = (index: number) => {
    setConcerns(concerns.filter((_, i) => i !== index))
    onChange()
  }

  return (
    <div
      className="space-y-2 rounded-lg border border-l-4 border-l-primary p-3"
      data-testid="customer-concerns"
    >
      <div className="flex items-center gap-2">
        <MessageSquareQuote className="h-4 w-4 shrink-0 text-primary" />
        <h3 className="font-semibold text-sm">{t('title')}</h3>
      </div>
      {unwritten && <p className="text-muted-foreground text-xs">{t('hint')}</p>}

      {rows.map((concern, index) => {
        const answered = concern.id ? (answeredCounts[concern.id] ?? 0) : 0
        return (
          <div key={concern.id ?? `new-${index}`} className="flex items-start gap-2">
            <div className="min-w-0 flex-1 space-y-1">
              {/* A textarea that grows: what a customer says is often a sentence
                  or two, and a one-line input showed the first half of it. */}
              <Textarea
                value={concern.description}
                placeholder={t('placeholder')}
                onChange={(e) => update(index, e.target.value)}
                rows={1}
                className="min-h-9 w-full resize-none"
                aria-label={t('title')}
              />
              {/* Whether anybody has answered this one yet. The point of keeping
                  concerns apart is being able to see the one nobody looked at. */}
              {!unwritten && concern.description.trim() && (
                <p
                  className={`text-xs ${answered > 0 ? 'text-muted-foreground' : 'text-amber-600 dark:text-amber-500'}`}
                >
                  {answered > 0 ? t('answered', { count: answered }) : t('notAnswered')}
                </p>
              )}
            </div>
            {!unwritten && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => remove(index)}
                aria-label={t('remove')}
                className="h-9 w-8 shrink-0 text-muted-foreground hover:text-destructive"
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        )
      })}

      {/* Said in words rather than a bare plus: the second thing a customer
          mentions is the one that gets lost. Held back while a row is still
          blank, so blank rows cannot pile up. */}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={add}
        disabled={hasBlankRow}
        className="h-7 px-2 text-muted-foreground text-xs"
      >
        <Plus className="mr-1 h-3.5 w-3.5" />
        {t('add')}
      </Button>
    </div>
  )
}
