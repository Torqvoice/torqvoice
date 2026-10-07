'use client'

import { useTranslations } from 'next-intl'
import type {
  ConversionConflict,
  ConversionResolutions,
  TaxBasis,
} from '@/features/quotes/Lib/conversionConflicts'
import type { WarrantyFields } from '@/lib/warranty'

/**
 * The questions the dialog asks before a quote is added to an open work
 * order: for each place the two disagree, which answer the job keeps. The
 * lines come across either way; these are the job's standing answers, and
 * the quote's are what the customer accepted, so neither is picked for them.
 */
export function ConvertConflictChoices({
  conflicts,
  resolutions,
  onChoose,
  money,
  distanceUnit,
}: {
  conflicts: ConversionConflict[]
  resolutions: ConversionResolutions
  onChoose: <K extends keyof ConversionResolutions>(
    kind: K,
    choice: NonNullable<ConversionResolutions[K]>
  ) => void
  money: (amount: number) => string
  distanceUnit: string
}) {
  const t = useTranslations('quotes.page.convertConflicts')

  const taxWords = (basis: TaxBasis) => {
    const rate = basis.rate
    if (basis.components && basis.components.length > 0) {
      return t('tax.components', { rate, names: basis.components.map((c) => c.name).join(' + ') })
    }
    return t(basis.inclusive ? 'tax.inclusive' : 'tax.exclusive', { rate })
  }

  const warrantyWords = (fields: WarrantyFields) => {
    if (fields.warrantyStatus === 'not_included') return t('warranty.notIncluded')
    if (fields.warrantyStatus !== 'included') return t('warranty.none')
    const terms = [
      fields.warrantyMonths ? t('warranty.months', { count: fields.warrantyMonths }) : null,
      fields.warrantyMileage
        ? t('warranty.mileage', { count: fields.warrantyMileage, unit: distanceUnit })
        : null,
    ].filter(Boolean)
    return terms.length > 0
      ? t('warranty.includedWithTerms', { terms: terms.join(', ') })
      : t('warranty.included')
  }

  return (
    <div className="space-y-3 rounded-md border border-amber-300/70 bg-amber-50/60 p-3 dark:border-amber-700/60 dark:bg-amber-950/30">
      <p className="text-xs font-medium">{t('heading')}</p>
      {conflicts.map((conflict) => {
        if (conflict.kind === 'discount') {
          const percent = conflict.job.percent
          const jobAmount = money(conflict.job.amount)
          const quoteAmount = money(conflict.quote.amount)
          return (
            <Choice
              key={conflict.kind}
              kind="discount"
              title={t('discount.title')}
              summary={t('discount.summary', { percent, jobAmount, quoteAmount })}
              value={resolutions.discount}
              options={[
                ['keepJob', t('discount.keepJob', { percent, quoteAmount })],
                [
                  'combine',
                  t('discount.combine', {
                    percent,
                    jobAmount,
                    quoteAmount,
                    total: money(conflict.job.amount + conflict.quote.amount),
                  }),
                ],
              ]}
              onChoose={(choice) => onChoose('discount', choice)}
            />
          )
        }
        if (conflict.kind === 'tax') {
          return (
            <Choice
              key={conflict.kind}
              kind="tax"
              title={t('tax.title')}
              summary={t('tax.summary', {
                job: taxWords(conflict.job),
                quote: taxWords(conflict.quote),
              })}
              value={resolutions.tax}
              options={[
                ['keepJob', t('tax.keepJob')],
                ['useQuote', t('tax.useQuote')],
              ]}
              onChoose={(choice) => onChoose('tax', choice)}
            />
          )
        }
        return (
          <Choice
            key={conflict.kind}
            kind="warranty"
            title={t('warranty.title')}
            summary={t('warranty.summary', {
              job: warrantyWords(conflict.job),
              quote: warrantyWords(conflict.quote),
            })}
            value={resolutions.warranty}
            options={[
              ['keepJob', t('warranty.keepJob')],
              ['useQuote', t('warranty.useQuote')],
            ]}
            onChoose={(choice) => onChoose('warranty', choice)}
          />
        )
      })}
    </div>
  )
}

function Choice<C extends string>({
  kind,
  title,
  summary,
  value,
  options,
  onChoose,
}: {
  kind: string
  title: string
  summary: string
  value: C | undefined
  options: [C, string][]
  onChoose: (choice: C) => void
}) {
  return (
    <fieldset className="space-y-1.5" data-testid={`convert-conflict-${kind}`}>
      <legend className="text-xs font-medium">{title}</legend>
      <p className="text-xs text-muted-foreground">{summary}</p>
      {options.map(([choice, label]) => (
        <label key={choice} className="flex cursor-pointer items-start gap-2 text-xs">
          <input
            type="radio"
            name={`convert-conflict-${kind}`}
            className="mt-0.5"
            checked={value === choice}
            onChange={() => onChoose(choice)}
          />
          <span>{label}</span>
        </label>
      ))}
    </fieldset>
  )
}
