import { notFound } from 'next/navigation'
import { db } from '@/lib/db'
import { getCachedMembership, getCachedSession } from '@/lib/cached-session'
import { getTireHotelSettings } from '@/features/tire-hotel/Lib/tireHotelSettings'
import { getTireSet } from '@/features/tire-hotel/Actions/tireSetActions'
import { getLocationOptions } from '@/features/tire-hotel/Actions/storageActions'
import { getAgreementsForSet } from '@/features/tire-hotel/Actions/agreementActions'
import { getJobsForSet } from '@/features/tire-hotel/Actions/tireJobActions'
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

  const [setResult, locationResult, agreementResult, jobsResult, settingsResult, vehicles] =
    await Promise.all([
      getTireSet(id),
      getLocationOptions(),
      getAgreementsForSet(id),
      getJobsForSet(id),
      getSettings([
        SETTING_KEYS.UNIT_SYSTEM,
        SETTING_KEYS.CURRENCY_CODE,
        SETTING_KEYS.TIRE_HOTEL_DEFAULT_SEASONAL_PRICE,
        SETTING_KEYS.TIRE_HOTEL_DEFAULT_MONTHLY_PRICE,
      ]),
      db.vehicle.findMany({
        where: { organizationId, isArchived: false },
        orderBy: { updatedAt: 'desc' },
        take: 500,
        select: {
          id: true,
          make: true,
          model: true,
          year: true,
          licensePlate: true,
          customerId: true,
        },
      }),
    ])

  if (!setResult.success || !setResult.data) notFound()

  const locations = locationResult.success && locationResult.data ? locationResult.data : []
  const agreements = agreementResult.success && agreementResult.data ? agreementResult.data : []
  const jobs =
    jobsResult.success && jobsResult.data ? jobsResult.data : { quotes: [], workOrders: [] }
  const settings = settingsResult.success && settingsResult.data ? settingsResult.data : {}
  const imperial = settings[SETTING_KEYS.UNIT_SYSTEM] === 'imperial'
  const billing = {
    seasonalPrice: Number(settings[SETTING_KEYS.TIRE_HOTEL_DEFAULT_SEASONAL_PRICE]) || 0,
    monthlyPrice: Number(settings[SETTING_KEYS.TIRE_HOTEL_DEFAULT_MONTHLY_PRICE]) || 0,
    currency: settings[SETTING_KEYS.CURRENCY_CODE] || 'USD',
  }

  return (
    <>
      <PageHeader />
      <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
        <TireSetClient
          set={setResult.data}
          locations={locations}
          vehicles={vehicles}
          agreements={agreements}
          jobs={jobs}
          billing={billing}
          imperial={imperial}
        />
      </div>
    </>
  )
}
