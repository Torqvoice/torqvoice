import { getFieldDefinitions } from '@/features/custom-fields/Actions/customFieldActions'
import {
  getInvoiceLayoutConfig,
  getQuoteLayoutConfig,
} from '@/features/settings/Actions/invoiceLayoutActions'
import { getLayoutData } from '@/lib/get-layout-data'
import { getFeatures, isCloudMode } from '@/lib/features'
import { CustomFieldsManager } from '@/features/custom-fields/Components/CustomFieldsManager'
import { getMeterSuggestions, getMeterTypes } from '@/features/meters/Actions/meterTypeActions'
import { MetersManager } from '@/features/meters/Components/MetersManager'
import { getEquipmentTypes } from '@/features/equipment/Actions/equipmentTypeActions'
import { EquipmentTypesManager } from '@/features/equipment/Components/EquipmentTypesManager'
import { heavyVehicleSetupState } from '@/features/setup/Lib/heavyVehicleSetup.server'
import {
  HeavyVehicleSetupCard,
  HeavyVehicleSetupLink,
} from '@/features/setup/Components/HeavyVehicleSetupCard'
import { FeatureLocked } from '../feature-locked-message'
import { redirect } from 'next/navigation'
import { settingsPageTitle } from '@/lib/page-title'

export function generateMetadata() {
  return settingsPageTitle('customFields')
}

export default async function CustomFieldsPage() {
  const data = await getLayoutData()

  if (data.status === 'unauthenticated') redirect('/auth/sign-in')
  if (data.status === 'no-organization') redirect('/onboarding')

  const features = await getFeatures(data.organizationId)

  const locked = !features.customFields

  const [
    result,
    invoiceLayoutResult,
    quoteLayoutResult,
    metersResult,
    suggestionsResult,
    equipmentResult,
  ] = await Promise.all([
    getFieldDefinitions(),
    getInvoiceLayoutConfig(),
    getQuoteLayoutConfig(),
    // The workshop's meters live here too: defining the first one is what
    // turns meters on.
    locked ? null : getMeterTypes(),
    locked ? null : getMeterSuggestions(),
    // And the kinds of equipment: the first one turns equipment on.
    locked ? null : getEquipmentTypes(),
  ])
  // The fleet and heavy vehicle checklist, only once the workshop asked for it.
  const setup = locked ? null : await heavyVehicleSetupState(data.organizationId)
  const fields = result.success && result.data ? result.data : []

  const content = (
    <div className="space-y-8">
      {setup && <HeavyVehicleSetupCard state={setup} />}
      <CustomFieldsManager
        initialFields={fields}
        layoutConfig={invoiceLayoutResult.success ? invoiceLayoutResult.data : undefined}
        quoteLayoutConfig={quoteLayoutResult.success ? quoteLayoutResult.data : undefined}
      />
      {!locked && (
        <MetersManager
          meters={metersResult?.success && metersResult.data ? metersResult.data : []}
          suggestions={
            suggestionsResult?.success && suggestionsResult.data ? suggestionsResult.data : []
          }
        />
      )}
      {!locked && (
        <EquipmentTypesManager
          types={equipmentResult?.success && equipmentResult.data ? equipmentResult.data : []}
        />
      )}
      {/* At the foot of the page, so it moves nothing above it. */}
      {!locked && !setup && <HeavyVehicleSetupLink />}
    </div>
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
