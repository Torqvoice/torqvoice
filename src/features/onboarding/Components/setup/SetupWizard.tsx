'use client'

import { ArrowLeft, ArrowRight, Loader2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AuthLogo } from '@/components/auth-logo'
import { useGlassModal } from '@/components/glass-modal'
import { Button } from '@/components/ui/button'
import { defaultLocale, type Locale, locales } from '@/i18n/config'
import { track } from '@/lib/analytics'
import { COUNTRY_CODES, detectCountry } from '@/lib/country-defaults'
import { currencyName, SELECTABLE_CURRENCIES } from '@/lib/currencies'
import { formatCurrency } from '@/lib/format'
import { safeRedirectPath } from '@/lib/safe-redirect'
import { createOnboardingOrg } from '../../Actions/createOnboardingOrg'
import {
  initialDraft,
  type SetupDraft,
  setupPayload,
  taxStepComplete,
  type WorkKind,
  withCountry,
  withKind,
} from '../../Lib/setupDraft'
import type { PickerOption } from './SearchPicker'
import { SETUP_STEPS, type SetupStep, SetupStepper } from './SetupStepper'
import { SetupPreview } from './SetupPreview'
import { exampleDate, StepRegion } from './StepRegion'
import { StepReady } from './StepReady'
import { StepTax } from './StepTax'
import { StepWorkshop } from './StepWorkshop'

function browserFacts() {
  if (typeof window === 'undefined') return { timeZone: 'UTC', languages: [] as string[] }
  return {
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
    languages: [...(navigator.languages ?? [navigator.language])].filter(Boolean),
  }
}

/**
 * The guided setup of a new workshop: what it is and where, the language its
 * customers get, its taxes, and a last look. Every regional choice starts
 * from the country and stays editable, beside a preview of the first invoice
 * as it would print. Nothing is saved until Create workshop.
 */
export function SetupWizard({ redirectTo }: { redirectTo?: string }) {
  const t = useTranslations('onboarding.setup')
  const tRegion = useTranslations('onboarding.setup.region')
  const tForm = useTranslations('onboarding.form')
  const tTax = useTranslations('onboarding.setup.tax')
  const tCommon = useTranslations('common')
  const uiLocaleRaw = useLocale()
  const uiLocale: Locale = (locales as readonly string[]).includes(uiLocaleRaw)
    ? (uiLocaleRaw as Locale)
    : defaultLocale
  const router = useRouter()
  const modal = useGlassModal()

  const [facts] = useState(browserFacts)
  const [draft, setDraft] = useState<SetupDraft>(() =>
    initialDraft({ timeZone: facts.timeZone, languages: facts.languages, uiLocale })
  )
  // The zone that decided the country, kept to say so on the first step.
  const [detectedZone] = useState(() => (detectCountry(facts.timeZone, []) ? facts.timeZone : null))
  const [step, setStep] = useState<SetupStep>('workshop')
  const [reached, setReached] = useState(0)
  const [saving, setSaving] = useState(false)
  const headingRef = useRef<HTMLDivElement>(null)
  const firstRender = useRef(true)

  const patch = useCallback((p: Partial<SetupDraft>) => setDraft((d) => ({ ...d, ...p })), [])

  const regionNames = useMemo(
    () => new Intl.DisplayNames([uiLocale], { type: 'region' }),
    [uiLocale]
  )
  const countryName = useCallback((code: string) => regionNames.of(code) ?? code, [regionNames])
  const countryOptions: PickerOption[] = useMemo(
    () =>
      COUNTRY_CODES.map((code) => ({ value: code, label: countryName(code), keywords: code })).sort(
        (a, b) => a.label.localeCompare(b.label, uiLocale)
      ),
    [countryName, uiLocale]
  )
  const currencyOptions: PickerOption[] = useMemo(
    () =>
      SELECTABLE_CURRENCIES.map((c) => ({
        value: c.code,
        label: `${currencyName(c.code, uiLocale)} (${c.code})`,
        keywords: c.code,
      })),
    [uiLocale]
  )
  const zoneOptions: PickerOption[] = useMemo(() => {
    const zones =
      typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : []
    const all = zones.includes(draft.timezone) ? zones : [draft.timezone, ...zones]
    return all.map((z) => ({ value: z, label: z.replaceAll('_', ' '), keywords: z }))
  }, [draft.timezone])

  const money = useCallback(
    (value: number) => formatCurrency(value, draft.currencyCode),
    [draft.currencyCode]
  )
  const currencyLabel =
    currencyOptions.find((o) => o.value === draft.currencyCode)?.label ?? draft.currencyCode
  const distance = draft.distance === 'imperial' ? tRegion('distanceMiles') : tRegion('distanceKm')
  const measure =
    draft.measure === 'imperial' ? tRegion('measureImperial') : tRegion('measureMetric')
  const unitsValue =
    draft.kind === 'marine'
      ? tRegion('unitsSummary', { distance, measure })
      : tRegion('unitsSummaryEngine', {
          distance,
          measure,
          engine:
            draft.engineSizeUnit === 'cc' ? tRegion('engineCcShort') : tRegion('engineLitresShort'),
        })

  // A new step is announced by moving focus to its heading.
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false
      return
    }
    const heading = headingRef.current?.querySelector('h1')
    if (heading) {
      heading.setAttribute('tabindex', '-1')
      heading.focus({ preventScroll: true })
    }
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [step])

  const go = (next: SetupStep) => {
    const index = SETUP_STEPS.indexOf(next)
    setReached((r) => Math.max(r, index))
    setStep(next)
  }

  const nameValid = draft.workshopName.trim().length >= 2
  const phoneValid = draft.dialCode === '' || /^\+\d{1,4}$/.test(draft.dialCode)
  const canContinue =
    step === 'workshop'
      ? nameValid
      : step === 'region'
        ? phoneValid
        : step === 'tax'
          ? taxStepComplete(draft)
          : nameValid

  const advance = (action: 'continue' | 'skip') => {
    track('workshop:setup_step', { step, action })
    if (step === 'workshop' && action === 'skip') {
      // The suggestions as they stand; the tax is left to Settings.
      patch({ taxChoice: 'skipped' })
      go('ready')
      return
    }
    if (step === 'tax' && action === 'skip') {
      patch({ taxChoice: 'skipped' })
      go('ready')
      return
    }
    const next = SETUP_STEPS[SETUP_STEPS.indexOf(step) + 1]
    if (next) go(next)
  }

  const back = () => {
    const previous = SETUP_STEPS[SETUP_STEPS.indexOf(step) - 1]
    if (previous) setStep(previous)
  }

  const create = async () => {
    if (!nameValid) {
      go('workshop')
      return
    }
    setSaving(true)
    try {
      const result = await createOnboardingOrg(setupPayload(draft))
      if (!result.success) {
        modal.open('error', tForm('setupFailed'), result.error || tForm('couldNotCreate'))
        return
      }
      track('workshop:create', {
        sample_data: draft.loadSampleData,
        country: draft.country ?? 'unknown',
        locale: draft.locale,
        kind: draft.kind,
        tax: draft.taxChoice,
      })
      router.push(safeRedirectPath(redirectTo))
      router.refresh()
    } catch {
      modal.open('error', tForm('setupFailed'), tForm('unexpectedError'))
    } finally {
      setSaving(false)
    }
  }

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (step === 'ready') void create()
    else if (canContinue) advance('continue')
  }

  return (
    <div className="relative z-10 mx-auto flex w-full max-w-[1120px] flex-col gap-7">
      <div className="flex flex-wrap items-center justify-between gap-4">
        {/* The brand mark, as on the sign-up page: a new workshop has no logo of its own yet. */}
        <AuthLogo alt={tCommon('brandName')} />
        <SetupStepper current={step} reached={reached} onGo={go} />
      </div>

      <div className="flex flex-wrap items-start gap-8">
        <form
          onSubmit={onSubmit}
          noValidate
          className="glass flex min-w-0 flex-[999_1_520px] flex-col gap-7 rounded-2xl p-6 shadow-2xl sm:p-9"
        >
          {/* Focus lands on each step's heading for screen readers; it is not a control, so no ring. */}
          <div ref={headingRef} className="[&_h1]:outline-none">
            {step === 'workshop' && (
              <StepWorkshop
                draft={draft}
                detectedZone={draft.country && detectedZone ? detectedZone : null}
                countryOptions={countryOptions}
                countryName={countryName}
                onName={(workshopName) => patch({ workshopName })}
                onKind={(kind: WorkKind) => setDraft((d) => withKind(d, kind))}
                onCountry={(country) =>
                  setDraft((d) => withCountry(d, country, facts.languages[0]))
                }
              />
            )}
            {step === 'region' && (
              <StepRegion
                draft={draft}
                countryName={countryName}
                uiLocale={uiLocale}
                currencyOptions={currencyOptions}
                zoneOptions={zoneOptions}
                moneyExample={money(1234.56)}
                onChange={patch}
              />
            )}
            {step === 'tax' && (
              <StepTax draft={draft} countryName={countryName} money={money} onChange={patch} />
            )}
            {step === 'ready' && (
              <StepReady
                draft={draft}
                uiLocale={uiLocale}
                countryName={countryName}
                currencyLabel={currencyLabel}
                datesValue={exampleDate(draft.dateFormat, draft.timeFormat)}
                unitsValue={unitsValue}
                taxFallbackLabel={tTax('namePlaceholder')}
                onEdit={go}
                onChange={patch}
              />
            )}
          </div>

          {/* On a phone the main button comes first at full width, the skip link
              under it and Back last; side by side from sm. */}
          <div className="flex flex-col-reverse gap-3 border-t border-border/60 pt-6 sm:flex-row sm:items-center sm:justify-between">
            {step === 'workshop' ? (
              <span className="hidden sm:block" />
            ) : (
              <Button
                type="button"
                variant="outline"
                className="h-11 w-full px-4 sm:w-auto"
                onClick={back}
              >
                <ArrowLeft className="mr-1.5 h-4 w-4" aria-hidden="true" />
                {t('back')}
              </Button>
            )}
            <div className="flex flex-col-reverse items-stretch gap-3 sm:flex-row sm:items-center sm:gap-5">
              {(step === 'workshop' || step === 'tax') && (
                <Button
                  type="button"
                  variant="link"
                  className="h-auto p-0 text-[13.5px] font-semibold"
                  disabled={step === 'workshop' && !nameValid}
                  onClick={() => advance('skip')}
                >
                  {step === 'workshop' ? t('workshop.skip') : tTax('skip')}
                </Button>
              )}
              {step === 'ready' ? (
                <Button
                  type="submit"
                  className="h-12 w-full px-6 text-[15px] font-bold sm:w-auto"
                  disabled={saving}
                >
                  {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
                  {t('ready.create')}
                  {!saving && <ArrowRight className="ml-1.5 h-4 w-4" aria-hidden="true" />}
                </Button>
              ) : (
                <Button
                  type="submit"
                  className="h-11 w-full px-6 text-[15px] font-semibold sm:w-auto"
                  disabled={!canContinue}
                >
                  {t('continue')}
                  <ArrowRight className="ml-1.5 h-4 w-4" aria-hidden="true" />
                </Button>
              )}
            </div>
          </div>
        </form>

        <div className="w-full min-w-0 flex-[1_1_360px] md:max-w-[440px]">
          <SetupPreview
            draft={draft}
            caption={step === 'workshop' ? t('preview.first') : t('preview.live')}
          />
        </div>
      </div>
    </div>
  )
}
