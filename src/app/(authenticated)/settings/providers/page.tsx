import { ArrowRight, Plug } from 'lucide-react'
import { getTranslations } from 'next-intl/server'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { channelSetup } from '@/features/integrations/Lib/messaging'
import { type MessagingChannel, messagingProvider } from '@/integrations/messaging/catalog'
import { getLayoutData } from '@/lib/get-layout-data'

const CHANNELS: MessagingChannel[] = ['email', 'sms', 'whatsapp', 'telegram']

/**
 * Where the channel settings used to be.
 *
 * Email, SMS, WhatsApp and Telegram are integrations now, set up in the
 * catalog alongside every other vendor. The page stays as a signpost rather
 * than a redirect: a workshop that bookmarked it, or that remembers where SMS
 * lived, gets told what happened and what it is connected to today, which a
 * silent jump somewhere else would not do.
 */
export default async function ProvidersSettingsPage() {
  const data = await getLayoutData()

  if (data.status === 'unauthenticated') redirect('/auth/sign-in')
  if (data.status === 'no-organization') redirect('/onboarding')

  const t = await getTranslations('settings.providers')

  const rows = await Promise.all(
    CHANNELS.map(async (channel) => {
      const setup = await channelSetup(data.organizationId, channel)
      return {
        channel,
        connectorId: setup?.connectorId ?? null,
        vendor: setup ? (messagingProvider(setup.connectorId)?.name ?? null) : null,
      }
    })
  )

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 md:p-6">
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-900/50 dark:bg-amber-950/30">
        <div className="flex items-start gap-3">
          <Plug className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-500" />
          <div className="space-y-1">
            <p className="font-medium text-amber-900 dark:text-amber-200">{t('moved.title')}</p>
            <p className="text-sm text-amber-800 dark:text-amber-300">{t('moved.description')}</p>
          </div>
        </div>
      </div>

      <div className="divide-y rounded-lg border">
        {rows.map((row) => (
          <div key={row.channel} className="flex items-center justify-between gap-4 p-4">
            <div className="min-w-0">
              <p className="font-medium">{t(`tabs.${row.channel}`)}</p>
              <p className="truncate text-sm text-muted-foreground">
                {row.vendor
                  ? t('moved.connectedTo', { vendor: row.vendor })
                  : row.channel === 'email'
                    ? t('moved.platformMail')
                    : t('moved.notSetUp')}
              </p>
            </div>
            {row.connectorId ? (
              <Button asChild variant="outline" size="sm">
                <Link href={`/settings/integrations/${row.connectorId}`}>{t('moved.manage')}</Link>
              </Button>
            ) : (
              <Badge variant="secondary">
                {row.channel === 'email' ? t('moved.onByDefault') : t('moved.notConnected')}
              </Badge>
            )}
          </div>
        ))}
      </div>

      <Button asChild>
        <Link href="/settings/integrations">
          {t('moved.goToIntegrations')}
          <ArrowRight className="ml-2 h-4 w-4" />
        </Link>
      </Button>
    </div>
  )
}
