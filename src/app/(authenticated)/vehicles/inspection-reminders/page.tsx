import { PageHeader } from '@/components/page-header'
import { previewInspectionReminders } from '@/features/inspection-reminders/Actions/inspectionReminderActions'
import { RemindersWizard } from './reminders-wizard'

export default async function InspectionRemindersPage({
  searchParams,
}: {
  searchParams: Promise<{ due?: string; channel?: string }>
}) {
  const params = await searchParams
  const windowDays = params.due === '30' ? 30 : params.due === '60' ? 60 : 90
  const wanted = params.channel
  const first = await previewInspectionReminders({ windowDays, channel: 'sms' })
  // Default to the first channel the workshop actually has, unless the link asked for one.
  const channels = first.success && first.data ? first.data.channels : []
  const channel =
    wanted && channels.includes(wanted as (typeof channels)[number])
      ? (wanted as (typeof channels)[number])
      : (channels[0] ?? 'sms')
  const preview =
    channel === 'sms' ? first : await previewInspectionReminders({ windowDays, channel })

  return (
    <>
      <PageHeader />
      <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
        <RemindersWizard
          initialWindow={windowDays}
          initialChannel={channel}
          initialPreview={preview.success && preview.data ? preview.data : null}
          error={preview.success ? null : (preview.error ?? null)}
        />
      </div>
    </>
  )
}
