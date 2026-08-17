import { AppCard } from '@/components/app-card'
import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { Headset } from 'lucide-react'
import { isSupportEnabled } from '@/lib/support'
import { SupportSettingsControls } from '@/features/support/Components/SupportSettingsControls'

/**
 * Somewhere to find the support button again after dismissing it.
 *
 * 404s rather than rendering an empty page when the feature is off, so the
 * route cannot be used to discover that support exists on a plan that does not
 * have it.
 */
export default async function SupportSettingsPage() {
  if (!(await isSupportEnabled())) notFound()

  const t = await getTranslations('settings')

  return (
    <div className="space-y-6">
      <AppCard
        icon={Headset}
        title={t('support.title')}
        contentClassName="space-y-4"
      >
          <p className="text-sm text-muted-foreground">{t('support.description')}</p>
          <SupportSettingsControls />
        </AppCard>
    </div>
  )
}
