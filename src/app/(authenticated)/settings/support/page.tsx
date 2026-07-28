import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
      <Card className="border-0 shadow-sm">
        <CardHeader className="flex flex-row items-center gap-3 pb-4">
          <Headset className="h-5 w-5 text-muted-foreground" />
          <CardTitle className="text-lg">{t('support.title')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">{t('support.description')}</p>
          <SupportSettingsControls />
        </CardContent>
      </Card>
    </div>
  )
}
