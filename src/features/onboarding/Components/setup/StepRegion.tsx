'use client'

import { FileText, Monitor } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { type Locale, localeNames } from '@/i18n/config'
import { cn } from '@/lib/utils'
import { SETUP_DATE_FORMATS, type SetupDraft } from '../../Lib/setupDraft'
import { type PickerOption, SearchPicker } from './SearchPicker'

type Row = 'currency' | 'dates' | 'timeZone' | 'units' | 'phone'

const SAMPLE_DATE = new Date(Date.UTC(2026, 9, 28, 14, 30))

/** A date written the way a pattern writes it, for the choices and the summary. */
export function exampleDate(pattern: string, timeFormat: '12h' | '24h', withTime = false): string {
  const d = SAMPLE_DATE
  const months = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ]
  const longMonths = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ]
  const dd = String(d.getUTCDate()).padStart(2, '0')
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0')
  const date = pattern
    .replace('yyyy', String(d.getUTCFullYear()))
    .replace('MMMM', longMonths[d.getUTCMonth()])
    .replace('MMM', months[d.getUTCMonth()])
    .replace('MM', mm)
    .replace('dd', dd)
    .replace(/\bd\b/, String(d.getUTCDate()))
  if (!withTime) return date
  return `${date}, ${timeFormat === '12h' ? '2:30 PM' : '14:30'}`
}

export function StepRegion({
  draft,
  countryName,
  uiLocale,
  currencyOptions,
  zoneOptions,
  moneyExample,
  onChange,
}: {
  draft: SetupDraft
  countryName: (code: string) => string
  uiLocale: Locale
  currencyOptions: PickerOption[]
  zoneOptions: PickerOption[]
  /** 1234.56 written in the chosen currency. */
  moneyExample: string
  onChange: (patch: Partial<SetupDraft>) => void
}) {
  const t = useTranslations('onboarding.setup.region')
  const [open, setOpen] = useState<Row | null>(null)
  const language = localeNames[draft.locale]
  const currencyLabel =
    currencyOptions.find((o) => o.value === draft.currencyCode)?.label ?? draft.currencyCode
  const languageOptions: PickerOption[] = (Object.keys(localeNames) as Locale[]).map((l) => ({
    value: l,
    label: localeNames[l],
  }))

  const distance = draft.distance === 'imperial' ? t('distanceMiles') : t('distanceKm')
  const measure = draft.measure === 'imperial' ? t('measureImperial') : t('measureMetric')
  const units =
    draft.kind === 'marine'
      ? t('unitsSummary', { distance, measure })
      : t('unitsSummaryEngine', {
          distance,
          measure,
          engine: draft.engineSizeUnit === 'cc' ? t('engineCcShort') : t('engineLitresShort'),
        })
  const phoneValid = draft.dialCode === '' || /^\+\d{1,4}$/.test(draft.dialCode)

  const rows: { key: Row; label: string; value: string; editor: React.ReactNode }[] = [
    {
      key: 'currency',
      label: t('currency'),
      value: `${currencyLabel}, ${moneyExample}`,
      editor: (
        <SearchPicker
          value={draft.currencyCode}
          options={currencyOptions}
          onChange={(currencyCode) => onChange({ currencyCode })}
          placeholder={t('currency')}
          searchPlaceholder={t('currencySearch')}
          empty={t('noCurrency')}
        />
      ),
    },
    {
      key: 'dates',
      label: t('dates'),
      value: exampleDate(draft.dateFormat, draft.timeFormat, true),
      editor: (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="dateFormat" className="text-[13px]">
              {t('dateFormat')}
            </Label>
            <select
              id="dateFormat"
              value={draft.dateFormat}
              onChange={(e) => onChange({ dateFormat: e.target.value })}
              className="h-10 rounded-md border bg-background px-3 text-sm"
            >
              {SETUP_DATE_FORMATS.map((f) => (
                <option key={f} value={f}>
                  {exampleDate(f, draft.timeFormat)}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-[13px] font-medium" id="clockLabel">
              {t('clock')}
            </span>
            <div
              role="radiogroup"
              aria-labelledby="clockLabel"
              className="inline-flex gap-1 self-start rounded-lg bg-muted p-1"
            >
              {(['24h', '12h'] as const).map((clock) => (
                <button
                  key={clock}
                  type="button"
                  role="radio"
                  aria-checked={draft.timeFormat === clock}
                  onClick={() => onChange({ timeFormat: clock })}
                  className={cn(
                    'h-8 rounded-md px-3 text-sm',
                    draft.timeFormat === clock
                      ? 'bg-background font-semibold shadow-sm'
                      : 'text-muted-foreground'
                  )}
                >
                  {clock === '24h' ? t('clock24') : t('clock12')}
                </button>
              ))}
            </div>
          </div>
        </div>
      ),
    },
    {
      key: 'timeZone',
      label: t('timeZone'),
      value: draft.timezone,
      editor: (
        <SearchPicker
          value={draft.timezone}
          options={zoneOptions}
          onChange={(timezone) => onChange({ timezone })}
          placeholder={t('timeZone')}
          searchPlaceholder={t('zoneSearch')}
          empty={t('noZone')}
        />
      ),
    },
    {
      key: 'units',
      label: t('units'),
      value: units,
      editor: (
        <div className="grid gap-3 sm:grid-cols-2">
          <Choice
            id="distance"
            label={t('distance')}
            value={draft.distance}
            options={[
              ['metric', t('distanceKm')],
              ['imperial', t('distanceMiles')],
            ]}
            onChange={(v) => onChange({ distance: v === 'imperial' ? 'imperial' : 'metric' })}
          />
          <Choice
            id="measure"
            label={t('measure')}
            value={draft.measure}
            options={[
              ['metric', t('measureMetric')],
              ['imperial', t('measureImperial')],
            ]}
            onChange={(v) => onChange({ measure: v === 'imperial' ? 'imperial' : 'metric' })}
          />
          {draft.kind !== 'marine' && (
            <Choice
              id="engine"
              label={t('engine')}
              value={draft.engineSizeUnit}
              options={[
                ['litres', t('engineLitres')],
                ['cc', t('engineCc')],
              ]}
              onChange={(v) => onChange({ engineSizeUnit: v === 'cc' ? 'cc' : 'litres' })}
            />
          )}
        </div>
      ),
    },
    {
      key: 'phone',
      label: t('phone'),
      value: draft.dialCode ? t('phoneValue', { code: draft.dialCode }) : t('phoneNone'),
      editor: (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="dialCode" className="text-[13px]">
            {t('phonePrefix')}
          </Label>
          <Input
            id="dialCode"
            value={draft.dialCode}
            onChange={(e) => onChange({ dialCode: e.target.value.trim() })}
            inputMode="tel"
            aria-invalid={!phoneValid}
            aria-describedby="dialCodeHint"
            className="h-10 w-32 bg-background"
          />
          <p
            id="dialCodeHint"
            className={cn(
              'text-[12.5px]',
              phoneValid ? 'text-muted-foreground' : 'text-destructive'
            )}
          >
            {phoneValid ? t('phoneHint') : t('phoneInvalid')}
          </p>
        </div>
      ),
    },
  ]

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1.5">
        <h1 className="text-[28px] leading-tight font-bold tracking-tight">{t('title')}</h1>
        <p className="text-[15px] leading-relaxed text-muted-foreground">
          {draft.country
            ? t('subtitle', { country: countryName(draft.country) })
            : t('subtitleNoCountry')}
        </p>
      </div>

      <div className="flex flex-col gap-3.5 rounded-2xl border border-primary/30 bg-primary/5 p-5">
        <div className="flex items-start gap-3">
          <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-foreground">
            <FileText className="h-5 w-5" aria-hidden="true" />
          </span>
          <div className="flex min-w-0 flex-col gap-1">
            <Label htmlFor="docLanguage" className="text-[15px] font-semibold">
              {t('docLanguage')}
            </Label>
            <span className="text-[13px] leading-relaxed text-muted-foreground">
              {t('docLanguageHint')}
            </span>
          </div>
        </div>
        <SearchPicker
          id="docLanguage"
          value={draft.locale}
          options={languageOptions}
          onChange={(locale) => onChange({ locale: locale as Locale })}
          placeholder={t('docLanguage')}
          searchPlaceholder={t('languageSearch')}
          empty={t('noLanguage')}
          className="font-medium"
        />
        <div className="flex items-start gap-2.5 border-t border-primary/20 pt-3">
          <Monitor className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <p className="text-[13px] leading-relaxed text-muted-foreground">
            <strong className="font-semibold text-foreground">
              {t('ownScreens', { language: localeNames[uiLocale] })}
            </strong>{' '}
            {t('ownScreensHint')}
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-sm font-semibold" id="defaultsLabel">
          {t('defaults')}
        </span>
        <dl aria-labelledby="defaultsLabel" className="divide-y rounded-xl border bg-background">
          {rows.map((row) => {
            const editing = open === row.key
            return (
              <div key={row.key} className="flex flex-col gap-3 px-4 py-3">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                  <dt className="w-full text-[13.5px] text-muted-foreground sm:w-36 sm:shrink-0">
                    {row.label}
                  </dt>
                  <dd className="min-w-0 flex-1 text-sm font-medium">{row.value}</dd>
                  <Button
                    type="button"
                    variant="link"
                    className="h-auto p-0 text-[13.5px] font-semibold"
                    aria-expanded={editing}
                    onClick={() => setOpen(editing ? null : row.key)}
                  >
                    {editing ? t('done') : t('change')}
                  </Button>
                </div>
                {editing && <div className="pb-1">{row.editor}</div>}
              </div>
            )
          })}
        </dl>
      </div>

      <div className="flex items-start justify-between gap-4 rounded-xl border bg-background p-4">
        <div className="flex flex-col gap-1">
          <Label htmlFor="forceCustomerLocale" className="text-sm font-semibold">
            {t('forceTitle', { language })}
          </Label>
          <p className="text-[13px] leading-relaxed text-muted-foreground">
            {t('forceHint', { language })}
          </p>
        </div>
        <Switch
          id="forceCustomerLocale"
          checked={draft.forceCustomerLocale}
          onCheckedChange={(forceCustomerLocale) => onChange({ forceCustomerLocale })}
          className="mt-0.5"
        />
      </div>
    </div>
  )
}

function Choice({
  id,
  label,
  value,
  options,
  onChange,
}: {
  id: string
  label: string
  value: string
  options: [string, string][]
  onChange: (value: string) => void
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id} className="text-[13px]">
        {label}
      </Label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-10 rounded-md border bg-background px-3 text-sm"
      >
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </div>
  )
}
