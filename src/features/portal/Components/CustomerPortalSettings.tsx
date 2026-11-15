'use client'

import {
  Bell,
  Check,
  Clock,
  Copy,
  ExternalLink,
  Globe,
  ImagePlus,
  Loader2,
  Palette,
  SlidersHorizontal,
  Trash2,
} from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { ReadOnlyBanner, ReadOnlyWrapper } from '@/app/(authenticated)/settings/read-only-guard'
import { useSettingsPermission } from '@/app/(authenticated)/settings/settings-permission-context'
import { AppCard } from '@/components/app-card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { handleGated } from '@/components/upgrade-gate'
import { saveCustomerPortalSettings } from '@/features/portal/Actions/saveCustomerPortalSettings'
import { cn } from '@/lib/utils'
import {
  contrastRatio,
  normalizeAccent,
  ON_ACCENT_LIGHT,
  onAccentFor,
  PORTAL_THEME_ACCENTS,
  PORTAL_THEMES,
  type PortalTheme,
} from '../Lib/theme'
import { checkPortalSlug, type PortalSlugProblem } from '../Schema/customerPortalSettingsSchema'
import { PORTAL_THEME_SURFACES, PortalThemeMiniature } from './PortalThemeMiniature'

/** Everything the page saves, as the form holds it. */
export interface CustomerPortalSettingsValues {
  enabled: boolean
  /** Empty for the default address. */
  slug: string
  description: string
  theme: PortalTheme
  /** "#RRGGBB", or empty for the theme's own colour. While typing: whatever was typed. */
  accent: string
  /** The stored url of the cover photo, or empty for none. */
  cover: string
  messages: boolean
  showTires: boolean
}

const THEME_NAME = {
  daylight: 'theme.daylight.name',
  garage: 'theme.garage.name',
  print: 'theme.print.name',
  colour: 'theme.colour.name',
} as const

const THEME_TAGLINE = {
  daylight: 'theme.daylight.tagline',
  garage: 'theme.garage.tagline',
  print: 'theme.print.tagline',
  colour: 'theme.colour.tagline',
} as const

/** A few colours to start from; any other goes in the hex field. */
const SWATCHES = [
  { hex: '#C2410C', name: 'colour.orange' },
  { hex: '#1D4ED8', name: 'colour.blue' },
  { hex: '#15803D', name: 'colour.green' },
  { hex: '#B91C1C', name: 'colour.red' },
  { hex: '#1C1917', name: 'colour.black' },
] as const

const SLUG_PROBLEM = {
  slugInvalid: 'slugInvalid',
  slugReserved: 'slugReserved',
  slugTaken: 'slugTaken',
} as const

/** Below this a colour is hard to tell from the page it sits on (WCAG, graphics). */
const FAINT_BELOW = 3

/** The values as they would be stored, so "changed" means changed for real. */
function stored(values: CustomerPortalSettingsValues): CustomerPortalSettingsValues {
  return {
    ...values,
    slug: values.slug.trim(),
    accent: normalizeAccent(values.accent) ?? values.accent.trim(),
  }
}

function sameValues(a: CustomerPortalSettingsValues, b: CustomerPortalSettingsValues): boolean {
  const left = stored(a)
  const right = stored(b)
  return (Object.keys(left) as (keyof CustomerPortalSettingsValues)[]).every(
    (key) => left[key] === right[key]
  )
}

/**
 * The Customer Portal settings: one form, one Save.
 *
 * Nothing is written until Save is pressed, and Save writes all of it at
 * once (`saveCustomerPortalSettings`), so a customer never meets half a
 * change. The bar at the bottom says whether there is anything to save.
 */
export function CustomerPortalSettings({
  orgId,
  appUrl,
  initial,
  tireHotel,
  typedHours,
}: {
  orgId: string
  appUrl: string
  /** What is stored now. A workshop that never chose gets Daylight. */
  initial: CustomerPortalSettingsValues
  /** The workshop runs a tyre hotel: only then is the tyres switch offered. */
  tireHotel: boolean
  /**
   * Hours typed on the old version of this page that the sign-in page still
   * shows, because the workshop has not set its hours in the calendar. Null
   * when the portal reads the calendar.
   */
  typedHours: string | null
}) {
  const router = useRouter()
  const t = useTranslations('settings.customerPortal')
  const tp = useTranslations('settings.portal')
  const { canEdit } = useSettingsPermission()

  const [saved, setSaved] = useState(initial)
  const [values, setValues] = useState(initial)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [copied, setCopied] = useState(false)
  const [slugProblem, setSlugProblem] = useState<PortalSlugProblem | null>(null)
  const slugInput = useRef<HTMLInputElement>(null)
  const hexInput = useRef<HTMLInputElement>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  const set = <K extends keyof CustomerPortalSettingsValues>(
    key: K,
    value: CustomerPortalSettingsValues[K]
  ) => setValues((current) => ({ ...current, [key]: value }))

  const dirty = !sameValues(values, saved)

  // Closing the tab over unsaved changes asks first.
  useEffect(() => {
    if (!dirty) return
    const warn = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  const themeName = t(THEME_NAME[values.theme])
  const themeAccent = PORTAL_THEME_ACCENTS[values.theme]
  const typedAccent = values.accent.trim()
  const chosenAccent = normalizeAccent(typedAccent)
  const accentInvalid = typedAccent !== '' && chosenAccent === null
  const accent = chosenAccent ?? themeAccent
  const onAccent = onAccentFor(accent)
  const faint = contrastRatio(accent, PORTAL_THEME_SURFACES[values.theme].background) < FAINT_BELOW

  const portalUrl = `${appUrl}/portal/${values.slug.trim() || orgId}`
  const livePortalUrl = `${appUrl}/portal/${saved.slug || orgId}`
  const slugChanged = values.slug.trim() !== saved.slug

  const copyUrl = async () => {
    await navigator.clipboard.writeText(portalUrl)
    setCopied(true)
    toast.success(tp('urlCopied'))
    setTimeout(() => setCopied(false), 2000)
  }

  const uploadCover = async (file: File) => {
    setUploading(true)
    try {
      const body = new FormData()
      body.append('file', file)
      const response = await fetch('/api/protected/upload/portal-background', {
        method: 'POST',
        body,
      })
      const answer = (await response.json().catch(() => null)) as {
        url?: string
        error?: string
      } | null
      if (!response.ok || !answer?.url) {
        toast.error(answer?.error ?? t('cover.uploadFailed'))
        return
      }
      // Kept in the form until Save: the photo a customer sees changes then.
      set('cover', answer.url)
    } catch {
      toast.error(t('cover.uploadFailed'))
    } finally {
      setUploading(false)
      if (fileInput.current) fileInput.current.value = ''
    }
  }

  const discard = () => {
    setValues(saved)
    setSlugProblem(null)
  }

  const save = async () => {
    if (accentInvalid) {
      toast.error(t('colour.invalid'))
      hexInput.current?.focus()
      return
    }
    const address = checkPortalSlug(values.slug)
    if (address.problem) {
      setSlugProblem(address.problem)
      slugInput.current?.focus()
      return
    }

    const next = stored(values)
    setSaving(true)
    try {
      const result = await saveCustomerPortalSettings({
        enabled: next.enabled,
        slug: next.slug,
        description: next.description,
        theme: next.theme,
        accent: next.accent,
        cover: next.cover,
        messages: next.messages,
        // Not this page's to change for a workshop without the tyre hotel.
        showTires: tireHotel ? next.showTires : undefined,
      })
      if (!result.success || !result.data) {
        if (!handleGated(result)) toast.error(result.error ?? tp('failedUpdate'))
        return
      }
      if (!result.data.saved) {
        setSlugProblem(result.data.problem)
        slugInput.current?.focus()
        return
      }
      const now = { ...next, slug: result.data.slug ?? '' }
      setSaved(now)
      setValues(now)
      setSlugProblem(null)
      toast.success(t('savedToast'))
      router.refresh()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <ReadOnlyBanner />
      <ReadOnlyWrapper>
        <div className="space-y-6">
          <AppCard icon={Globe} title={tp('title')} contentClassName="space-y-6">
            <p className="text-sm text-muted-foreground">{tp('description')}</p>
            <div className="flex items-center justify-between gap-4">
              <div className="space-y-0.5">
                <Label htmlFor="portal-enabled">{tp('enablePortal')}</Label>
                <p className="text-xs text-muted-foreground">{tp('enablePortalHint')}</p>
              </div>
              <Switch
                id="portal-enabled"
                checked={values.enabled}
                onCheckedChange={(checked) => set('enabled', checked)}
              />
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="portal-slug">{tp('customSlug')}</Label>
                <Input
                  id="portal-slug"
                  ref={slugInput}
                  value={values.slug}
                  onChange={(event) => {
                    set('slug', event.target.value.toLowerCase().replace(/\s/g, ''))
                    setSlugProblem(null)
                  }}
                  placeholder={t('slugPlaceholder')}
                  className="font-mono text-sm"
                  autoComplete="off"
                  spellCheck={false}
                  aria-invalid={slugProblem ? true : undefined}
                  aria-describedby="portal-slug-note"
                />
                {slugProblem ? (
                  <p id="portal-slug-note" role="alert" className="text-xs text-destructive">
                    {t(SLUG_PROBLEM[slugProblem])}
                  </p>
                ) : (
                  <p id="portal-slug-note" className="text-xs text-muted-foreground">
                    {tp('slugHint')}
                  </p>
                )}
              </div>

              <div id="customer-portal-url" className="space-y-2">
                <Label htmlFor="portal-url">{tp('portalUrl')}</Label>
                <div className="flex gap-2">
                  <Input id="portal-url" value={portalUrl} readOnly className="font-mono text-sm" />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={copyUrl}
                    aria-label={tp('copyUrl')}
                  >
                    {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  {slugChanged ? t('slugUnsaved') : tp('shareHint')}
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="portal-description">{tp('descriptionLabel')}</Label>
              <Textarea
                id="portal-description"
                value={values.description}
                onChange={(event) => set('description', event.target.value)}
                placeholder={tp('descriptionPlaceholder')}
                rows={4}
                maxLength={5000}
              />
              <p className="text-xs text-muted-foreground">{tp('descriptionHint')}</p>
            </div>

            <div className="grid gap-3 lg:grid-cols-2">
              <div
                id="customer-portal-hours"
                className="flex items-start gap-2 rounded-md border bg-muted/40 p-3"
              >
                <Clock className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 space-y-2 text-xs text-muted-foreground">
                  <p>
                    {typedHours ? t('hours.typedNote') : t('hours.fromCalendar')}{' '}
                    <Link href="/settings/opening-hours" className="text-primary hover:underline">
                      {t('hours.link')}
                    </Link>
                  </p>
                  {typedHours ? (
                    <div>
                      <p className="font-medium text-foreground">{t('hours.typedLabel')}</p>
                      <p className="whitespace-pre-line">{typedHours}</p>
                    </div>
                  ) : null}
                </div>
              </div>

              {/* Requests are sent from the portal, but the alert that
                  announces them is set up on another page. */}
              <div
                id="customer-portal-request-alerts"
                className="flex items-start gap-2 rounded-md border bg-muted/40 p-3"
              >
                <Bell className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <p className="text-xs text-muted-foreground">
                  {tp('serviceRequestAlertsHint')}{' '}
                  <Link href="/settings/alerts" className="text-primary hover:underline">
                    {tp('serviceRequestAlertsLink')}
                  </Link>
                </p>
              </div>
            </div>
          </AppCard>

          <AppCard icon={Palette} title={t('look.title')} contentClassName="space-y-6">
            <p className="text-sm text-muted-foreground">{t('look.description')}</p>
            <fieldset id="customer-portal-theme" className="m-0 min-w-0 border-0 p-0">
              <legend className="mb-3 p-0 text-sm font-medium">{t('theme.legend')}</legend>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {PORTAL_THEMES.map((id) => {
                  const tileAccent = chosenAccent ?? PORTAL_THEME_ACCENTS[id]
                  const selected = values.theme === id
                  return (
                    <label
                      key={id}
                      className={cn(
                        'flex cursor-pointer flex-col gap-2.5 rounded-xl border-2 bg-card p-2.5 transition-colors',
                        'has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring/50',
                        selected ? 'border-primary' : 'border-border hover:border-primary/40'
                      )}
                    >
                      <PortalThemeMiniature
                        theme={id}
                        accent={tileAccent}
                        onAccent={onAccentFor(tileAccent)}
                      />
                      <span className="flex min-h-11 items-center gap-2.5 px-1">
                        <input
                          type="radio"
                          name="portal-theme"
                          value={id}
                          checked={selected}
                          onChange={() => set('theme', id)}
                          className="size-4 shrink-0 accent-primary"
                        />
                        <span className="min-w-0">
                          <span className="block text-sm font-semibold">{t(THEME_NAME[id])}</span>
                          <span className="block text-xs text-muted-foreground">
                            {t(THEME_TAGLINE[id])}
                          </span>
                        </span>
                      </span>
                    </label>
                  )
                })}
              </div>
            </fieldset>

            <div className="grid gap-4 lg:grid-cols-2">
              <section
                id="customer-portal-colour"
                aria-labelledby="customer-portal-colour-title"
                className="space-y-3 rounded-lg border p-4"
              >
                <div>
                  <h3 id="customer-portal-colour-title" className="text-sm font-medium">
                    {t('colour.title')}
                  </h3>
                  <p className="mt-1 text-xs text-muted-foreground">{t('colour.description')}</p>
                </div>

                <div className="flex flex-wrap items-center gap-2.5">
                  <div
                    role="group"
                    aria-label={t('colour.swatches')}
                    className="flex flex-wrap items-center gap-2.5"
                  >
                    {SWATCHES.map((swatch) => {
                      const pressed = chosenAccent === swatch.hex
                      return (
                        <button
                          key={swatch.hex}
                          type="button"
                          aria-label={t(swatch.name)}
                          aria-pressed={pressed}
                          onClick={() => set('accent', swatch.hex)}
                          className={cn(
                            'size-9 rounded-full border-2 border-background outline-none transition-shadow',
                            'focus-visible:ring-[3px] focus-visible:ring-ring/50',
                            pressed ? 'ring-2 ring-foreground' : 'ring-1 ring-border'
                          )}
                          style={{ background: swatch.hex }}
                        />
                      )
                    })}
                  </div>
                  <Label htmlFor="portal-accent" className="sr-only">
                    {t('colour.hexLabel')}
                  </Label>
                  <Input
                    id="portal-accent"
                    ref={hexInput}
                    value={values.accent}
                    onChange={(event) => set('accent', event.target.value)}
                    placeholder={themeAccent}
                    className="h-9 w-28 font-mono text-sm"
                    maxLength={7}
                    autoComplete="off"
                    spellCheck={false}
                    aria-invalid={accentInvalid ? true : undefined}
                    aria-describedby="portal-accent-note"
                  />
                </div>

                <div id="portal-accent-note" className="space-y-2 text-xs">
                  {accentInvalid ? (
                    <p role="alert" className="text-destructive">
                      {t('colour.invalid')}
                    </p>
                  ) : (
                    <>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                        <span
                          className="inline-flex h-8 items-center rounded-md px-3 text-xs font-semibold"
                          style={{ background: accent, color: onAccent }}
                        >
                          {t('colour.sample')}
                        </span>
                        <p className="min-w-0 flex-1 text-muted-foreground">
                          {onAccent === ON_ACCENT_LIGHT
                            ? t('colour.inkLight')
                            : t('colour.inkDark')}
                        </p>
                      </div>
                      {faint ? (
                        <p className="text-amber-600">{t('colour.faint', { theme: themeName })}</p>
                      ) : null}
                    </>
                  )}
                  {chosenAccent === null && !accentInvalid ? (
                    <p className="text-muted-foreground">
                      {t('colour.usingTheme', { theme: themeName, hex: themeAccent })}
                    </p>
                  ) : (
                    <p className="text-muted-foreground">
                      {t('colour.themeColour', { theme: themeName, hex: themeAccent })}{' '}
                      <button
                        type="button"
                        onClick={() => set('accent', '')}
                        className="font-medium text-primary hover:underline"
                      >
                        {t('colour.useTheme')}
                      </button>
                    </p>
                  )}
                </div>
              </section>

              <section
                id="customer-portal-cover"
                aria-labelledby="customer-portal-cover-title"
                className="flex flex-col gap-4 rounded-lg border p-4 sm:flex-row sm:items-center"
              >
                {values.cover ? (
                  <img
                    src={values.cover}
                    alt={t('cover.alt')}
                    className="h-28 w-full shrink-0 rounded-md border object-cover sm:w-40"
                  />
                ) : (
                  <div className="flex h-28 w-full shrink-0 items-center justify-center rounded-md border border-dashed bg-muted/40 text-xs text-muted-foreground sm:w-40">
                    {t('cover.none')}
                  </div>
                )}
                <div className="min-w-0 space-y-3">
                  <div>
                    <h3 id="customer-portal-cover-title" className="text-sm font-medium">
                      {t('cover.title')}
                    </h3>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {t('cover.description')}{' '}
                      <Link href="/settings/company" className="text-primary hover:underline">
                        {t('cover.companyLink')}
                      </Link>
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <input
                      ref={fileInput}
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      className="sr-only"
                      tabIndex={-1}
                      aria-hidden="true"
                      onChange={(event) => {
                        const file = event.target.files?.[0]
                        if (file) void uploadCover(file)
                      }}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={uploading}
                      onClick={() => fileInput.current?.click()}
                    >
                      {uploading ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <ImagePlus className="mr-2 h-4 w-4" />
                      )}
                      {uploading
                        ? t('cover.uploading')
                        : values.cover
                          ? t('cover.replace')
                          : t('cover.upload')}
                    </Button>
                    {values.cover ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => set('cover', '')}
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        {t('cover.remove')}
                      </Button>
                    ) : null}
                  </div>
                  <p className="text-xs text-muted-foreground">{t('cover.hint')}</p>
                </div>
              </section>
            </div>
          </AppCard>

          <AppCard
            icon={SlidersHorizontal}
            title={t('features.title')}
            description={t('features.description')}
            contentClassName="divide-y py-0"
          >
            <div className="flex items-center justify-between gap-4 py-4">
              <div className="space-y-0.5">
                <Label htmlFor="portal-messages">{t('features.messages')}</Label>
                <p className="text-xs text-muted-foreground">{t('features.messagesHint')}</p>
              </div>
              <Switch
                id="portal-messages"
                checked={values.messages}
                onCheckedChange={(checked) => set('messages', checked)}
              />
            </div>
            {tireHotel ? (
              <div className="flex items-center justify-between gap-4 py-4">
                <div className="space-y-0.5">
                  <Label htmlFor="portal-show-tires">{t('features.tires')}</Label>
                  <p className="text-xs text-muted-foreground">{t('features.tiresHint')}</p>
                </div>
                <Switch
                  id="portal-show-tires"
                  checked={values.showTires}
                  onCheckedChange={(checked) => set('showTires', checked)}
                />
              </div>
            ) : null}
          </AppCard>
        </div>
      </ReadOnlyWrapper>

      <section
        aria-label={t('bar.label')}
        className="sticky bottom-0 z-10 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border bg-card px-4 py-3 shadow-lg"
      >
        <p
          role="status"
          className="flex min-w-0 flex-1 basis-52 items-center gap-2 text-sm text-muted-foreground"
        >
          {canEdit ? (
            <>
              <span
                aria-hidden="true"
                className={cn(
                  'size-2 shrink-0 rounded-full',
                  dirty ? 'bg-primary' : 'bg-muted-foreground/40'
                )}
              />
              {dirty ? t('bar.unsaved') : t('bar.saved')}
            </>
          ) : null}
        </p>
        {saved.enabled ? (
          <Button asChild variant="outline" size="sm">
            <a href={livePortalUrl} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="mr-2 h-4 w-4" />
              {t('bar.open')}
            </a>
          </Button>
        ) : (
          <Button type="button" variant="outline" size="sm" disabled title={t('bar.openOff')}>
            <ExternalLink className="mr-2 h-4 w-4" />
            {t('bar.open')}
          </Button>
        )}
        {canEdit ? (
          <>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={discard}
              disabled={!dirty || saving}
            >
              {t('bar.discard')}
            </Button>
            <Button
              data-save-shortcut
              type="button"
              size="sm"
              onClick={save}
              disabled={!dirty || saving || uploading}
            >
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {t('bar.save')}
            </Button>
          </>
        ) : null}
      </section>
    </div>
  )
}
