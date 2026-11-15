import { listWorkOrderStatuses } from '@/features/work-order-statuses/Actions/workOrderStatusActions'
import { WorkOrderStatusSettings } from '@/features/work-order-statuses/Components/WorkOrderStatusSettings'
import { settingsPageTitle } from '@/lib/page-title'

export function generateMetadata() {
  return settingsPageTitle('workOrderStatuses')
}

export default async function WorkOrderStatusSettingsPage() {
  const result = await listWorkOrderStatuses()
  return <WorkOrderStatusSettings statuses={result.success && result.data ? result.data : []} />
}
