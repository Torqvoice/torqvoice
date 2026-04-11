'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Copy, Check, Globe, Loader2 } from 'lucide-react'
import { ReadOnlyBanner, ReadOnlyWrapper } from '@/app/(authenticated)/settings/read-only-guard'
import { setSetting, setSettings } from '@/features/settings/Actions/settingsActions'
import { SETTING_KEYS } from '@/features/settings/Schema/settingsSchema'
import { updatePortalSlug } from '@/features/portal/Actions/portalActions'

export function CustomerPortalSettings({
  enabled: initialEnabled,
  orgId,
  portalSlug: initialSlug,
  appUrl,
  description: initialDescription,
  hours: initialHours,
}: {
  enabled: boolean
  orgId: string
  portalSlug: string | null
  appUrl: string
  description: string
  hours: string
}) {
  const router = useRouter()
  const t = useTranslations('settings')
  const [isPending, startTransition] = useTransition()
  const [enabled, setEnabled] = useState(initialEnabled)
  const [copied, setCopied] = useState(false)
  const [slug, setSlug] = useState(initialSlug ?? '')
  const [slugSaving, setSlugSaving] = useState(false)
  const [description, setDescription] = useState(initialDescription)
  const [hours, setHours] = useState(initialHours)
  const [contentSaving, setContentSaving] = useState(false)

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

  const handleSlugSave = async () => {
    setSlugSaving(true)
    try {
      const result = await updatePortalSlug(slug || null)
      if (result.success) {
        toast.success(slug ? t('portal.slugSaved') : t('portal.slugRemoved'))
        router.refresh()
      } else {
        toast.error(result.error ?? t('portal.failedUpdateSlug'))
      }
    } finally {
      setSlugSaving(false)
    }
  }

  const slugDirty = slug !== (initialSlug ?? '')
  const contentDirty = description !== initialDescription || hours !== initialHours

  const handleContentSave = async () => {
    setContentSaving(true)
    try {
      const result = await setSettings({
        [SETTING_KEYS.PORTAL_DESCRIPTION]: description,
        [SETTING_KEYS.PORTAL_HOURS]: hours,
      })
      if (result.success) {
        toast.success(t('portal.contentSaved'))
        router.refresh()
      } else {
        toast.error(result.error ?? t('portal.failedUpdate'))
      }
    } finally {
      setContentSaving(false)
    }
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
                  <div className="flex gap-2">
                    <Input
                      id="portal-slug"
                      value={slug}
                      onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/\s/g, ''))}
                      placeholder="e.g. my_shop"
                      className="font-mono text-sm"
                    />
                    <Button
                      type="button"
                      onClick={handleSlugSave}
                      disabled={slugSaving || !slugDirty}
                      size="sm"
                    >
                      {slugSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : t('portal.save')}
                    </Button>
                  </div>
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

                <div className="flex justify-end">
                  <Button
                    type="button"
                    onClick={handleContentSave}
                    disabled={contentSaving || !contentDirty}
                    size="sm"
                  >
                    {contentSaving ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      t('portal.save')
                    )}
                  </Button>
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
        </Card>
      </ReadOnlyWrapper>
    </div>
  )
}
