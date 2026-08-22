'use client'

import { useMemo, useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { AppCard } from '@/components/app-card'
import { DocsLink } from '@/components/docs-link'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Check, Copy, ExternalLink, Eye, EyeOff, Info, Loader2 } from 'lucide-react'
import {
  ReadOnlyBanner,
  ReadOnlyWrapper,
  SaveButton,
} from '@/app/(authenticated)/settings/read-only-guard'
import { TemplateSetupFields } from './TemplateSetupFields'
import {
  disconnectWhatsapp,
  saveWhatsappSettings,
  sendWhatsappTestMessage,
  type WhatsappSettingsView,
} from '../Actions/whatsappSettingsActions'

/**
 * Settings for whichever WhatsApp provider the workshop picked.
 *
 * The credential fields are not written here: each adapter declares what it
 * needs and this renders that list, so a provider added later shows up with
 * its own fields and help text without touching this file.
 */
export function WhatsappSettingsForm({ initial }: { initial: WhatsappSettingsView }) {
  const t = useTranslations('whatsapp.settings')
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const [enabled, setEnabled] = useState(initial.enabled)
  const [providerId, setProviderId] = useState(initial.provider ?? initial.providers[0]?.id ?? '')
  const [from, setFrom] = useState(initial.from)
  const [templateName, setTemplateName] = useState(initial.templateName)
  const [templateLanguage, setTemplateLanguage] = useState(initial.templateLanguage)
  const [templateVariables, setTemplateVariables] = useState(initial.templateVariables)
  const [mediaTemplateName, setMediaTemplateName] = useState(initial.mediaTemplateName)
  const [mediaTemplateLanguage, setMediaTemplateLanguage] = useState(initial.mediaTemplateLanguage)
  const [mediaTemplateVariables, setMediaTemplateVariables] = useState(
    initial.mediaTemplateVariables
  )
  const [credentials, setCredentials] = useState<Record<string, Record<string, string>>>(
    initial.credentials
  )
  const [revealed, setRevealed] = useState<Record<string, boolean>>({})
  /**
   * Required fields left empty when a save was attempted. A placeholder like
   * "123456789012345" reads as a filled field, so an error naming the field is
   * not enough: the field itself has to say it.
   */
  const [missing, setMissing] = useState<string[]>([])
  const [copied, setCopied] = useState(false)
  const [testNumber, setTestNumber] = useState('')
  const [webhookUrls, setWebhookUrls] = useState(initial.webhookUrls)

  const provider = useMemo(
    () => initial.providers.find((option) => option.id === providerId) ?? null,
    [initial.providers, providerId]
  )

  const setCredential = (field: string, value: string) => {
    setMissing((previous) => previous.filter((key) => key !== field))
    setCredentials((previous) => ({
      ...previous,
      [providerId]: { ...(previous[providerId] ?? {}), [field]: value },
    }))
  }

  const handleSave = () => {
    if (!provider) return

    startTransition(async () => {
      const result = await saveWhatsappSettings({
        enabled,
        provider: provider.id,
        from,
        templateName,
        templateLanguage,
        templateVariables,
        credentials: credentials[provider.id] ?? {},
      })
      if (result.success) {
        // A half-finished setup is a normal state here: a provider issues some
        // credentials only after the webhook it verifies is live.
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
        const savedWebhookUrl = result.data?.webhookUrl
        if (savedWebhookUrl) {
          // Saving may have minted this provider's token for the first time.
          setWebhookUrls((previous) => ({ ...previous, [provider.id]: savedWebhookUrl }))
        }
        router.refresh()
      } else {
        toast.error(result.error ?? t('saveError'))
      }
    })
  }

  const webhookUrl = webhookUrls[providerId]

  const handleCopyWebhook = () => {
    if (!webhookUrl) return
    navigator.clipboard.writeText(webhookUrl)
    setCopied(true)
    toast.success(t('webhook.copied'))
    setTimeout(() => setCopied(false), 2000)
  }

  const handleTest = () => {
    if (!testNumber.trim()) return
    startTransition(async () => {
      const result = await sendWhatsappTestMessage(testNumber.trim())
      if (result.success) toast.success(t('test.sent'))
      else toast.error(result.error ?? t('test.failed'))
    })
  }

  const handleDisconnect = () => {
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

  return (
    <div className="space-y-6">
      <ReadOnlyBanner />
      <ReadOnlyWrapper>
        <AppCard
          title={t('title')}
          description={
            <>
              {t('description')} <DocsLink href="/docs/integrations/whatsapp" variant="hint" />{' '}
              {provider && (
                <a
                  href={provider.docsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
                >
                  {t('helpLink', { provider: provider.label })}
                  <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </>
          }
          contentClassName="space-y-6"
        >
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="enable-whatsapp">{t('enable.label')}</Label>
              <p className="text-xs text-muted-foreground">{t('enable.hint')}</p>
            </div>
            <Switch id="enable-whatsapp" checked={enabled} onCheckedChange={setEnabled} />
          </div>

          {!enabled && (
            <div className="flex items-start gap-3 rounded-lg border bg-muted/50 p-4">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">{t('enable.disabledInfo')}</p>
            </div>
          )}

          {/* A fieldset disables every control inside it, including the ones
              that are buttons rather than inputs. */}
          <fieldset disabled={!enabled} className="space-y-6 disabled:opacity-50">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="whatsapp-provider">{t('provider.label')}</Label>
                <Select value={providerId} onValueChange={setProviderId}>
                  <SelectTrigger id="whatsapp-provider">
                    <SelectValue placeholder={t('provider.placeholder')} />
                  </SelectTrigger>
                  <SelectContent>
                    {initial.providers.map((option) => (
                      <SelectItem key={option.id} value={option.id}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">{t('provider.hint')}</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="whatsapp-from">{t('from.label')}</Label>
                <Input
                  id="whatsapp-from"
                  value={from}
                  onChange={(event) => setFrom(event.target.value)}
                  placeholder="+49 151 12345678"
                />
                <p className="text-xs text-muted-foreground">{t('from.hint')}</p>
              </div>
            </div>

            {provider && (
              <div className="grid gap-4 md:grid-cols-2">
                {provider.credentials.map((field) => {
                  const value = credentials[provider.id]?.[field.key] ?? ''
                  const isRevealed = revealed[field.key] ?? false
                  return (
                    <div key={field.key} className="space-y-2">
                      <Label htmlFor={`whatsapp-${field.key}`}>
                        {field.label}
                        {field.required && ' *'}
                      </Label>
                      <div className="flex items-center gap-2">
                        <Input
                          id={`whatsapp-${field.key}`}
                          type={field.secret && !isRevealed ? 'password' : 'text'}
                          value={value}
                          placeholder={field.placeholder}
                          aria-invalid={missing.includes(field.key)}
                          className={missing.includes(field.key) ? 'border-amber-500' : undefined}
                          onChange={(event) => setCredential(field.key, event.target.value)}
                        />
                        {field.secret && (
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
                      {missing.includes(field.key) ? (
                        <p className="text-xs text-amber-600">{t('fieldStillNeeded')}</p>
                      ) : (
                        field.help && <p className="text-xs text-muted-foreground">{field.help}</p>
                      )}
                    </div>
                  )
                })}
              </div>
            )}

            {webhookUrl && (
              <div className="space-y-2">
                <Label>{t('webhook.label')}</Label>
                <div className="flex items-center gap-2">
                  <Input readOnly value={webhookUrl} className="font-mono text-xs" />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={handleCopyWebhook}
                    aria-label={t('webhook.copy')}
                  >
                    {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">{t('webhook.description')}</p>
                {/* Meta calls this URL to verify it and Torqvoice answers from
                  the stored settings, so an unsaved form fails the check. */}
                <p className="text-xs text-muted-foreground">{t('webhook.saveFirst')}</p>
              </div>
            )}
          </fieldset>
        </AppCard>

        <AppCard
          title={t('template.title')}
          description={t('template.description')}
          contentClassName="space-y-4"
        >
          <div className="flex items-start gap-3 rounded-lg border bg-muted/50 p-4">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">{t('template.windowExplainer')}</p>
          </div>

          <fieldset disabled={!enabled} className="space-y-4 disabled:opacity-50">
            <TemplateSetupFields
              kind="text"
              provider={provider}
              name={templateName}
              onName={setTemplateName}
              language={templateLanguage}
              onLanguage={setTemplateLanguage}
              variables={templateVariables}
              onVariables={setTemplateVariables}
            />

            <TemplateSetupFields
              kind="media"
              provider={provider}
              name={mediaTemplateName}
              onName={setMediaTemplateName}
              language={mediaTemplateLanguage}
              onLanguage={setMediaTemplateLanguage}
              variables={mediaTemplateVariables}
              onVariables={setMediaTemplateVariables}
              mediaUrlPrefix={initial.mediaUrlPrefix}
            />
          </fieldset>
        </AppCard>

        <SaveButton>
          <div className="flex justify-end">
            <Button type="button" onClick={handleSave} disabled={isPending}>
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t('save')}
            </Button>
          </div>
        </SaveButton>

        {initial.enabled && (
          <AppCard
            title={t('test.title')}
            description={t('test.description')}
            contentClassName="space-y-4"
          >
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                value={testNumber}
                onChange={(event) => setTestNumber(event.target.value)}
                placeholder="+49 151 12345678"
              />
              <Button type="button" onClick={handleTest} disabled={isPending || !testNumber.trim()}>
                {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {t('test.send')}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">{t('test.hint')}</p>

            <div className="border-t pt-4">
              <Button
                type="button"
                variant="destructive"
                onClick={handleDisconnect}
                disabled={isPending}
              >
                {t('disconnect.action')}
              </Button>
              <p className="mt-2 text-xs text-muted-foreground">{t('disconnect.hint')}</p>
            </div>
          </AppCard>
        )}
      </ReadOnlyWrapper>
    </div>
  )
}
