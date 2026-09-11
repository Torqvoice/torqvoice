import { redirect } from 'next/navigation'
import { getLayoutData } from '@/lib/get-layout-data'
import { isSupportEnabled } from '@/lib/support'
import { getIntegrationCatalog } from '@/features/integrations/Actions/integrationActions'
import { IntegrationsCatalog } from './integrations-catalog'

export default async function IntegrationsPage() {
  const data = await getLayoutData()
  if (data.status === 'unauthenticated') redirect('/auth/sign-in')
  if (data.status === 'no-organization') redirect('/onboarding')

  // Suggestions go through the support widget, so the button exists exactly
  // where the widget does: cloud mode with support switched on. A self-hosted
  // install has nobody on the other end to suggest anything to.
  const [result, canSuggest] = await Promise.all([getIntegrationCatalog(), isSupportEnabled()])
  const entries = result.success && result.data ? result.data.entries : []
  return <IntegrationsCatalog entries={entries} canSuggest={canSuggest} />
}
