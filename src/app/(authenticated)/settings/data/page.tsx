import { DataSettings } from './data-settings'
import { getContentCounts } from '@/features/settings/Actions/deleteContent'
import { getBackupHeartbeat } from '@/lib/backup-heartbeat'
import { getCachedSession, getCachedMembership } from '@/lib/cached-session'
import { db } from '@/lib/db'
import {
  SAMPLE_DATA_IDS_KEY,
  hasAnySampleIds,
  parseSampleDataIds,
} from '@/features/onboarding/Lib/onboardingKeys'

export default async function DataSettingsPage() {
  const heartbeat = await getBackupHeartbeat()
  const countsResult = await getContentCounts()

  // Owner check + workshop name for the delete-workshop confirmation.
  const session = await getCachedSession()
  const membership = session?.user?.id ? await getCachedMembership(session.user.id) : null
  const isOwner = membership?.role === 'owner'
  const [org, sampleRow] = membership
    ? await Promise.all([
        db.organization.findUnique({
          where: { id: membership.organizationId },
          select: { name: true },
        }),
        db.appSetting.findFirst({
          where: {
            organizationId: membership.organizationId,
            key: SAMPLE_DATA_IDS_KEY,
          },
          select: { value: true },
        }),
      ])
    : [null, null]
  const hasSampleData = hasAnySampleIds(parseSampleDataIds(sampleRow?.value))
  const contentCounts =
    countsResult.success && countsResult.data
      ? countsResult.data
      : {
          vehicles: 0,
          customers: 0,
          quotes: 0,
          inventory: 0,
          inspections: 0,
          technicians: 0,
          inspectionTemplates: 0,
          notifications: 0,
          smsMessages: 0,
          scheduledMessages: 0,
          customFields: 0,
        }

  return (
    <DataSettings
      contentCounts={contentCounts}
      lastBackupAt={heartbeat?.at ?? null}
      workshopName={org?.name ?? ''}
      isOwner={isOwner}
      hasSampleData={hasSampleData}
    />
  )
}
