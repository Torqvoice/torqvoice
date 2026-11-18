'use client'

import { Bike, Car, FileText, Globe, MapPin, Ship } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { type Locale, localeNames } from '@/i18n/config'
import { countryDefaults } from '@/lib/country-defaults'
import { cn } from '@/lib/utils'
import type { SetupDraft, WorkKind } from '../../Lib/setupDraft'
import { type PickerOption, SearchPicker } from './SearchPicker'

const KINDS: { kind: WorkKind; Icon: typeof Car }[] = [
  { kind: 'cars', Icon: Car },
  { kind: 'motorcycles', Icon: Bike },
  { kind: 'marine', Icon: Ship },
]

export function StepWorkshop({
  draft,
  showErrors,
  uiLocale,
  switchingScreens,
  languageOptions,
  onLanguage,
  onCustomerLanguage,
  onSeparateLanguage,
  onSameLanguage,
  detectedZone,
  countryOptions,
  countryName,
  onName,
  onKind,
  onCountry,
}: {
  draft: SetupDraft
  /** Continue was pressed without a name: say so. */
  showErrors: boolean
  /** The language on screen now. */
  uiLocale: Locale
  /** True while the screens are being redrawn in another language. */
  switchingScreens: boolean
  languageOptions: PickerOption[]
  /** The owner's own language: screens, workshop and customers. */
  onLanguage: (locale: Locale) => void
  /** A language for customers alone. */
  onCustomerLanguage: (locale: Locale) => void
  /** Opens the customer language under the owner's. */
  onSeparateLanguage: () => void
  /** Customers back on the owner's language. */
  onSameLanguage: () => void
  /** The browser's zone when it decided the country, for the hint. */
  detectedZone: string | null
  countryOptions: PickerOption[]
  countryName: (code: string) => string
  onName: (name: string) => void
  onKind: (kind: WorkKind) => void
  onCountry: (country: string) => void
}) {
  const t = useTranslations('onboarding.setup.workshop')
  const tRegion = useTranslations('onboarding.setup.region')
  const country = draft.country ? countryName(draft.country) : null
  const nameMissing = showErrors && draft.workshopName.trim().length < 2

  // Said under the language: who gets it, and where it came from.
  const fromCountry = draft.languageSource === 'country' && country
  const spoken = draft.country ? countryDefaults(draft.country) : null
  const missing =
    fromCountry && spoken && !spoken.locale && draft.locale === 'en'
      ? new Intl.DisplayNames([uiLocale], { type: 'language' }).of(spoken.language)
      : null
  const separate = draft.customerLanguageSeparate
  const languageHint = separate
    ? t('languageScreensOnly')
    : missing && country
      ? t('languageMissing', { language: missing, country })
      : fromCountry
        ? t('languageFromCountry', { country })
        : t('languageBoth')

  return (
    <div className="flex flex-col gap-7">
      <div className="flex flex-col gap-1.5">
        <h1 className="text-[28px] leading-tight font-bold tracking-tight">{t('title')}</h1>
        <p className="text-[15px] leading-relaxed text-muted-foreground">{t('subtitle')}</p>
      </div>

      <div className="flex flex-col gap-2">
        {/* Named in English too, so someone on a borrowed computer finds it. */}
        <Label htmlFor="language" className="text-sm font-semibold">
          {t('language')}
          {uiLocale !== 'en' && (
            <span className="font-normal text-muted-foreground" lang="en">
              {' '}
              · Language
            </span>
          )}
        </Label>
        <SearchPicker
          id="language"
          value={uiLocale}
          options={languageOptions}
          onChange={(locale) => onLanguage(locale as Locale)}
          placeholder={t('language')}
          searchPlaceholder={tRegion('languageSearch')}
          empty={tRegion('noLanguage')}
          disabled={switchingScreens}
          icon={<Globe className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />}
        />
        <p className="text-[13px] leading-relaxed text-muted-foreground" aria-live="polite">
          {languageHint}
        </p>

        {/* Customers get the owner's language unless asked otherwise, and
            the choice is offered right here rather than as a field of its own. */}
        {separate ? (
          <div className="mt-1.5 flex flex-col gap-2 rounded-xl border bg-background p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <Label htmlFor="docLanguage" className="text-sm font-semibold">
                {tRegion('docLanguage')}
              </Label>
              <Button
                type="button"
                variant="link"
                className="h-auto p-0 text-[13px] font-semibold"
                onClick={onSameLanguage}
              >
                {t('customerLanguageSame', { language: localeNames[uiLocale] })}
              </Button>
            </div>
            <SearchPicker
              id="docLanguage"
              value={draft.locale}
              options={languageOptions}
              onChange={(locale) => onCustomerLanguage(locale as Locale)}
              placeholder={tRegion('docLanguage')}
              searchPlaceholder={tRegion('languageSearch')}
              empty={tRegion('noLanguage')}
              icon={
                <FileText className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              }
            />
            <p className="text-[13px] leading-relaxed text-muted-foreground">
              {fromCountry && country
                ? `${t('customerLanguageFromCountry', { country })} ${tRegion('docLanguageHint')}`
                : tRegion('docLanguageHint')}
            </p>
          </div>
        ) : (
          <Button
            type="button"
            variant="link"
            className="h-auto self-start p-0 text-[13px] font-semibold"
            onClick={onSeparateLanguage}
          >
            {t('customerLanguageDifferent')}
          </Button>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="workshopName" className="text-sm font-semibold">
          {t('name')}
        </Label>
        <Input
          id="workshopName"
          value={draft.workshopName}
          onChange={(e) => onName(e.target.value)}
          placeholder={t('namePlaceholder')}
          required
          minLength={2}
          maxLength={100}
          autoComplete="organization"
          aria-invalid={nameMissing || undefined}
          aria-describedby={nameMissing ? 'workshopNameError' : undefined}
          className="h-11 bg-background text-[15px]"
        />
        {nameMissing && (
          <p id="workshopNameError" className="text-[13px] text-destructive">
            {t('nameMissing')}
          </p>
        )}
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-semibold">{t('kindLegend')}</legend>
        {/* One row of choices, with what the chosen one means said once
            underneath, so the step stays short. */}
        <div className="flex flex-wrap gap-2">
          {KINDS.map(({ kind, Icon }) => {
            const selected = draft.kind === kind
            return (
              <label
                key={kind}
                className={cn(
                  'inline-flex cursor-pointer items-center gap-2 rounded-full border bg-background px-3.5 py-2 text-[14px] font-medium transition-colors',
                  'has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring',
                  selected
                    ? 'border-primary bg-primary/10 font-semibold text-foreground'
                    : 'text-muted-foreground hover:border-primary/50 hover:text-foreground'
                )}
              >
                <input
                  type="radio"
                  name="kind"
                  value={kind}
                  checked={selected}
                  onChange={() => onKind(kind)}
                  className="sr-only"
                />
                <Icon className="h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />
                {t(`kinds.${kind}.title`)}
              </label>
            )
          })}
        </div>
        <p className="text-[13px] leading-relaxed text-muted-foreground">
          {t(`kinds.${draft.kind}.hint`)}
        </p>
      </fieldset>

      <div className="flex flex-col gap-2">
        <Label htmlFor="country" className="text-sm font-semibold">
          {t('country')}
        </Label>
        <SearchPicker
          id="country"
          value={draft.country}
          options={countryOptions}
          onChange={onCountry}
          placeholder={t('countryPlaceholder')}
          searchPlaceholder={t('countrySearch')}
          empty={t('noCountry')}
          icon={<MapPin className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />}
        />
        <p className="text-[13px] leading-relaxed text-muted-foreground">
          {!country
            ? t('countryMissing')
            : detectedZone
              ? t('countryDetected', { zone: detectedZone, country })
              : t('countryChosen', { country })}
        </p>
      </div>
    </div>
  )
}
