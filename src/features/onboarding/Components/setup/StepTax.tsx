'use client'

import { Check } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { parseTaxRate, type SetupDraft } from '../../Lib/setupDraft'
import { LaterInSettings, settingsPathTag, useSettingsPath } from './LaterInSettings'

export function StepTax({
  draft,
  showErrors,
  countryName,
  money,
  onChange,
}: {
  draft: SetupDraft
  /** Continue was pressed with the rate missing: say so. */
  showErrors: boolean
  countryName: (code: string) => string
  /** An amount written in the chosen currency. */
  money: (value: number) => string
  onChange: (patch: Partial<SetupDraft>) => void
}) {
  const t = useTranslations('onboarding.setup.tax')
  const settingsPath = useSettingsPath()
  const charges = draft.taxChoice === 'yes'
  const rate = parseTaxRate(draft.taxRate)
  const rateMissing = charges && showErrors && draft.taxRate.trim() === ''
  const rateInvalid = charges && draft.taxRate.trim() !== '' && rate === null
  const label = draft.taxLabel.trim() || t('namePlaceholder')
  const shownRate = rate ?? 0
  const example = `${label} (${shownRate}%)`

  // The worked examples: 65 before tax, and what it comes to with it.
  const price = 65
  const tax = Math.round(price * shownRate) / 100
  const total = price + tax

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1.5">
        <h1 className="text-[28px] leading-tight font-bold tracking-tight">{t('title')}</h1>
        <p className="text-[15px] leading-relaxed text-muted-foreground">{t('subtitle')}</p>
      </div>

      <fieldset className="flex flex-col gap-2.5">
        <legend className="mb-2.5 text-sm font-semibold">{t('charges')}</legend>
        <div className="inline-flex gap-1 self-start rounded-xl bg-muted p-1">
          {(['yes', 'no'] as const).map((choice) => {
            const selected = draft.taxChoice === choice
            return (
              <label
                key={choice}
                className={cn(
                  'inline-flex h-9 cursor-pointer items-center rounded-lg px-5 text-sm has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring',
                  selected ? 'bg-background font-semibold shadow-sm' : 'text-muted-foreground'
                )}
              >
                <input
                  type="radio"
                  name="taxChoice"
                  value={choice}
                  checked={selected}
                  onChange={() => onChange({ taxChoice: choice })}
                  className="sr-only"
                />
                {t(choice)}
              </label>
            )
          })}
        </div>
      </fieldset>

      {charges ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="taxRate" className="text-sm font-semibold">
                {t('rate')}
              </Label>
              <div className="relative">
                <Input
                  id="taxRate"
                  inputMode="decimal"
                  value={draft.taxRate}
                  onChange={(e) => onChange({ taxRate: e.target.value })}
                  aria-invalid={rateInvalid || rateMissing}
                  aria-describedby="taxRateHint"
                  className="h-11 bg-background pr-9 text-[15px]"
                />
                <span
                  className="pointer-events-none absolute top-1/2 right-3.5 -translate-y-1/2 text-muted-foreground"
                  aria-hidden="true"
                >
                  %
                </span>
              </div>
              <p
                id="taxRateHint"
                className={cn(
                  'text-[12.5px] leading-relaxed',
                  rateInvalid || rateMissing ? 'text-destructive' : 'text-muted-foreground'
                )}
              >
                {rateInvalid ? t('rateInvalid') : rateMissing ? t('rateMissing') : t('rateHint')}
              </p>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="taxName" className="text-sm font-semibold">
                {t('name')}
              </Label>
              <Input
                id="taxName"
                value={draft.taxLabel}
                onChange={(e) => onChange({ taxLabel: e.target.value, taxLabelEdited: true })}
                placeholder={t('namePlaceholder')}
                maxLength={40}
                aria-describedby="taxNameHint"
                className="h-11 bg-background text-[15px]"
              />
              <p id="taxNameHint" className="text-[12.5px] leading-relaxed text-muted-foreground">
                {draft.country && !draft.taxLabelEdited && draft.taxLabel
                  ? t('nameSuggested', { country: countryName(draft.country), example })
                  : t('nameHint', { example })}
              </p>
            </div>
          </div>

          <fieldset className="flex flex-col gap-2.5">
            <legend className="mb-2.5 text-sm font-semibold">{t('pricesLegend')}</legend>
            <div className="grid gap-2.5 sm:grid-cols-2">
              {([false, true] as const).map((inclusive) => {
                const selected = draft.taxInclusive === inclusive
                return (
                  <label
                    key={String(inclusive)}
                    className={cn(
                      'relative flex cursor-pointer flex-col gap-2 rounded-xl border bg-background p-4 transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring',
                      selected
                        ? 'border-2 border-primary bg-primary/5 p-[15px]'
                        : 'hover:border-primary/50'
                    )}
                  >
                    <input
                      type="radio"
                      name="taxInclusive"
                      checked={selected}
                      onChange={() => onChange({ taxInclusive: inclusive })}
                      className="sr-only"
                    />
                    <span className="flex items-center justify-between gap-2">
                      <span className="text-[15px] font-semibold">
                        {inclusive ? t('including') : t('before')}
                      </span>
                      {selected && (
                        <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
                          <Check className="h-3 w-3" strokeWidth={3} aria-hidden="true" />
                        </span>
                      )}
                    </span>
                    <span className="text-[13px] leading-relaxed text-muted-foreground">
                      {inclusive
                        ? t('includingExample', { total: money(total), tax: money(tax), label })
                        : t('beforeExample', {
                            price: money(price),
                            tax: money(tax),
                            label,
                            total: money(total),
                          })}
                    </span>
                  </label>
                )
              })}
            </div>
          </fieldset>
        </>
      ) : (
        <p className="rounded-xl border bg-background p-4 text-[13.5px] leading-relaxed text-muted-foreground">
          {draft.taxChoice === 'skipped' ? t('skippedHint') : t('noTax')}
        </p>
      )}

      <LaterInSettings>
        {t.rich('later', { tax: settingsPath('tax'), b: settingsPathTag })}
      </LaterInSettings>
    </div>
  )
}
