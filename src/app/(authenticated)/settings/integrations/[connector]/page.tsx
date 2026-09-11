import { notFound, redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { getLayoutData } from '@/lib/get-layout-data'
import { getFeatures, isCloudMode } from '@/lib/features'
import {
  getIntegrationActivity,
  getIntegrationConnection,
} from '@/features/integrations/Actions/integrationActions'
import { getManifest } from '@/integrations/registry'
import { connectorAllowed } from '@/features/integrations/Lib/plan'
import { FeatureLocked } from '../../feature-locked-message'
import { ConnectionSettings } from './connection-settings'

export default async function IntegrationConnectionPage({
  params,
}: {
  params: Promise<{ connector: string }>
}) {
  const { connector } = await params
  const manifest = getManifest(connector)
  if (!manifest) notFound()

  const data = await getLayoutData()
  if (data.status === 'unauthenticated') redirect('/auth/sign-in')
  if (data.status === 'no-organization') redirect('/onboarding')

  const features = await getFeatures(data.organizationId)
  const locked = !connectorAllowed(manifest, features)

  const [view, activity] = await Promise.all([
    getIntegrationConnection(connector),
    getIntegrationActivity(connector),
  ])
  if (!view.success || !view.data) notFound()

  const content = (
    <ConnectionSettings
      view={view.data}
      activity={activity.success && activity.data ? activity.data : { items: [], logs: [] }}
    />
  )

  // Said in terms of what this connector does: a payment or AI connector is
  // gated by its own plan feature, and calendars and video calls are not what
  // the workshop is being asked to pay for there.
  const t = await getTranslations('integrations.connection')
  const lockedDescription =
    manifest.plan === 'payments'
      ? t('lockedPayments')
      : manifest.plan === 'ai'
        ? t('lockedAi')
        : t('lockedIntegrations')

  return locked ? (
    <FeatureLocked
      feature={manifest.plan ? manifest.name : 'Integrations'}
      description={lockedDescription}
      isCloud={isCloudMode()}
    >
      {content}
    </FeatureLocked>
  ) : (
    content
  )
}
