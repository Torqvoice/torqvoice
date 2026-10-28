'use client'

import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { type Locale, localeNames } from '@/i18n/config'
import { parseTaxRate, type SetupDraft } from '../../Lib/setupDraft'
import type { SetupStep } from './SetupStepper'

export function StepReady({
  draft,
  uiLocale,
  countryName,
  currencyLabel,
  datesValue,
  unitsValue,
  taxFallbackLabel,
  onEdit,
  onChange,
}: {
  draft: SetupDraft
  uiLocale: Locale
  countryName: (code: string) => string
  currencyLabel: string
  datesValue: string
  unitsValue: string
  /** What the tax is called when the owner gave it no name. */
  taxFallbackLabel: string
  onEdit: (step: SetupStep) => void
  onChange: (patch: Partial<SetupDraft>) => void
}) {
  const t = useTranslations('onboarding.setup.ready')
  const tForm = useTranslations('onboarding.form')
  const name = draft.workshopName.trim()
  const kind = t(`kinds.${draft.kind}`)
  const workshop = [name, kind, draft.country ? countryName(draft.country) : null]
    .filter(Boolean)
    .join(', ')
  const rate = parseTaxRate(draft.taxRate) ?? 0
  const label = draft.taxLabel.trim() || taxFallbackLabel
  const tax =
    draft.taxChoice === 'skipped'
      ? t('taxSkipped')
      : draft.taxChoice === 'no'
        ? t('taxOff')
        : t(draft.taxInclusive ? 'taxIncluding' : 'taxBefore', { label, rate })

  const rows: {
    key: string
    label: string
    value: React.ReactNode
    step: SetupStep
    highlight?: boolean
  }[] = [
    { key: 'workshop', label: t('rowWorkshop'), value: workshop, step: 'workshop' },
    {
      key: 'customers',
      label: t('rowCustomers'),
      highlight: true,
      step: 'region',
      value: (
        <span className="flex flex-col gap-0.5">
          <span className="font-semibold">{localeNames[draft.locale]}</span>
          <span className="text-[12.5px] font-normal text-muted-foreground">
            {t('rowScreens', { language: localeNames[uiLocale] })}
          </span>
        </span>
      ),
    },
    {
      key: 'money',
      label: t('rowMoney'),
      value: `${currencyLabel}, ${datesValue}, ${draft.timezone}`,
      step: 'region',
    },
    { key: 'units', label: t('rowUnits'), value: unitsValue, step: 'region' },
    { key: 'tax', label: t('rowTax'), value: tax, step: 'tax' },
  ]

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1.5">
        <h1 className="text-[28px] leading-tight font-bold tracking-tight">
          {t('title', { name: name || tForm('workshopNamePlaceholder') })}
        </h1>
        <p className="text-[15px] leading-relaxed text-muted-foreground">{t('subtitle')}</p>
      </div>

      <dl className="divide-y rounded-xl border bg-background">
        {rows.map((row) => (
          <div
            key={row.key}
            className={`flex flex-wrap items-baseline gap-x-4 gap-y-1 px-4 py-3.5 ${row.highlight ? 'bg-primary/5' : ''}`}
          >
            <dt className="w-full text-[13.5px] text-muted-foreground sm:w-36 sm:shrink-0">
              {row.label}
            </dt>
            <dd className="min-w-0 flex-1 text-sm font-medium">{row.value}</dd>
            <Button
              type="button"
              variant="link"
              className="h-auto p-0 text-[13.5px] font-semibold"
              onClick={() => onEdit(row.step)}
              aria-label={`${t('edit')}: ${row.label}`}
            >
              {t('edit')}
            </Button>
          </div>
        ))}
      </dl>

      <div className="flex flex-col gap-2">
        <Label htmlFor="address" className="text-sm font-semibold">
          {t('address')} <span className="font-normal text-muted-foreground">{t('optional')}</span>
        </Label>
        <Textarea
          id="address"
          rows={2}
          value={draft.address}
          onChange={(e) => onChange({ address: e.target.value })}
          placeholder={t('addressPlaceholder')}
          maxLength={500}
          autoComplete="street-address"
          className="bg-background text-[15px]"
        />
      </div>

      <div className="flex items-start justify-between gap-4 rounded-xl border bg-background p-4">
        <div className="flex flex-col gap-1">
          <Label htmlFor="loadSampleData" className="text-sm font-semibold">
            {tForm('sampleDataLabel')}
          </Label>
          <p className="text-[13px] leading-relaxed text-muted-foreground">
            {tForm('sampleDataDescription')}
          </p>
        </div>
        <Switch
          id="loadSampleData"
          checked={draft.loadSampleData}
          onCheckedChange={(loadSampleData) => onChange({ loadSampleData })}
          className="mt-0.5"
        />
      </div>
    </div>
  )
}
