import { notFound } from 'next/navigation'
import { db } from '@/lib/db'
import { getCachedMembership, getCachedSession } from '@/lib/cached-session'
import { getTireHotelSettings } from '@/features/tire-hotel/Lib/tireHotelSettings'
import { getLocationOptions } from '@/features/tire-hotel/Actions/storageActions'
import { getTireSetsPaginated } from '@/features/tire-hotel/Actions/tireSetActions'
import { getSettings } from '@/features/settings/Actions/settingsActions'
import { SETTING_KEYS } from '@/features/settings/Schema/settingsSchema'
import { totalFree as sumFree } from '@/features/tire-hotel/Lib/capacity'
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
    <TireHotelClient
      data={data}
      locations={locations}
      vehicles={vehicles}
      imperial={imperial}
      search={search}
      statusFilter={status}
      totalFree={sumFree(locations)}
    />
  )
}
