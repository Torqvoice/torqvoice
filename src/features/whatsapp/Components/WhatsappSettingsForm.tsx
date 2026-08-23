'use client'

import { useMemo, useRef, useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { AppCard } from '@/components/app-card'
import { DocsLink } from '@/components/docs-link'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  Stepper,
  StepperIndicator,
  StepperItem,
  StepperSeparator,
  StepperTitle,
  StepperTrigger,
} from '@/components/ui/stepper'
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Copy,
  ExternalLink,
  Eye,
  EyeOff,
  Info,
  Loader2,
  RefreshCw,
} from 'lucide-react'
import {
  ReadOnlyBanner,
  ReadOnlyWrapper,
  SaveButton,
} from '@/app/(authenticated)/settings/read-only-guard'
import { TemplateSetupFields } from './TemplateSetupFields'
import { SECRET_MASK } from '../Schema/whatsappSettingsSchema'
import {
  disconnectWhatsapp,
  registerWhatsappNumber,
  saveWhatsappSettings,
  sendWhatsappTestMessage,
  type WhatsappSettingsView,
} from '../Actions/whatsappSettingsActions'

/**
 * WhatsApp setup, one step at a time.
 *
 * The order is imposed by the providers, not chosen by us: a webhook can only
 * be verified once its settings are stored, and Meta hands out a phone number
 * ID only after that verification. As a single form that was invisible, so
 * people saved a half-filled page unsure whether they had gone about it in the
 * wrong order or hit a bug.
 *
 * Which step is on screen is a cursor; whether a step is done is read from
 * what is actually stored, so coming back next week shows real progress rather
 * than a wizard reset to the beginning.
 */
export function WhatsappSettingsForm({ initial }: { initial: WhatsappSettingsView }) {
  const t = useTranslations('whatsapp.settings')
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const [enabled, setEnabled] = useState(initial.enabled)
  const [providerId, setProviderId] = useState(initial.provider ?? initial.providers[0]?.id ?? '')
  const [from, setFrom] = useState(initial.from)
  const [templates, setTemplates] = useState(initial.templates)
  const [credentials, setCredentials] = useState(initial.credentials)
  const [revealed, setRevealed] = useState<Record<string, boolean>>({})
  const [missing, setMissing] = useState<string[]>([])
  const [copied, setCopied] = useState(false)
  const [testNumber, setTestNumber] = useState('')
  const [registrationPin, setRegistrationPin] = useState('')
  const [webhookUrls, setWebhookUrls] = useState(initial.webhookUrls)
  const [current, setCurrent] = useState(1)

  const provider = useMemo(
    () => initial.providers.find((option) => option.id === providerId) ?? null,
    [initial.providers, providerId]
  )
  const webhookUrl = webhookUrls[providerId] ?? ''
  const blankTemplate = { name: '', language: '', variables: '' }
  const template = templates[providerId]?.text ?? blankTemplate
  const mediaTemplate = templates[providerId]?.media ?? blankTemplate

  const setTemplate = (
    kind: 'text' | 'media',
    field: keyof typeof blankTemplate,
    value: string
  ) => {
    setTemplates((previous) => ({
      ...previous,
      [providerId]: {
        text: previous[providerId]?.text ?? blankTemplate,
        media: previous[providerId]?.media ?? blankTemplate,
        [kind]: { ...(previous[providerId]?.[kind] ?? blankTemplate), [field]: value },
      },
    }))
  }

  const credentialsDone = Boolean(
    provider?.credentials
      .filter((field) => field.required)
      .every((field) => (credentials[providerId]?.[field.key] ?? '').trim())
  )

  const stepList = [
    { step: 1, key: 'provider', done: Boolean(providerId && from.trim()) },
    { step: 2, key: 'credentials', done: credentialsDone },
    { step: 3, key: 'webhook', done: Boolean(initial.webhookSeenAt) },
    { step: 4, key: 'templates', done: Boolean(template.name || mediaTemplate.name) },
    { step: 5, key: 'test', done: initial.hasMessages },
  ] as const
  const lastStep = stepList.length

  const setCredential = (field: string, value: string) => {
    setMissing((previous) => previous.filter((key) => key !== field))
    setCredentials((previous) => ({
      ...previous,
      [providerId]: { ...(previous[providerId] ?? {}), [field]: value },
    }))
  }

  // Which secrets already exist on the server, so an emptied field knows
  // whether putting the mask back means "keep what is stored" or nothing.
  const storedSecrets = useRef(
    new Set(
      Object.entries(initial.credentials).flatMap(([provider, fields]) =>
        Object.entries(fields)
          .filter(([, value]) => value === SECRET_MASK)
          .map(([field]) => `${provider}.${field}`)
      )
    )
  )

  const save = (then?: () => void) => {
    if (!provider) return
    startTransition(async () => {
      const result = await saveWhatsappSettings({
        enabled,
        provider: provider.id,
        from,
        templateName: template.name,
        templateLanguage: template.language,
        templateVariables: template.variables,
        mediaTemplateName: mediaTemplate.name,
        mediaTemplateLanguage: mediaTemplate.language,
        mediaTemplateVariables: mediaTemplate.variables,
        credentials: credentials[provider.id] ?? {},
      })

      if (!result.success) {
        toast.error(result.error ?? t('saveError'))
        return
      }

      const savedWebhookUrl = result.data?.webhookUrl
      if (savedWebhookUrl) {
        setWebhookUrls((previous) => ({ ...previous, [provider.id]: savedWebhookUrl }))
      }

      // Half-finished is a normal state here, so it is reported rather than
      // refused, and marked on the fields it concerns.
      const stillNeeded = result.data?.missing ?? []
      setMissing(
        provider.credentials
          .filter((field) => stillNeeded.includes(field.label))
          .map((field) => field.key)
      )
      if (stillNeeded.length > 0) {
        toast.warning(t('savedIncomplete', { fields: stillNeeded.join(', ') }))
      } else {
        toast.success(t('saved'))
      }

      then?.()
      router.refresh()
    })
  }

  const copyWebhook = () => {
    if (!webhookUrl) return
    navigator.clipboard.writeText(webhookUrl)
    setCopied(true)
    toast.success(t('webhook.copied'))
    setTimeout(() => setCopied(false), 2000)
  }

  const sendTest = () => {
    if (!testNumber.trim()) return
    startTransition(async () => {
      const result = await sendWhatsappTestMessage(testNumber.trim())
      if (result.success) {
        toast.success(t('test.sent'))
        router.refresh()
      } else {
        toast.error(result.error ?? t('test.failed'))
      }
    })
  }

  const register = () => {
    startTransition(async () => {
      const result = await registerWhatsappNumber(registrationPin.trim())
      if (result.success) {
        toast.success(t('register.done'))
        setRegistrationPin('')
      } else {
        toast.error(result.error ?? t('register.failed'))
      }
    })
  }

  const openProvider = (href: string, label: string) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 text-sm font-medium text-primary underline underline-offset-4 hover:no-underline"
    >
      {label}
      <ExternalLink className="h-3 w-3" />
    </a>
  )

  /** Saves, then moves on. Steps that only read data skip the save. */
  const continueButton = (options?: { save?: boolean }) => (
    <Button
      type="button"
      onClick={() =>
        options?.save === false
          ? setCurrent((step) => Math.min(step + 1, lastStep))
          : save(() => setCurrent((step) => Math.min(step + 1, lastStep)))
      }
      disabled={isPending}
    >
      {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
      {t('steps.continue')}
      <ArrowRight className="ml-1.5 h-4 w-4" />
    </Button>
  )

  const step = stepList.find((entry) => entry.step === current)

  return (
    <div className="space-y-6">
      <ReadOnlyBanner />
      <ReadOnlyWrapper>
        <AppCard
          title={t('title')}
          description={t('description')}
          action={<DocsLink href="/docs/integrations/whatsapp" variant="header" />}
          contentClassName="space-y-6"
        >
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="enable-whatsapp">{t('enable.label')}</Label>
              <p className="text-xs text-muted-foreground">{t('enable.hint')}</p>
            </div>
            <Switch id="enable-whatsapp" checked={enabled} onCheckedChange={setEnabled} />
          </div>

          {!enabled ? (
            <div className="flex items-start gap-3 rounded-lg border bg-muted/50 p-4">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">{t('enable.disabledInfo')}</p>
            </div>
          ) : (
            <>
              <Stepper value={current} onValueChange={setCurrent}>
                {stepList.map((entry) => (
                  <StepperItem
                    key={entry.step}
                    step={entry.step}
                    completed={entry.done}
                    attention={!entry.done}
                  >
                    <StepperTrigger>
                      <StepperIndicator>
                        {entry.done ? <Check className="h-4 w-4" /> : entry.step}
                      </StepperIndicator>
                      <StepperTitle
                        className={
                          entry.done
                            ? 'hidden lg:block'
                            : 'hidden font-medium text-amber-700 lg:block dark:text-amber-300'
                        }
                      >
                        {t(`steps.${entry.key}.title`)}
                      </StepperTitle>
                    </StepperTrigger>
                    {entry.step < lastStep && <StepperSeparator />}
                  </StepperItem>
                ))}
              </Stepper>

              <div className="rounded-lg border p-4">
                <div className="space-y-1">
                  <p className="text-sm font-medium">{t(`steps.${step?.key}.title`)}</p>
                  <p className="text-xs text-muted-foreground">
                    {current === 2 || current === 3
                      ? t(`steps.${step?.key}.description`, { provider: provider?.label ?? '' })
                      : t(`steps.${step?.key}.description`)}
                  </p>
                </div>

                <div className="mt-4 space-y-4">
                  {current === 1 && (
                    <div className="space-y-4">
                      {/* A row rather than a dropdown, the way the SMS page
                          offers its providers: two choices are worth showing,
                          not hiding behind a click. */}
                      <div className="space-y-2">
                        <Label>{t('provider.label')}</Label>
                        <div className="flex flex-wrap gap-2">
                          {initial.providers.map((option) => (
                            <Button
                              key={option.id}
                              type="button"
                              variant={providerId === option.id ? 'default' : 'outline'}
                              onClick={() => setProviderId(option.id)}
                              className="flex-1"
                            >
                              {option.label}
                            </Button>
                          ))}
                        </div>
                        <p className="text-xs text-muted-foreground">{t('provider.hint')}</p>
                      </div>

                      <div className="space-y-2 md:max-w-sm">
                        <Label htmlFor="whatsapp-from">{t('from.label')}</Label>
                        <Input
                          id="whatsapp-from"
                          name="whatsapp-from"
                          value={from}
                          onChange={(event) => setFrom(event.target.value)}
                          placeholder="+49 151 12345678"
                          autoComplete="off"
                          data-1p-ignore
                          data-lpignore="true"
                        />
                        <p className="text-xs text-muted-foreground">{t('from.hint')}</p>
                      </div>
                    </div>
                  )}

                  {/* Meta's pages hang off an app id we never collect, so the
                      button below reaches the app list and no further. The
                      rest of the way is written out. */}
                  {current === 2 && provider?.setup.credentialsPath && (
                    <p className="rounded-lg bg-muted/40 p-3 text-xs text-muted-foreground">
                      {t('steps.consolePath')}{' '}
                      <span className="font-medium text-foreground">
                        {provider.setup.credentialsPath}
                      </span>
                    </p>
                  )}

                  {current === 2 && provider && (
                    <div className="grid gap-4 md:grid-cols-2">
                      {provider.credentials.map((field) => {
                        const value = credentials[provider.id]?.[field.key] ?? ''
                        const isRevealed = revealed[field.key] ?? false
                        const isMissing = missing.includes(field.key)
                        // A saved secret is only ever a mask here: the real
                        // value stays on the server, so there is nothing an
                        // eye could reveal until a new one is typed.
                        const isStoredSecret = field.secret && value === SECRET_MASK
                        return (
                          <div key={field.key} className="space-y-2">
                            <Label htmlFor={`whatsapp-${field.key}`}>
                              {field.label}
                              {field.required && ' *'}
                            </Label>
                            <div className="flex items-center gap-2">
                              <Input
                                id={`whatsapp-${field.key}`}
                                name={`whatsapp-${field.key}`}
                                // Never type="password": see .masked-value.
                                type="text"
                                value={value}
                                placeholder={field.placeholder}
                                // These are provider credentials, not the
                                // user's own login: a masked field otherwise
                                // invites a saved email into the one above it.
                                autoComplete={field.secret ? 'new-password' : 'off'}
                                data-1p-ignore
                                data-lpignore="true"
                                aria-invalid={isMissing}
                                className={cn(
                                  field.secret && !isRevealed && !isStoredSecret && 'masked-value',
                                  isMissing && 'border-amber-500'
                                )}
                                onChange={(event) => setCredential(field.key, event.target.value)}
                                // Clicking into a saved secret empties it, so
                                // a paste cannot land after the mask and be
                                // saved as mask plus token. Leaving without
                                // typing puts the mask back and keeps the
                                // stored value.
                                onFocus={() => {
                                  if (isStoredSecret) setCredential(field.key, '')
                                }}
                                onBlur={() => {
                                  if (
                                    value === '' &&
                                    storedSecrets.current.has(`${providerId}.${field.key}`)
                                  ) {
                                    setCredential(field.key, SECRET_MASK)
                                  }
                                }}
                              />
                              {field.secret && !isStoredSecret && (
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="icon"
                                  onClick={() =>
                                    setRevealed((previous) => ({
                                      ...previous,
                                      [field.key]: !isRevealed,
                                    }))
                                  }
                                  aria-label={isRevealed ? t('secret.hide') : t('secret.show')}
                                >
                                  {isRevealed ? (
                                    <EyeOff className="h-4 w-4" />
                                  ) : (
                                    <Eye className="h-4 w-4" />
                                  )}
                                </Button>
                              )}
                            </div>
                            {isMissing ? (
                              <p className="text-xs font-medium text-amber-700 dark:text-amber-400">
                                {t('fieldStillNeeded')}
                              </p>
                            ) : isStoredSecret ? (
                              <p className="text-xs text-muted-foreground">{t('secret.stored')}</p>
                            ) : (
                              field.help && (
                                <p className="text-xs text-muted-foreground">{field.help}</p>
                              )
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}

                  {current === 2 && provider?.supportsRegistration && (
                    <div className="space-y-2 rounded-lg border border-dashed p-4">
                      <p className="text-sm font-medium">{t('register.title')}</p>
                      <p className="text-xs text-muted-foreground">{t('register.description')}</p>
                      <div className="flex flex-wrap items-center gap-2">
                        <Input
                          value={registrationPin}
                          onChange={(event) => setRegistrationPin(event.target.value)}
                          placeholder="123456"
                          inputMode="numeric"
                          autoComplete="off"
                          data-1p-ignore
                          data-lpignore="true"
                          maxLength={6}
                          className="w-32 font-mono"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          onClick={register}
                          disabled={isPending || registrationPin.trim().length !== 6}
                        >
                          {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                          {t('register.action')}
                        </Button>
                      </div>
                      <p className="text-xs text-amber-600">{t('register.limit')}</p>
                    </div>
                  )}

                  {current === 3 && (
                    <>
                      {provider?.setup.webhookPath && (
                        <p className="rounded-lg bg-muted/40 p-3 text-xs text-muted-foreground">
                          {t('steps.consolePath')}{' '}
                          <span className="font-medium text-foreground">
                            {provider.setup.webhookPath}
                          </span>
                        </p>
                      )}
                      <div className="space-y-2">
                        <Label>{t('webhook.label')}</Label>
                        <div className="flex items-center gap-2">
                          <Input readOnly value={webhookUrl} className="font-mono text-xs" />
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            onClick={copyWebhook}
                            aria-label={t('webhook.copy')}
                          >
                            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                          </Button>
                        </div>
                        <p className="text-xs text-muted-foreground">{t('webhook.description')}</p>
                        <p className="text-xs text-muted-foreground">{t('webhook.saveFirst')}</p>
                      </div>

                      <div
                        className={
                          initial.webhookSeenAt
                            ? 'rounded-lg border border-dashed bg-muted/30 p-3 text-xs text-muted-foreground'
                            : 'rounded-lg border border-dashed border-amber-500/60 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-400'
                        }
                      >
                        {initial.webhookSeenAt
                          ? t('steps.webhook.seen')
                          : t('steps.webhook.waiting')}
                      </div>
                    </>
                  )}

                  {current === 4 && (
                    <>
                      <div className="flex items-start gap-3 rounded-lg border bg-muted/50 p-4">
                        <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                        <div className="space-y-2 text-sm text-muted-foreground">
                          <p>{t('template.windowExplainer')}</p>
                          <p>{t('template.whatIsIt', { provider: provider?.label ?? '' })}</p>
                          <p>{t('template.whyTwo')}</p>
                          <DocsLink href="/docs/integrations/whatsapp" variant="hint" />
                        </div>
                      </div>

                      <TemplateSetupFields
                        kind="text"
                        provider={provider}
                        name={template.name}
                        onName={(value) => setTemplate('text', 'name', value)}
                        language={template.language}
                        onLanguage={(value) => setTemplate('text', 'language', value)}
                        variables={template.variables}
                        onVariables={(value) => setTemplate('text', 'variables', value)}
                      />

                      <TemplateSetupFields
                        kind="media"
                        provider={provider}
                        name={mediaTemplate.name}
                        onName={(value) => setTemplate('media', 'name', value)}
                        language={mediaTemplate.language}
                        onLanguage={(value) => setTemplate('media', 'language', value)}
                        variables={mediaTemplate.variables}
                        onVariables={(value) => setTemplate('media', 'variables', value)}
                        mediaUrlPrefix={initial.mediaUrlPrefix}
                      />
                    </>
                  )}

                  {current === 5 && (
                    <>
                      <Input
                        value={testNumber}
                        onChange={(event) => setTestNumber(event.target.value)}
                        placeholder="+49 151 12345678"
                        autoComplete="off"
                        data-1p-ignore
                        data-lpignore="true"
                      />
                      <p className="text-xs text-muted-foreground">{t('test.hint')}</p>
                    </>
                  )}
                </div>

                <div className="mt-6 flex flex-wrap items-center justify-between gap-2 border-t pt-4">
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => setCurrent((value) => Math.max(value - 1, 1))}
                    disabled={current === 1}
                  >
                    <ArrowLeft className="mr-1.5 h-4 w-4" />
                    {t('steps.back')}
                  </Button>

                  <div className="flex flex-wrap items-center gap-2">
                    {/* This step asks for the sending number, which on some
                        providers is a sender set up in their console. */}
                    {current === 1 &&
                      provider?.setup.number &&
                      openProvider(provider.setup.number, t('steps.openNumber'))}
                    {current === 2 && provider && (
                      <>
                        {openProvider(
                          provider.setup.credentials,
                          t('steps.openProvider', { provider: provider.label })
                        )}
                        {/* The token that lasts is minted somewhere else
                            entirely, which is where this step stalls. */}
                        {provider.setup.token &&
                          openProvider(provider.setup.token, t('steps.openToken'))}
                      </>
                    )}
                    {current === 3 && provider && (
                      <>
                        {openProvider(
                          provider.setup.webhook,
                          t('steps.webhook.open', { provider: provider.label })
                        )}
                        <Button variant="ghost" size="sm" onClick={() => router.refresh()}>
                          <RefreshCw className="mr-1.5 h-3 w-3" />
                          {t('steps.webhook.recheck')}
                        </Button>
                      </>
                    )}
                    {current === 4 &&
                      provider &&
                      openProvider(
                        provider.setup.templates,
                        t('steps.templates.open', { provider: provider.label })
                      )}

                    {current === 5 ? (
                      <>
                        <Button
                          type="button"
                          onClick={sendTest}
                          disabled={isPending || !testNumber.trim() || !credentialsDone}
                        >
                          {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                          {t('test.send')}
                        </Button>
                        <SaveButton>
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => save()}
                            disabled={isPending}
                          >
                            {t('save')}
                          </Button>
                        </SaveButton>
                      </>
                    ) : (
                      <SaveButton>{continueButton({ save: current !== 3 })}</SaveButton>
                    )}
                  </div>
                </div>
              </div>
            </>
          )}
        </AppCard>

        {initial.enabled && (
          <AppCard title={t('disconnect.title')} description={t('disconnect.hint')}>
            <Button
              type="button"
              variant="destructive"
              onClick={() =>
                startTransition(async () => {
                  const result = await disconnectWhatsapp()
                  if (result.success) {
                    toast.success(t('disconnect.done'))
                    router.refresh()
                  } else {
                    toast.error(result.error ?? t('saveError'))
                  }
                })
              }
              disabled={isPending}
            >
              {t('disconnect.action')}
            </Button>
          </AppCard>
        )}
      </ReadOnlyWrapper>
    </div>
  )
}
