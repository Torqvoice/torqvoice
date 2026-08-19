import { notFound } from 'next/navigation'
import { getCachedMembership, getCachedSession } from '@/lib/cached-session'
import { getTireHotelSettings } from '@/features/tire-hotel/Lib/tireHotelSettings'
import { getTireSet } from '@/features/tire-hotel/Actions/tireSetActions'
import { getLocationOptions } from '@/features/tire-hotel/Actions/storageActions'
import { getSettings } from '@/features/settings/Actions/settingsActions'
import { SETTING_KEYS } from '@/features/settings/Schema/settingsSchema'
import { PageHeader } from '@/components/page-header'
import { TireSetClient } from './tire-set-client'

export default async function TireSetPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getCachedSession()
  const membership = session?.user?.id ? await getCachedMembership(session.user.id) : null
  const organizationId = membership?.organizationId ?? ''

  const config = await getTireHotelSettings(organizationId)
  if (!config.enabled) notFound()

  const { id } = await params

  const [setResult, locationResult, unitResult] = await Promise.all([
    getTireSet(id),
    getLocationOptions(),
    getSettings([SETTING_KEYS.UNIT_SYSTEM]),
  ])

  if (!setResult.success || !setResult.data) notFound()

  const locations = locationResult.success && locationResult.data ? locationResult.data : []
  const imperial = unitResult.success && unitResult.data?.[SETTING_KEYS.UNIT_SYSTEM] === 'imperial'

  return (
    <>
      <PageHeader />
      <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
        <TireSetClient set={setResult.data} locations={locations} imperial={imperial} />
      </div>
    </>
  )
}
