import { redirect } from 'next/navigation'
import { getLayoutData } from '@/lib/get-layout-data'
import { getFeatures, isCloudMode } from '@/lib/features'
import { FeatureLocked } from '../feature-locked-message'
import { getWebhooks } from '@/features/webhooks/Actions/webhookActions'
import { WebhooksSettings } from './webhooks-settings'

export default async function WebhooksPage() {
  const data = await getLayoutData()
  if (data.status === 'unauthenticated') redirect('/auth/sign-in')
  if (data.status === 'no-organization') redirect('/onboarding')

  const features = await getFeatures(data.organizationId)
  const locked = !features.api

  const result = await getWebhooks()
  const webhooks = result.success && result.data ? result.data : []

  const content = <WebhooksSettings webhooks={webhooks} />

  return locked ? (
    <FeatureLocked
      feature="Webhooks"
      description="Push real-time event notifications to your own systems via HTTPS."
      isCloud={isCloudMode()}
    >
      {content}
    </FeatureLocked>
  ) : (
    content
  )
}
