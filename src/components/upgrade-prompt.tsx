import Link from 'next/link'
import { isCloudMode } from '@/lib/features'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Zap } from 'lucide-react'
import { useTranslations } from 'next-intl'

export function UpgradePrompt({
  feature,
  title,
  description,
}: {
  feature: string
  title?: string
  description?: string
}) {
  const t = useTranslations('common.shared')
  const tu = useTranslations('common.upgrade')
  const cloud = isCloudMode()

  return (
    <div className="flex flex-1 items-center justify-center p-4">
      <Card className="max-w-md">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5" />
            {title ?? tu('title')}
          </CardTitle>
          <CardDescription>{description ?? tu('featureNotIncluded', { feature })}</CardDescription>
        </CardHeader>
        <CardContent>
          {cloud ? (
            <Button asChild>
              <Link href="/settings/subscription">{t('viewPlans')}</Link>
            </Button>
          ) : (
            <Button asChild>
              <Link href="/settings/license">{t('manageLicense')}</Link>
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
