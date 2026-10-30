'use client'

import { useRef, useState, useTransition } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { AppWindow, ImageIcon, Loader2, Lock, Trash2, Upload } from 'lucide-react'
import { AppCard } from '@/components/app-card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { setSystemSettings } from '../Actions/setSystemSettings'
import { BRANDING_APP_NAME_MAX_LENGTH, SYSTEM_SETTING_KEYS } from '../Schema/systemSettingsSchema'

const ICON_ROUTE = '/api/protected/admin/app-icon'

/** The server's own error text when it sent one, else the fallback. */
async function errorText(res: Response, fallback: string): Promise<string> {
  try {
    const body = (await res.json()) as { error?: unknown }
    return typeof body.error === 'string' && body.error ? body.error : fallback
  } catch {
    return fallback
  }
}

/**
 * What the browser calls this install: tab title, favicon, installed app.
 *
 * Saves on its own like the broadcast card. The name and the icon are
 * separate writes (a settings row and an uploaded file), and neither belongs
 * to the mail configuration the page's main Save button rewrites.
 */
export function BrandingCard({
  initialName,
  initialIconUrl,
  locked = false,
}: {
  initialName: string
  initialIconUrl: string | null
  /** no white-label licence on this install: everything shown, nothing editable */
  locked?: boolean
}) {
  const t = useTranslations('admin.adminSettings')
  const router = useRouter()
  const [name, setName] = useState(initialName)
  const [savedName, setSavedName] = useState(initialName)
  const [iconUrl, setIconUrl] = useState(initialIconUrl)
  const [iconBusy, setIconBusy] = useState(false)
  const [isPending, startTransition] = useTransition()
  const fileRef = useRef<HTMLInputElement>(null)

  const unchanged = name.trim() === savedName.trim()

  const saveName = () => {
    const value = name.trim()
    startTransition(async () => {
      const result = await setSystemSettings({ [SYSTEM_SETTING_KEYS.BRANDING_APP_NAME]: value })
      if (!result.success) {
        toast.error(result.error ?? t('branding.saveFailed'))
        return
      }
      setName(value)
      setSavedName(value)
      toast.success(t('branding.saved'))
      router.refresh()
    })
  }

  const uploadIcon = async (file: File) => {
    setIconBusy(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const res = await fetch(ICON_ROUTE, { method: 'POST', body: formData })
      if (!res.ok) {
        toast.error(await errorText(res, t('branding.uploadFailed')))
        return
      }
      const data = (await res.json()) as { url: string }
      setIconUrl(data.url)
      toast.success(t('branding.uploaded'))
      router.refresh()
    } catch {
      toast.error(t('branding.uploadFailed'))
    } finally {
      setIconBusy(false)
    }
  }

  const removeIcon = async () => {
    setIconBusy(true)
    try {
      const res = await fetch(ICON_ROUTE, { method: 'DELETE' })
      if (!res.ok) {
        toast.error(await errorText(res, t('branding.removeFailed')))
        return
      }
      setIconUrl(null)
      toast.success(t('branding.removed'))
      router.refresh()
    } catch {
      toast.error(t('branding.removeFailed'))
    } finally {
      setIconBusy(false)
    }
  }

  return (
    <AppCard
      id="app-branding"
      icon={AppWindow}
      title={t('branding.title')}
      description={t('branding.description')}
      action={
        locked ? (
          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs text-muted-foreground">
            <Lock className="h-3.5 w-3.5" aria-hidden="true" />
            {t('branding.lockedBadge')}
          </span>
        ) : undefined
      }
      contentClassName="space-y-6"
    >
      {locked && (
        <p className="text-sm text-muted-foreground">
          {t('branding.lockedHint')}{' '}
          <Link
            href="/settings/license"
            className="font-medium text-foreground underline underline-offset-4"
          >
            {t('branding.lockedLink')}
          </Link>
        </p>
      )}
      {/* A disabled fieldset disables every field and button inside it. */}
      <fieldset disabled={locked} className={locked ? 'space-y-6 opacity-60' : 'space-y-6'}>
        <div className="space-y-2">
          <Label htmlFor="branding-app-name">{t('branding.nameLabel')}</Label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              id="branding-app-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={BRANDING_APP_NAME_MAX_LENGTH}
              placeholder="TorqVoice"
              className="sm:max-w-xs"
            />
            <Button onClick={saveName} disabled={isPending || unchanged}>
              {isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              {t('branding.save')}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">{t('branding.nameHint')}</p>
        </div>

        <div className="space-y-2">
          <Label>{t('branding.iconLabel')}</Label>
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-muted/50">
              {iconUrl ? (
                <Image
                  src={iconUrl}
                  alt={t('branding.iconAlt')}
                  width={64}
                  height={64}
                  unoptimized
                  className="object-contain"
                />
              ) : (
                <ImageIcon className="h-6 w-6 text-muted-foreground/50" />
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => fileRef.current?.click()}
                disabled={iconBusy}
              >
                {iconBusy ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Upload className="mr-1.5 h-3.5 w-3.5" />
                )}
                {iconUrl ? t('branding.replace') : t('branding.upload')}
              </Button>
              {iconUrl && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:text-destructive"
                  onClick={removeIcon}
                  disabled={iconBusy}
                >
                  <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                  {t('branding.remove')}
                </Button>
              )}
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              data-testid="branding-icon-input"
              onChange={(event) => {
                const file = event.target.files?.[0]
                if (file) uploadIcon(file)
                event.target.value = ''
              }}
            />
          </div>
          <p className="text-xs text-muted-foreground">{t('branding.iconHint')}</p>
        </div>
      </fieldset>
    </AppCard>
  )
}
