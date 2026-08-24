'use client'

import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { Copy } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { TemplateVariablePicker } from './TemplateVariablePicker'
import { TEMPLATE_TOKENS, type TemplateToken } from '../Schema/templateTokens'
import type { WhatsappSettingsView } from '../Actions/whatsappSettingsActions'

type Provider = WhatsappSettingsView['providers'][number]

/**
 * One approved template: what it is called, what language it was approved in,
 * and which of our values fill its blanks.
 *
 * Rendered twice, because WhatsApp fixes a template's media type at approval.
 * A template approved with an image can only ever send an image, so a workshop
 * that wants both plain updates and part photos needs one of each.
 */
export function TemplateSetupFields({
  kind,
  provider,
  name,
  onName,
  language,
  onLanguage,
  variables,
  onVariables,
  mediaUrlPrefix,
}: {
  kind: 'text' | 'media'
  provider: Provider | null
  name: string
  onName: (next: string) => void
  language: string
  onLanguage: (next: string) => void
  variables: string
  onVariables: (next: string) => void
  /** Only needed by the photo template, and only on providers that ask for it. */
  mediaUrlPrefix?: string
}) {
  const t = useTranslations('whatsapp.settings.template')

  // The photo value belongs to the photo template alone, and only where the
  // provider takes media through the URL rather than as a header of its own.
  const takesPhotoValue = kind === 'media' && provider?.template.mediaAs === 'variable'
  const offered: readonly TemplateToken[] = takesPhotoValue
    ? TEMPLATE_TOKENS
    : TEMPLATE_TOKENS.filter((token) => token !== 'photo')

  const copyMediaUrl = () => {
    if (!mediaUrlPrefix) return
    navigator.clipboard.writeText(`${mediaUrlPrefix}{{n}}`)
    toast.success(t('mediaUrlCopied'))
  }

  return (
    <div className="space-y-4 rounded-lg border p-4">
      <div className="space-y-0.5">
        <p className="text-sm font-medium">{t(kind === 'media' ? 'mediaTitle' : 'textTitle')}</p>
        <p className="text-xs text-muted-foreground">
          {t(kind === 'media' ? 'mediaDescription' : 'textDescription')}
        </p>
        {/* An empty template is not an error, but it does close off a whole
            way of reaching customers, which is worth saying here. */}
        {!name.trim() && (
          <p className="text-xs font-medium text-amber-700 dark:text-amber-400">
            {t(kind === 'media' ? 'mediaMissing' : 'textMissing')}
          </p>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor={`whatsapp-template-${kind}`}>
            {provider?.template.label ?? t('nameLabel')}
          </Label>
          <Input
            id={`whatsapp-template-${kind}`}
            name={`whatsapp-template-${kind}`}
            value={name}
            onChange={(event) => onName(event.target.value)}
            placeholder={provider?.template.placeholder}
            autoComplete="off"
            data-1p-ignore
            data-lpignore="true"
          />
          <p className="text-xs text-muted-foreground">
            {provider?.template.help ?? t('nameHint')}
          </p>
        </div>

        {provider?.template.usesLanguage !== false && (
          <div className="space-y-2">
            <Label htmlFor={`whatsapp-template-language-${kind}`}>{t('languageLabel')}</Label>
            <Input
              id={`whatsapp-template-language-${kind}`}
              name={`whatsapp-template-language-${kind}`}
              value={language}
              onChange={(event) => onLanguage(event.target.value)}
              placeholder="de"
              autoComplete="off"
              data-1p-ignore
              data-lpignore="true"
            />
            <p className="text-xs text-muted-foreground">{t('languageHint')}</p>
          </div>
        )}
      </div>

      <div className="rounded-lg bg-muted/40 p-3">
        <p className="text-xs font-medium">{t('exampleLabel')}</p>
        <code className="mt-1 block font-mono text-xs text-muted-foreground">
          {kind === 'media'
            ? 'Hi {{1}}, here is a photo from your repair: {{2}}. Reply here if you have any questions.'
            : 'Hi {{1}}, an update on your repair: {{2}}. Reply here if you have any questions.'}
        </code>
        <p className="mt-1.5 text-xs text-muted-foreground">
          {/* Only a provider that takes media through the URL asks for a value
              for it. Meta carries the photo in the header, so mentioning one
              here would send people looking for a chip that is not offered. */}
          {t(
            kind === 'media'
              ? takesPhotoValue
                ? 'exampleMediaValues'
                : 'exampleMediaValuesHeader'
              : 'exampleTextValues'
          )}
        </p>
      </div>

      <div className="space-y-2">
        <Label>{t('variablesLabel')}</Label>
        <TemplateVariablePicker value={variables} onChange={onVariables} offered={offered} />
        <p className="text-xs text-muted-foreground">{t('variablesHint')}</p>
      </div>

      {/* A media template's URL field is validated as a real URL, so the
          workshop pastes this prefix and puts the variable at the end. */}
      {takesPhotoValue && mediaUrlPrefix && variables.includes('photo') && (
        <div className="space-y-1 rounded-lg border border-dashed bg-muted/30 p-3">
          <p className="text-xs font-medium">{t('mediaUrlLabel')}</p>
          <div className="flex items-center gap-2">
            <Input readOnly value={`${mediaUrlPrefix}{{n}}`} className="font-mono text-xs" />
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={copyMediaUrl}
              aria-label={t('mediaUrlCopy')}
            >
              <Copy className="h-4 w-4" />
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">{t('mediaUrlHint')}</p>
          <p className="text-xs text-muted-foreground">{t('mediaUrlSample')}</p>
        </div>
      )}
    </div>
  )
}
