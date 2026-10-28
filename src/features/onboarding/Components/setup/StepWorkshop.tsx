'use client'

import { Bike, Car, Check, MapPin, Ship } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
  detectedZone,
  countryOptions,
  countryName,
  onName,
  onKind,
  onCountry,
}: {
  draft: SetupDraft
  /** The browser's zone when it decided the country, for the hint. */
  detectedZone: string | null
  countryOptions: PickerOption[]
  countryName: (code: string) => string
  onName: (name: string) => void
  onKind: (kind: WorkKind) => void
  onCountry: (country: string) => void
}) {
  const t = useTranslations('onboarding.setup.workshop')
  const country = draft.country ? countryName(draft.country) : null
  return (
    <div className="flex flex-col gap-7">
      <div className="flex flex-col gap-1.5">
        <h1 className="text-[28px] leading-tight font-bold tracking-tight">{t('title')}</h1>
        <p className="text-[15px] leading-relaxed text-muted-foreground">{t('subtitle')}</p>
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
          className="h-11 bg-background text-[15px]"
        />
      </div>

      <fieldset className="flex flex-col gap-2.5">
        <legend className="mb-2.5 text-sm font-semibold">{t('kindLegend')}</legend>
        <div className="grid gap-2.5 sm:grid-cols-3">
          {KINDS.map(({ kind, Icon }) => {
            const selected = draft.kind === kind
            return (
              <label
                key={kind}
                className={cn(
                  'relative flex cursor-pointer flex-col gap-2.5 rounded-xl border bg-background p-4 transition-colors',
                  'has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring',
                  selected
                    ? 'border-2 border-primary bg-primary/5 p-[15px]'
                    : 'hover:border-primary/50'
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
                <span className="flex items-center justify-between">
                  <Icon className="h-6 w-6" strokeWidth={1.75} aria-hidden="true" />
                  {selected && (
                    <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
                      <Check className="h-3 w-3" strokeWidth={3} aria-hidden="true" />
                    </span>
                  )}
                </span>
                <span className="text-[15px] font-semibold">{t(`kinds.${kind}.title`)}</span>
                <span className="text-[12.5px] leading-snug text-muted-foreground">
                  {t(`kinds.${kind}.hint`)}
                </span>
              </label>
            )
          })}
        </div>
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
