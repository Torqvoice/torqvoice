import { stampServerRender } from '@/components/infinite-list/server-render'
import { notFound } from 'next/navigation'
import { db } from '@/lib/db'
import { getCachedMembership, getCachedSession } from '@/lib/cached-session'
import { getTireHotelSettings } from '@/features/tire-hotel/Lib/tireHotelSettings'
import { getLocationOptions } from '@/features/tire-hotel/Actions/storageActions'
import { getTireSetRows } from '@/features/tire-hotel/Actions/getTireSetRows'
import { getDisplaySettings } from '@/features/settings/Actions/settingsActions'
import { SETTING_KEYS } from '@/features/settings/Schema/settingsSchema'
import { totalFree as sumFree } from '@/features/tire-hotel/Lib/capacity'
import { PageHeader } from '@/components/page-header'
import { ListPage } from '@/components/list-page'
import { TireHotelClient } from './tire-hotel-client'
import { pageTitle } from '@/lib/page-title'

export function generateMetadata() {
  return pageTitle('tireHotel')
}

export default async function TireHotelPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const session = await getCachedSession()
  const membership = session?.user?.id ? await getCachedMembership(session.user.id) : null
  const organizationId = membership?.organizationId ?? ''

  const config = await getTireHotelSettings(organizationId)
  if (!config.enabled) notFound()

  const params = await searchParams
  const single = (key: string) => {
    const value = params[key]
    return Array.isArray(value) ? value[0] : value
  }

  const search = single('search') ?? ''
  const status = single('status') ?? 'all'
  const sortBy = single('sortBy')
  const sortOrder = single('sortOrder') === 'asc' ? 'asc' : 'desc'

  const [listResult, locationResult, unitResult, vehicles] = await Promise.all([
    // The first batch; the rest load through the same action as the list
    // scrolls. An old ?page= link is simply ignored.
    getTireSetRows({ search, status, sortBy, sortOrder }),
    getLocationOptions(),
    getDisplaySettings([SETTING_KEYS.UNIT_SYSTEM]),
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
        // The owner travels with the car, because the check-in form derives
        // the customer from the vehicle and has to be able to show who it is.
        customer: { select: { id: true, name: true } },
      },
    }),
  ])

  const data =
    listResult.success && listResult.data
      ? listResult.data
      : { rows: [], nextCursor: null, total: 0, statusCounts: {} }

  const locations = locationResult.success && locationResult.data ? locationResult.data : []
  const imperial = unitResult.success && unitResult.data?.[SETTING_KEYS.UNIT_SYSTEM] === 'imperial'

  return (
    <>
      <PageHeader />
      <ListPage>
        <TireHotelClient
          data={stampServerRender(data)}
          listScope={organizationId}
          locations={locations}
          vehicles={vehicles}
          imperial={imperial}
          thresholds={{
            summerReplace: config.summerReplaceMm,
            winterReplace: config.winterReplaceMm,
            warnMargin: 1,
          }}
          search={search}
          statusFilter={status}
          sortBy={sortBy ?? ''}
          sortOrder={sortOrder}
          totalFree={sumFree(locations)}
        />
      </ListPage>
    </>
  )
}
