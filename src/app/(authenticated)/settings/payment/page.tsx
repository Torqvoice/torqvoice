import { getSettings } from '@/features/settings/Actions/settingsActions'
import { getPaymentConnections } from '@/features/integrations/Actions/integrationActions'
import { getLayoutData } from '@/lib/get-layout-data'
import { getFeatures, isCloudMode } from '@/lib/features'
import { PaymentSettings } from './payment-settings'
import { FeatureLocked } from '../feature-locked-message'
import { redirect } from 'next/navigation'

export default async function PaymentSettingsPage() {
  const data = await getLayoutData()

  if (data.status === 'unauthenticated') redirect('/auth/sign-in')
  if (data.status === 'no-organization') redirect('/onboarding')

  const features = await getFeatures(data.organizationId)

  const locked = !features.payments

  const [result, connections] = await Promise.all([getSettings(), getPaymentConnections()])
  const settings = result.success && result.data ? result.data : {}

  const content = (
    <PaymentSettings
      settings={settings}
      orgId={data.organizationId}
      providers={connections.success && connections.data ? connections.data : []}
    />
  )

  return locked ? (
    <FeatureLocked
      feature="Payment Settings"
      description="Configure payment providers, terms, and online payment options for your invoices."
      isCloud={isCloudMode()}
    >
      {content}
    </FeatureLocked>
  ) : (
    content
  )
}
