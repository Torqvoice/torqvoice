'use client'

import { useFormatter, useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { useServiceType } from '@/components/service-type-context'
import { cn } from '@/lib/utils'

interface ReadingQuestionProps {
  /** The reading typed. */
  entered: number
  /** The last known reading it is far above. */
  last: number
  /** "km" or "mi", where the caller knows it. */
  unit?: string
  onConfirm: () => void
  onChange: () => void
  id?: string
  className?: string
}

/**
 * Asks, under a reading field, whether a reading far above the last one is
 * right. Inline rather than a dialog: the page saves by itself while the
 * person types, and a dialog would jump up under their fingers. Until it is
 * answered the reading is held back from the save (useServiceActions).
 */
export function ReadingQuestion({
  entered,
  last,
  unit,
  onConfirm,
  onChange,
  id = 'reading-question',
  className,
}: ReadingQuestionProps) {
  const t = useTranslations('vehicles.form')
  const format = useFormatter()
  const isMarine = useServiceType() === 'marine'
  const withUnit = (value: number) =>
    unit && !isMarine ? `${format.number(value)} ${unit}` : format.number(value)
  return (
    <div
      id={id}
      role="group"
      aria-labelledby={`${id}-title`}
      aria-describedby={`${id}-body`}
      data-testid="reading-question"
      className={cn(
        'max-w-sm space-y-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3',
        className
      )}
    >
      <p id={`${id}-title`} className="text-sm font-medium">
        {t('readingConfirmTitle')}
      </p>
      <p id={`${id}-body`} className="text-xs text-muted-foreground">
        {t(isMarine ? 'readingConfirmBodyMarine' : 'readingConfirmBody', {
          entered: withUnit(entered),
          last: withUnit(last),
        })}{' '}
        {t('readingConfirmHeld')}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" onClick={onConfirm} data-reading-confirm>
          {t('readingConfirmYes')}
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={onChange}>
          {t('readingConfirmChange')}
        </Button>
      </div>
    </div>
  )
}
