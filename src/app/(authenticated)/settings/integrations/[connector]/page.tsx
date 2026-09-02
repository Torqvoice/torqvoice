import { notFound, redirect } from 'next/navigation'
import { getLayoutData } from '@/lib/get-layout-data'
import { getFeatures, isCloudMode } from '@/lib/features'
import {
  getIntegrationActivity,
  getIntegrationConnection,
} from '@/features/integrations/Actions/integrationActions'
import { getManifest } from '@/integrations/registry'
import { FeatureLockedMessage } from '../../feature-locked-message'
import { ConnectionSettings } from './connection-settings'

export default async function IntegrationConnectionPage({
  params,
}: {
  params: Promise<{ connector: string }>
}) {
  const { connector } = await params
  if (!getManifest(connector)) notFound()

  const data = await getLayoutData()
  if (data.status === 'unauthenticated') redirect('/auth/sign-in')
  if (data.status === 'no-organization') redirect('/onboarding')

  const features = await getFeatures(data.organizationId)
  if (!features.integrations) {
    return (
      <FeatureLockedMessage
        feature="Integrations"
        description="Connect calendars, video calls and other services to your workshop."
        isCloud={isCloudMode()}
      />
    )
  }

  const [view, activity] = await Promise.all([
    getIntegrationConnection(connector),
    getIntegrationActivity(connector),
  ])
  if (!view.success || !view.data) notFound()

  return (
    <ConnectionSettings
      view={view.data}
      activity={activity.success && activity.data ? activity.data : { jobs: [], logs: [] }}
    />
  )
}
