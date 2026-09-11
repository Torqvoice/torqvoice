import { getFieldDefinitions } from '@/features/custom-fields/Actions/customFieldActions'
import {
  getInvoiceLayoutConfig,
  getQuoteLayoutConfig,
} from '@/features/settings/Actions/invoiceLayoutActions'
import { getLayoutData } from '@/lib/get-layout-data'
import { getFeatures, isCloudMode } from '@/lib/features'
import { CustomFieldsManager } from '@/features/custom-fields/Components/CustomFieldsManager'
import { FeatureLocked } from '../feature-locked-message'
import { redirect } from 'next/navigation'

export default async function CustomFieldsPage() {
  const data = await getLayoutData()

  if (data.status === 'unauthenticated') redirect('/auth/sign-in')
  if (data.status === 'no-organization') redirect('/onboarding')

  const features = await getFeatures(data.organizationId)

  const locked = !features.customFields

  const [result, invoiceLayoutResult, quoteLayoutResult] = await Promise.all([
    getFieldDefinitions(),
    getInvoiceLayoutConfig(),
    getQuoteLayoutConfig(),
  ])
  const fields = result.success && result.data ? result.data : []

  const content = (
    <CustomFieldsManager
      initialFields={fields}
      layoutConfig={invoiceLayoutResult.success ? invoiceLayoutResult.data : undefined}
      quoteLayoutConfig={quoteLayoutResult.success ? quoteLayoutResult.data : undefined}
    />
  )

  return locked ? (
    <FeatureLocked
      feature="Custom Fields"
      description="Define custom data fields for vehicles, customers, and service records to track the information that matters to your shop."
      isCloud={isCloudMode()}
    >
      {content}
    </FeatureLocked>
  ) : (
    content
  )
}
