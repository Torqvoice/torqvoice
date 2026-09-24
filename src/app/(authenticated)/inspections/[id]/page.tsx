import {
  getCommonDefectNotes,
  getInspection,
  getInspectionTechnicians,
} from '@/features/inspections/Actions/inspectionActions'
import { getDisplaySettings } from '@/features/settings/Actions/settingsActions'
import { getStatusReportsForInspection } from '@/features/status-reports/Actions/getStatusReportsForService'
import { SETTING_KEYS } from '@/features/settings/Schema/settingsSchema'
import {
  InspectionPageClient,
  type InspectionData,
} from '@/features/inspections/Components/InspectionPageClient'
import { PageHeader } from '@/components/page-header'
import { getAuthContext } from '@/lib/get-auth-context'
import { getFeatures } from '@/lib/features'
import { redirect } from 'next/navigation'

export default async function InspectionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const [result, authContext] = await Promise.all([getInspection(id), getAuthContext()])

  if (!result.success || !result.data) {
    redirect('/inspections')
  }

  const [features, defectHistory, technicians, settings, statusReports] = await Promise.all([
    authContext?.organizationId ? getFeatures(authContext.organizationId) : null,
    getCommonDefectNotes(id),
    getInspectionTechnicians(),
    getDisplaySettings([SETTING_KEYS.WORKSHOP_ADDRESS]),
    getStatusReportsForInspection(id),
  ])

  return (
    <>
      <PageHeader />
      <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
        <InspectionPageClient
          inspection={result.data as InspectionData}
          organizationId={authContext?.organizationId ?? ''}
          smsEnabled={features?.sms ?? false}
          emailEnabled={features?.smtp ?? false}
          telegramEnabled={features?.telegram ?? false}
          statusReports={
            statusReports.success && statusReports.data
              ? statusReports.data.map((report) => ({
                  ...report,
                  createdAt: report.createdAt.toISOString(),
                  expiresAt: report.expiresAt?.toISOString() ?? null,
                  feedbackAt: report.feedbackAt?.toISOString() ?? null,
                  sentAt: report.sentAt?.toISOString() ?? null,
                }))
              : []
          }
          defectHistory={defectHistory.success ? defectHistory.data : {}}
          technicians={technicians.success ? technicians.data : []}
          workshopAddress={
            (settings.success && settings.data?.[SETTING_KEYS.WORKSHOP_ADDRESS]) || ''
          }
        />
      </div>
    </>
  )
}
