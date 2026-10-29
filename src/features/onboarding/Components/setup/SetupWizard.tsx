'use client'

import { ArrowLeft, ArrowRight, Loader2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { AuthLogo } from '@/components/auth-logo'
import { useGlassModal } from '@/components/glass-modal'
import { Button } from '@/components/ui/button'
import { defaultLocale, type Locale, localeNames, locales } from '@/i18n/config'
import { registerAnalyticsProperties, track, unregisterAnalyticsProperties } from '@/lib/analytics'
import { COUNTRY_CODES, countrySearchTerms, detectCountry } from '@/lib/country-defaults'
import { currencyName, SELECTABLE_CURRENCIES } from '@/lib/currencies'
import { formatCurrency } from '@/lib/format'
import { safeRedirectPath } from '@/lib/safe-redirect'
import { createOnboardingOrg } from '../../Actions/createOnboardingOrg'
import {
  initialDraft,
  type SetupDraft,
  dialCodeValid,
  firstIncompleteStep,
  setupPayload,
  taxStepComplete,
  withCountry,
  withCustomerLanguage,
  withKind,
  withLanguage,
  withSameLanguage,
  type WorkKind,
} from '../../Lib/setupDraft'
import type { PickerOption } from './SearchPicker'
import { SETUP_STEPS, type SetupStep, SetupStepper } from './SetupStepper'
import { SetupPreview } from './SetupPreview'
import { exampleDate, StepRegion } from './StepRegion'
import { StepReady } from './StepReady'
import { StepTax } from './StepTax'
import { StepWorkshop } from './StepWorkshop'
import { useScreenLanguage } from './useScreenLanguage'

interface BrowserFacts {
  timeZone: string
  languages: string[]
}

let cachedFacts: BrowserFacts | null = null

/** Where the browser says it is. Read once; the same object every time, as useSyncExternalStore wants. */
function readBrowserFacts(): BrowserFacts {
  cachedFacts ??= {
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
    languages: [...(navigator.languages ?? [navigator.language])].filter(Boolean),
  }
  return cachedFacts
}

const noSubscription = () => () => undefined

/**
 * The guided setup of a new workshop: what it is and where, the language its
 * customers get, its taxes, and a last look. Every regional choice starts
 * from the country and stays editable, beside a preview of the first invoice
 * as it would print. Nothing is saved until Create workshop.
 *
 * The first draft comes from the browser's time zone and languages, which the
 * server cannot know, so the wizard is drawn once the page runs in the
 * browser. Drawing it on the server too would show an empty country there
 * and a detected one in the browser, and React would refuse to hydrate.
 */
export function SetupWizard({ redirectTo }: { redirectTo?: string }) {
  const facts = useSyncExternalStore(noSubscription, readBrowserFacts, () => null)
  if (!facts) {
    return (
      <div
        className="relative z-10 mx-auto flex min-h-[60vh] w-full max-w-[1120px] items-center justify-center"
        aria-busy="true"
      >
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-hidden="true" />
      </div>
    )
  }
  return <SetupWizardSteps redirectTo={redirectTo} facts={facts} />
}

function SetupWizardSteps({ redirectTo, facts }: { redirectTo?: string; facts: BrowserFacts }) {
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

  const [draft, setDraft] = useState<SetupDraft>(() =>
    initialDraft({ timeZone: facts.timeZone, languages: facts.languages, uiLocale })
  )
  // The zone that decided the country, kept to say so on the first step.
  const [detectedCountry] = useState(() => detectCountry(facts.timeZone, []))
  const detectedZone = detectedCountry ? facts.timeZone : null
  const [step, setStep] = useState<SetupStep>('workshop')
  const [reached, setReached] = useState(0)
  const [saving, setSaving] = useState(false)
  const headingRef = useRef<HTMLDivElement>(null)
  const firstRender = useRef(true)

  const patch = useCallback((p: Partial<SetupDraft>) => setDraft((d) => ({ ...d, ...p })), [])

  // Analytics. Every event while the wizard is open carries the step it
  // happened on, autocaptured rage clicks included, so a stuck step shows.
  const startedAt = useRef(Date.now())
  const stepOpenedAt = useRef(Date.now())
  const countryPicked = useRef(false)
  const blockedCount = useRef(0)
  const secondsOnStep = () => Math.round((Date.now() - stepOpenedAt.current) / 1000)
  // Sent once, as the wizard opens.
  useEffect(() => {
    track('workshop:setup_start', {
      detected_country: draft.country ?? 'none',
      detected_from: detectedZone ? 'time_zone' : draft.country ? 'browser_language' : 'none',
      browser_language: facts.languages[0] ?? 'unknown',
      time_zone: facts.timeZone,
      screen_language: uiLocale,
      customer_language: draft.locale,
    })
    return () => unregisterAnalyticsProperties(['setup_step'])
  }, [])
  useEffect(() => {
    registerAnalyticsProperties({ setup_step: step })
    stepOpenedAt.current = Date.now()
  }, [step])

  // The step whose Continue was pressed while something was missing: its
  // fields say what, until it is put right.
  const [blockedStep, setBlockedStep] = useState<SetupStep | null>(null)

  const regionNames = useMemo(
    () => new Intl.DisplayNames([uiLocale], { type: 'region' }),
    [uiLocale]
  )
  const countryName = useCallback((code: string) => regionNames.of(code) ?? code, [regionNames])
  const countryOptions: PickerOption[] = useMemo(
    () =>
      COUNTRY_CODES.map((code) => ({
        value: code,
        label: countryName(code),
        keywords: countrySearchTerms(code),
      })).sort((a, b) => a.label.localeCompare(b.label, uiLocale)),
    [countryName, uiLocale]
  )
  // Every language by its own name, found by its English name and by its
  // name in the language on screen too: "English" on a Norwegian page.
  const languageOptions: PickerOption[] = useMemo(() => {
    const inEnglish = new Intl.DisplayNames(['en'], { type: 'language' })
    const onScreen = new Intl.DisplayNames([uiLocale], { type: 'language' })
    return locales.map((l) => ({
      value: l,
      label: localeNames[l],
      keywords: `${l} ${inEnglish.of(l) ?? ''} ${onScreen.of(l) ?? ''}`,
    }))
  }, [uiLocale])

  const screens = useScreenLanguage()

  /** The owner's own language: their screens switch to it, and their customers get it. */
  const chooseLanguage = (locale: Locale) => {
    track('workshop:setup_language_change', {
      via: 'language_field',
      from: uiLocale,
      to: locale,
      customer_from: draft.locale,
    })
    setDraft((d) => withLanguage(d, locale))
    if (locale !== uiLocale) screens.switchTo(locale)
  }

  /** A language for customers alone, under the owner's. */
  const chooseCustomerLanguage = (locale: Locale) => {
    if (locale === draft.locale) return
    track('workshop:setup_language_change', {
      via: 'customer_language',
      from: draft.locale,
      to: locale,
    })
    setDraft((d) => withCustomerLanguage(d, locale))
  }

  /**
   * A country the owner picked fills in its region, and its language too
   * unless they picked one themselves; their screens then follow it.
   */
  const chooseCountry = (country: string) => {
    if (country === draft.country) return
    const next = withCountry(draft, country, facts.languages[0])
    track('workshop:setup_country_change', {
      from: draft.country ?? 'none',
      to: country,
      replaced: draft.country ? (countryPicked.current ? 'pick' : 'detected') : 'none',
    })
    countryPicked.current = true
    setDraft(next)
    if (next.languageSource !== 'chosen' && next.locale !== uiLocale) {
      track('workshop:setup_language_change', {
        via: 'country',
        from: uiLocale,
        to: next.locale,
        customer_from: draft.locale,
      })
      screens.switchTo(next.locale)
    }
  }

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
    setBlockedStep(null)
    setStep(next)
  }

  /** The step bar and the Edit links on Ready. */
  const jump = (next: SetupStep) => {
    if (next === step) return
    track('workshop:setup_step', { step, action: 'jump', to: next, seconds: secondsOnStep() })
    go(next)
  }

  const nameValid = draft.workshopName.trim().length >= 2
  const phoneValid = dialCodeValid(draft.dialCode)
  const canContinue =
    step === 'workshop'
      ? nameValid
      : step === 'region'
        ? phoneValid
        : step === 'tax'
          ? taxStepComplete(draft)
          : nameValid

  const advance = (action: 'continue' | 'skip') => {
    const to = action === 'skip' ? 'ready' : (SETUP_STEPS[SETUP_STEPS.indexOf(step) + 1] ?? 'ready')
    track('workshop:setup_step', { step, action, to, seconds: secondsOnStep() })
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
    if (!previous) return
    track('workshop:setup_step', { step, action: 'back', to: previous, seconds: secondsOnStep() })
    setBlockedStep(null)
    setStep(previous)
  }

  /**
   * Continue on an incomplete step: say what is missing, and go to it. From
   * Ready, `at` is the earlier step that was emptied again.
   */
  const block = (at: 'workshop' | 'region' | 'tax' = step as 'workshop' | 'region' | 'tax') => {
    const reason =
      at === 'workshop'
        ? 'name'
        : at === 'region'
          ? 'phone_prefix'
          : draft.taxRate.trim() === ''
            ? 'tax_rate_missing'
            : 'tax_rate_invalid'
    blockedCount.current += 1
    track('workshop:setup_blocked', { step, reason, attempt: blockedCount.current })
    if (at !== step) go(at)
    setBlockedStep(at)
    const field = at === 'workshop' ? 'workshopName' : at === 'region' ? 'dialCode' : 'taxRate'
    // Two frames: a step switched to here is drawn before its field exists.
    requestAnimationFrame(() =>
      requestAnimationFrame(() => document.getElementById(field)?.focus())
    )
  }

  const create = async () => {
    const incomplete = firstIncompleteStep(draft)
    if (incomplete) {
      block(incomplete)
      return
    }
    setSaving(true)
    try {
      const result = await createOnboardingOrg(setupPayload(draft))
      if (!result.success) {
        track('workshop:setup_create_fail', { reason: 'refused' })
        modal.open('error', tForm('setupFailed'), result.error || tForm('couldNotCreate'))
        return
      }
      track('workshop:create', {
        sample_data: draft.loadSampleData,
        country: draft.country ?? 'unknown',
        locale: draft.locale,
        screen_language: uiLocale,
        language_source: draft.languageSource,
        currency: draft.currencyCode,
        distance: draft.distance,
        measure: draft.measure,
        kind: draft.kind,
        tax: draft.taxChoice,
        seconds: Math.round((Date.now() - startedAt.current) / 1000),
      })
      router.push(safeRedirectPath(redirectTo))
      router.refresh()
    } catch {
      track('workshop:setup_create_fail', { reason: 'error' })
      modal.open('error', tForm('setupFailed'), tForm('unexpectedError'))
    } finally {
      setSaving(false)
    }
  }

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (step === 'ready') void create()
    else if (canContinue) advance('continue')
    else block()
  }

  return (
    <div className="relative z-10 mx-auto flex w-full max-w-[1120px] flex-col gap-7">
      <div className="flex flex-wrap items-center justify-between gap-4">
        {/* The brand mark, as on the sign-up page: a new workshop has no logo of its own yet. */}
        <AuthLogo alt={tCommon('brandName')} />
        <SetupStepper current={step} reached={reached} onGo={jump} />
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
                showErrors={blockedStep === 'workshop'}
                uiLocale={uiLocale}
                switchingScreens={screens.pending}
                languageOptions={languageOptions}
                // Only while the country is still the one the clock gave.
                detectedZone={draft.country === detectedCountry ? detectedZone : null}
                countryOptions={countryOptions}
                countryName={countryName}
                onLanguage={chooseLanguage}
                onCustomerLanguage={chooseCustomerLanguage}
                onSeparateLanguage={() => {
                  track('workshop:setup_suggestion_edit', { field: 'customer_language' })
                  patch({ customerLanguageSeparate: true })
                }}
                onSameLanguage={() => {
                  track('workshop:setup_language_change', {
                    via: 'customer_language_same',
                    from: draft.locale,
                    to: uiLocale,
                  })
                  setDraft((d) => withSameLanguage(d, uiLocale))
                }}
                onName={(workshopName) => patch({ workshopName })}
                onKind={(kind: WorkKind) => setDraft((d) => withKind(d, kind))}
                onCountry={chooseCountry}
              />
            )}
            {step === 'region' && (
              <StepRegion
                draft={draft}
                countryName={countryName}
                currencyOptions={currencyOptions}
                zoneOptions={zoneOptions}
                moneyExample={money(1234.56)}
                onChange={patch}
              />
            )}
            {step === 'tax' && (
              <StepTax
                draft={draft}
                showErrors={blockedStep === 'tax'}
                countryName={countryName}
                money={money}
                onChange={patch}
              />
            )}
            {step === 'ready' && (
              <StepReady
                draft={draft}
                uiLocale={uiLocale}
                countryName={countryName}
                currencyLabel={currencyLabel}
                datesValue={exampleDate(draft.dateFormat, draft.timeFormat, false, draft.timezone)}
                unitsValue={unitsValue}
                taxFallbackLabel={tTax('namePlaceholder')}
                onEdit={jump}
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
                  className="h-11 w-full px-6 text-[15px] font-semibold aria-disabled:opacity-50 sm:w-auto"
                  // Still pressable when the step is incomplete, so the press can
                  // say what is missing; it only looks unavailable.
                  aria-disabled={!canContinue || undefined}
                >
                  {t('continue')}
                  <ArrowRight className="ml-1.5 h-4 w-4" aria-hidden="true" />
                </Button>
              )}
            </div>
          </div>
        </form>

        {/* Only beside the form: on a phone or a tablet it would sit below the
            buttons, a long scroll away from the choices it follows. */}
        <div className="hidden min-w-0 lg:block lg:max-w-[500px] lg:flex-[1_1_400px] xl:basis-[500px]">
          <SetupPreview
            draft={draft}
            caption={step === 'workshop' ? t('preview.first') : t('preview.live')}
          />
        </div>
      </div>
    </div>
  )
}
