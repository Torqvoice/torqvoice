import { redirect } from 'next/navigation'
import { getLayoutData } from '@/lib/get-layout-data'
import { getFeatures, isCloudMode } from '@/lib/features'
import { getIntegrationCatalog } from '@/features/integrations/Actions/integrationActions'
import { FeatureLockedMessage } from '../feature-locked-message'
import { IntegrationsCatalog } from './integrations-catalog'

export default async function IntegrationsPage() {
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

  const result = await getIntegrationCatalog()
  const catalog =
    result.success && result.data
      ? result.data
      : { entries: [], enabled: true, isCloud: isCloudMode() }
  return <IntegrationsCatalog entries={catalog.entries} />
}
