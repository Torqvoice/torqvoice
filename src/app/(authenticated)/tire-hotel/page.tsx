import { notFound } from 'next/navigation'
import { db } from '@/lib/db'
import { getCachedMembership, getCachedSession } from '@/lib/cached-session'
import { getTireHotelSettings } from '@/features/tire-hotel/Lib/tireHotelSettings'
import { getLocationOptions } from '@/features/tire-hotel/Actions/storageActions'
import { getTireSetsPaginated } from '@/features/tire-hotel/Actions/tireSetActions'
import { getSettings } from '@/features/settings/Actions/settingsActions'
import { SETTING_KEYS } from '@/features/settings/Schema/settingsSchema'
import { totalFree as sumFree } from '@/features/tire-hotel/Lib/capacity'
import { PageHeader } from '@/components/page-header'
import { TireHotelClient } from './tire-hotel-client'

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

  const [listResult, locationResult, unitResult, vehicles] = await Promise.all([
    getTireSetsPaginated({
      page: Number(single('page')) || 1,
      pageSize: Number(single('pageSize')) || 20,
      search,
      status,
      sortBy: single('sortBy'),
      sortOrder: single('sortOrder') === 'asc' ? 'asc' : 'desc',
    }),
    getLocationOptions(),
    getSettings([SETTING_KEYS.UNIT_SYSTEM]),
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
      : { records: [], total: 0, page: 1, pageSize: 20, totalPages: 0, statusCounts: {} }

  const locations = locationResult.success && locationResult.data ? locationResult.data : []
  const imperial = unitResult.success && unitResult.data?.[SETTING_KEYS.UNIT_SYSTEM] === 'imperial'

  return (
    <>
      <PageHeader />
      <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
        <TireHotelClient
          data={data}
          locations={locations}
          vehicles={vehicles}
          imperial={imperial}
          search={search}
          statusFilter={status}
          totalFree={sumFree(locations)}
        />
      </div>
    </>
  )
}
