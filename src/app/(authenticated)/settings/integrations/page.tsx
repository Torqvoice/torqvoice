import { redirect } from 'next/navigation'
import { getLayoutData } from '@/lib/get-layout-data'
import { getFeatures, isCloudMode } from '@/lib/features'
import { isSupportEnabled } from '@/lib/support'
import { anyConnectorAllowed } from '@/features/integrations/Lib/plan'
import { getIntegrationCatalog } from '@/features/integrations/Actions/integrationActions'
import { FeatureLockedMessage } from '../feature-locked-message'
import { IntegrationsCatalog } from './integrations-catalog'

export default async function IntegrationsPage() {
  const data = await getLayoutData()
  if (data.status === 'unauthenticated') redirect('/auth/sign-in')
  if (data.status === 'no-organization') redirect('/onboarding')

  const features = await getFeatures(data.organizationId)
  if (!anyConnectorAllowed(features)) {
    return (
      <FeatureLockedMessage
        feature="Integrations"
        description="Connect calendars, video calls and other services to your workshop."
        isCloud={isCloudMode()}
      />
    )
  }

  // Suggestions go through the support widget, so the button exists exactly
  // where the widget does: cloud mode with support switched on. A self-hosted
  // install has nobody on the other end to suggest anything to.
  const [result, canSuggest] = await Promise.all([getIntegrationCatalog(), isSupportEnabled()])
  const catalog =
    result.success && result.data
      ? result.data
      : { entries: [], enabled: true, isCloud: isCloudMode() }
  return <IntegrationsCatalog entries={catalog.entries} canSuggest={canSuggest} />
}
