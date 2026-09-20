'use client'

import { useTranslations } from 'next-intl'
import { Palette, Type } from 'lucide-react'
import { AppCard } from '@/components/app-card'
import { ThemePicker } from '@/components/theme-picker'
import { FontSetPicker } from '@/components/font-set-picker'

/**
 * How the app looks on this device: its colours and its typefaces. Both are
 * kept in the browser and applied at once, so there is nothing to save and
 * nothing here that needs the right to edit the workshop's settings. Dates,
 * times and the timezone are the workshop's and live under Localization.
 */
export function AppearanceSettings() {
  const t = useTranslations('settings.appearance')

  return (
    <div className="space-y-6">
      <AppCard
        icon={Palette}
        title={t('themeLabel')}
        description={t('themeHint')}
        contentClassName="space-y-4"
      >
        <ThemePicker />
      </AppCard>

      <AppCard
        icon={Type}
        title={t('fontLabel')}
        description={t('fontHint')}
        contentClassName="space-y-4"
      >
        <FontSetPicker />
      </AppCard>
    </div>
  )
}
