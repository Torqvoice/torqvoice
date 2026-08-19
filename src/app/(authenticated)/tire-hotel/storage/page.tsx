import { notFound } from 'next/navigation'
import { getCachedMembership, getCachedSession } from '@/lib/cached-session'
import { getTireHotelSettings } from '@/features/tire-hotel/Lib/tireHotelSettings'
import { getStorageOverview } from '@/features/tire-hotel/Actions/storageActions'
import { StorageClient } from './storage-client'

export default async function TireStoragePage() {
  const session = await getCachedSession()
  const membership = session?.user?.id ? await getCachedMembership(session.user.id) : null
  const organizationId = membership?.organizationId ?? ''

  // The module is opt-in, so an org that has not switched it on gets a 404
  // rather than an empty page suggesting something is broken.
  const config = await getTireHotelSettings(organizationId)
  if (!config.enabled) notFound()

  const result = await getStorageOverview()
  const warehouses = result.success && result.data ? result.data : []

  return <StorageClient warehouses={warehouses} defaultCapacity={config.defaultCapacity} />
}
