'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Copy, Check, Globe, Loader2, Image as ImageIcon, Trash2, Upload } from 'lucide-react'
import { ReadOnlyBanner, ReadOnlyWrapper } from '@/app/(authenticated)/settings/read-only-guard'
import { setSetting, setSettings } from '@/features/settings/Actions/settingsActions'
import { SETTING_KEYS } from '@/features/settings/Schema/settingsSchema'
import { updatePortalSlug } from '@/features/portal/Actions/portalActions'
import {
  PORTAL_BACKGROUND_TEMPLATES,
  type PortalBackgroundType,
} from '@/features/portal/portal-backgrounds'
import { cn } from '@/lib/utils'

export function CustomerPortalSettings({
  enabled: initialEnabled,
  orgId,
  portalSlug: initialSlug,
  appUrl,
  description: initialDescription,
  hours: initialHours,
  backgroundType: initialBackgroundType,
  backgroundTemplate: initialBackgroundTemplate,
  backgroundImage: initialBackgroundImage,
}: {
  enabled: boolean
  orgId: string
  portalSlug: string | null
  appUrl: string
  description: string
  hours: string
  backgroundType: PortalBackgroundType
  backgroundTemplate: string
  backgroundImage: string
}) {
  const router = useRouter()
  const t = useTranslations('settings')
  const [isPending, startTransition] = useTransition()
  const [enabled, setEnabled] = useState(initialEnabled)
  const [copied, setCopied] = useState(false)
  const [slug, setSlug] = useState(initialSlug ?? '')
  const [description, setDescription] = useState(initialDescription)
  const [hours, setHours] = useState(initialHours)
  const [saving, setSaving] = useState(false)
  const [backgroundType, setBackgroundType] = useState<PortalBackgroundType>(initialBackgroundType)
  const [backgroundTemplate, setBackgroundTemplate] = useState(
    initialBackgroundTemplate || PORTAL_BACKGROUND_TEMPLATES[0].id
  )
  const [backgroundImage, setBackgroundImage] = useState(initialBackgroundImage)
  const [bgUploading, setBgUploading] = useState(false)
  const bgFileInputRef = useRef<HTMLInputElement>(null)

  const portalParam = slug || orgId
  const portalUrl = `${appUrl}/portal/${portalParam}`

  const handleToggle = (checked: boolean) => {
    setEnabled(checked)
    startTransition(async () => {
      const result = await setSetting(SETTING_KEYS.PORTAL_ENABLED, checked ? 'true' : 'false')
      if (result.success) {
        toast.success(checked ? t('portal.enabled') : t('portal.disabled'))
        router.refresh()
      } else {
        setEnabled(!checked)
        toast.error(result.error ?? t('portal.failedUpdate'))
      }
    })
  }

  const handleCopy = async () => {
    await navigator.clipboard.writeText(portalUrl)
    setCopied(true)
    toast.success(t('portal.urlCopied'))
    setTimeout(() => setCopied(false), 2000)
  }

  const slugDirty = slug !== (initialSlug ?? '')
  const contentDirty = description !== initialDescription || hours !== initialHours
  const dirty = slugDirty || contentDirty

  const handleSave = async () => {
    setSaving(true)
    try {
      // Save slug first because it affects the portal URL and may fail
      // independently (uniqueness, length validation).
      if (slugDirty) {
        const result = await updatePortalSlug(slug || null)
        if (!result.success) {
          toast.error(result.error ?? t('portal.failedUpdateSlug'))
          return
        }
      }
      if (contentDirty) {
        const result = await setSettings({
          [SETTING_KEYS.PORTAL_DESCRIPTION]: description,
          [SETTING_KEYS.PORTAL_HOURS]: hours,
        })
        if (!result.success) {
          toast.error(result.error ?? t('portal.failedUpdate'))
          return
        }
      }
      toast.success(t('portal.contentSaved'))
      router.refresh()
    } finally {
      setSaving(false)
    }
  }

  const persistBackground = async (next: {
    type?: PortalBackgroundType
    template?: string
    image?: string
  }) => {
    const type = next.type ?? backgroundType
    const template = next.template ?? backgroundTemplate
    const image = next.image ?? backgroundImage
    const result = await setSettings({
      [SETTING_KEYS.PORTAL_BACKGROUND_TYPE]: type,
      [SETTING_KEYS.PORTAL_BACKGROUND_TEMPLATE]: template,
      [SETTING_KEYS.PORTAL_BACKGROUND_IMAGE]: image,
    })
    if (result.success) {
      router.refresh()
    } else {
      toast.error(result.error ?? t('portal.failedUpdate'))
    }
    return result.success
  }

  const handleBackgroundTypeChange = async (value: PortalBackgroundType) => {
    setBackgroundType(value)
    await persistBackground({ type: value })
  }

  const handleTemplateChoose = async (id: string) => {
    setBackgroundTemplate(id)
    // Picking a template implies switching to template mode.
    if (backgroundType !== 'template') setBackgroundType('template')
    await persistBackground({ type: 'template', template: id })
  }

  const handleBackgroundUpload = async (file: File) => {
    setBgUploading(true)
    const toastId = toast.loading(t('portal.background.uploading'))
    try {
      const formData = new FormData()
      formData.append('file', file)
      const res = await fetch('/api/protected/upload/portal-background', {
        method: 'POST',
        body: formData,
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        toast.error(err.error || t('portal.background.uploadFailed'), { id: toastId })
        return
      }
      const data = (await res.json()) as { url: string }
      setBackgroundImage(data.url)
      // Switching to image mode automatically.
      setBackgroundType('image')
      await persistBackground({ type: 'image', image: data.url })
      toast.success(t('portal.background.uploaded'), { id: toastId })
    } catch {
      toast.error(t('portal.background.uploadFailed'), { id: toastId })
    } finally {
      setBgUploading(false)
    }
  }

  const handleBackgroundRemove = async () => {
    setBackgroundImage('')
    // Fall back to template mode when an image is removed.
    setBackgroundType('template')
    await persistBackground({ type: 'template', image: '' })
  }

  return (
    <div className="space-y-6">
      <ReadOnlyBanner />
      <ReadOnlyWrapper>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Globe className="h-5 w-5" />
              {t('portal.title')}
            </CardTitle>
            <CardDescription>{t('portal.description')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="portal-enabled">{t('portal.enablePortal')}</Label>
                <p className="text-xs text-muted-foreground">{t('portal.enablePortalHint')}</p>
              </div>
              <Switch
                id="portal-enabled"
                checked={enabled}
                onCheckedChange={handleToggle}
                disabled={isPending}
              />
            </div>

            {enabled && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="portal-slug">{t('portal.customSlug')}</Label>
                  <Input
                    id="portal-slug"
                    value={slug}
                    onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/\s/g, ''))}
                    placeholder="e.g. my_shop"
                    className="font-mono text-sm"
                  />
                  <p className="text-xs text-muted-foreground">{t('portal.slugHint')}</p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="portal-description">{t('portal.descriptionLabel')}</Label>
                  <Textarea
                    id="portal-description"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder={t('portal.descriptionPlaceholder')}
                    rows={4}
                  />
                  <p className="text-xs text-muted-foreground">{t('portal.descriptionHint')}</p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="portal-hours">{t('portal.hoursLabel')}</Label>
                  <Textarea
                    id="portal-hours"
                    value={hours}
                    onChange={(e) => setHours(e.target.value)}
                    placeholder={t('portal.hoursPlaceholder')}
                    rows={4}
                  />
                  <p className="text-xs text-muted-foreground">{t('portal.hoursHint')}</p>
                </div>

                <div className="space-y-2">
                  <Label>{t('portal.portalUrl')}</Label>
                  <div className="flex gap-2">
                    <Input value={portalUrl} readOnly className="font-mono text-sm" />
                    <Button type="button" variant="outline" size="icon" onClick={handleCopy}>
                      {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">{t('portal.shareHint')}</p>
                </div>
              </>
            )}
          </CardContent>
          {enabled && (
            <CardFooter className="justify-end border-t pt-6">
              <Button type="button" onClick={handleSave} disabled={saving || !dirty}>
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                {t('portal.save')}
              </Button>
            </CardFooter>
          )}
        </Card>

        {enabled && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ImageIcon className="h-5 w-5" />
                {t('portal.background.title')}
              </CardTitle>
              <CardDescription>{t('portal.background.description')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Type selector */}
              <div className="grid grid-cols-3 gap-2">
                {(
                  [
                    { id: 'none', label: t('portal.background.typeNone') },
                    { id: 'template', label: t('portal.background.typeTemplate') },
                    { id: 'image', label: t('portal.background.typeImage') },
                  ] as { id: PortalBackgroundType; label: string }[]
                ).map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => handleBackgroundTypeChange(opt.id)}
                    className={cn(
                      'rounded-lg border px-3 py-2 text-sm font-medium transition-colors',
                      backgroundType === opt.id
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-input bg-background hover:bg-muted'
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>

              {/* Template grid */}
              {backgroundType === 'template' && (
                <div className="space-y-2">
                  <Label>{t('portal.background.chooseTemplate')}</Label>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    {PORTAL_BACKGROUND_TEMPLATES.map((tpl) => {
                      const selected = backgroundTemplate === tpl.id
                      return (
                        <button
                          key={tpl.id}
                          type="button"
                          onClick={() => handleTemplateChoose(tpl.id)}
                          className={cn(
                            'group relative h-24 overflow-hidden rounded-lg border-2 transition-all',
                            selected
                              ? 'border-primary ring-2 ring-primary/30'
                              : 'border-input hover:border-primary/50'
                          )}
                          aria-pressed={selected}
                        >
                          <div className={cn('absolute inset-0', tpl.className)} />
                          <span className="absolute inset-x-0 bottom-0 bg-background/80 px-2 py-1 text-xs font-medium backdrop-blur-sm">
                            {t(`portal.background.templateNames.${tpl.labelKey}`)}
                          </span>
                          {selected && (
                            <span className="absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
                              <Check className="h-3 w-3" />
                            </span>
                          )}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Image upload */}
              {backgroundType === 'image' && (
                <div className="space-y-3">
                  <Label>{t('portal.background.uploadLabel')}</Label>
                  <div className="flex items-center gap-4">
                    <div className="relative h-24 w-40 shrink-0 overflow-hidden rounded-lg border bg-muted">
                      {backgroundImage ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={`/api/public/portal-bg/${portalParam}?v=${encodeURIComponent(backgroundImage)}`}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center">
                          <ImageIcon className="h-6 w-6 text-muted-foreground/50" />
                        </div>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => bgFileInputRef.current?.click()}
                        disabled={bgUploading}
                      >
                        {bgUploading ? (
                          <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Upload className="mr-1.5 h-3.5 w-3.5" />
                        )}
                        {backgroundImage
                          ? t('portal.background.replace')
                          : t('portal.background.upload')}
                      </Button>
                      {backgroundImage && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:text-destructive"
                          onClick={handleBackgroundRemove}
                        >
                          <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                          {t('portal.background.remove')}
                        </Button>
                      )}
                    </div>
                    <input
                      ref={bgFileInputRef}
                      type="file"
                      accept=".jpg,.jpeg,.png,.webp"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0]
                        if (file) handleBackgroundUpload(file)
                        e.target.value = ''
                      }}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {t('portal.background.uploadHint')}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </ReadOnlyWrapper>
    </div>
  )
}
