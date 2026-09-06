import { PageHeader } from '@/components/page-header'
import { getInspectionReminderCampaign } from '@/features/inspection-reminders/Actions/inspectionReminderActions'
import { CampaignDetail } from './campaign-detail'

export default async function CampaignPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const result = await getInspectionReminderCampaign(id)
  return (
    <>
      <PageHeader />
      <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
        {result.success && result.data ? (
          <CampaignDetail campaign={result.data} />
        ) : (
          <p className="text-sm text-muted-foreground">{result.error}</p>
        )}
      </div>
    </>
  )
}
