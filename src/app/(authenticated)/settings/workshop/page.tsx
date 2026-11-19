import { getSettings } from '@/features/settings/Actions/settingsActions'
import { getTechnicians } from '@/features/workboard/Actions/technicianActions'
import { WorkshopSettings } from './workshop-settings'
import { settingsPageTitle } from '@/lib/page-title'
import { getAuthContext } from '@/lib/get-auth-context'
import { getFeatures } from '@/lib/features'

export function generateMetadata() {
  return settingsPageTitle('workshop')
}

export default async function WorkshopSettingsPage() {
  const [result, techResult, authContext] = await Promise.all([
    getSettings(),
    getTechnicians(),
    getAuthContext(),
  ])
  // The Reference / PO switch belongs to the plans that have custom fields.
  const customerReferenceAvailable = authContext
    ? (await getFeatures(authContext.organizationId)).customFields
    : false
  const settings = result.success && result.data ? result.data : {}
  const technicians =
    techResult.success && techResult.data
      ? techResult.data.map((t) => ({ id: t.id, name: t.name }))
      : []

  return (
    <WorkshopSettings
      settings={settings}
      technicians={technicians}
      customerReferenceAvailable={customerReferenceAvailable}
    />
  )
}
