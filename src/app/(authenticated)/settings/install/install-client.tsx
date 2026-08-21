'use client'

import { AppCard } from '@/components/app-card'
import Image from 'next/image'
import { useTranslations } from 'next-intl'
import { CheckCircle2, Download, Info } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { useInstallPrompt } from '@/components/pwa-install-prompt'

export function InstallSettingsClient() {
  const t = useTranslations('settings.install')
  const ts = useTranslations('common.shared')
  const { canInstall, installed, isIOS, dismissed, install, restore } = useInstallPrompt()

  return (
    <div className="space-y-6">
      <AppCard
        icon={Download}
        title={t('title')}
        contentClassName="space-y-4"
      >
          <div className="flex items-start gap-3">
            <Image
              src="/icons/icon-192.png"
              alt=""
              width={48}
              height={48}
              className="shrink-0 rounded-xl"
            />
            <p className="text-sm text-muted-foreground">{t('description')}</p>
          </div>

          <Separator />

          {installed ? (
            <p className="flex items-center gap-2 text-sm font-medium text-emerald-600">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              {t('installed')}
            </p>
          ) : isIOS ? (
            <p className="flex items-start gap-2 text-sm text-muted-foreground">
              <Info className="mt-0.5 h-4 w-4 shrink-0" />
              {t('iosHint')}
            </p>
          ) : canInstall ? (
            <Button onClick={install} className="w-full sm:w-auto">
              <Download className="mr-2 h-4 w-4" />
              {ts('install')}
            </Button>
          ) : (
            <p className="flex items-start gap-2 text-sm text-muted-foreground">
              <Info className="mt-0.5 h-4 w-4 shrink-0" />
              {t('unavailable')}
            </p>
          )}

          {/* Only worth showing once the banner has actually been dismissed. */}
          {dismissed && !installed && (
            <>
              <Separator />
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm text-muted-foreground">{t('bannerHidden')}</p>
                <Button variant="outline" size="sm" onClick={restore}>
                  {t('showBanner')}
                </Button>
              </div>
            </>
          )}
        </AppCard>
    </div>
  )
}
