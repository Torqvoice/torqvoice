'use client'

import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { Disc3 } from 'lucide-react'

export type VehicleTireSet = {
  id: string
  season: string
  status: string
  location: { code: string } | null
}

/**
 * Whether this vehicle has tires on a shelf, as one item in the vehicle's
 * meta row alongside the service count and the spend.
 *
 * Deliberately not a panel. Someone opening a vehicle is after its history;
 * the tire question is worth answering in passing, not worth a block of its
 * own competing with the page. Anyone who wants the shelf, the condition or
 * the prep follows the link and gets all of it.
 *
 * Renders nothing when the vehicle has no tires in storage, which is most of
 * them, so the row does not grow a permanent zero.
 */
export function VehicleTireSets({ sets }: { sets: VehicleTireSet[] }) {
  const t = useTranslations('tireHotel')

  // Released sets are history. The question here is what is on a shelf now.
  const stored = sets.filter((set) => set.status === 'stored')
  if (stored.length === 0) return null

  // One set goes straight to it. Several would land on an arbitrary one, so
  // they go to the list instead.
  const href = stored.length === 1 ? `/tire-hotel/${stored[0].id}` : '/tire-hotel'

  return (
    <Link
      href={href}
      className="flex items-center gap-1.5 text-muted-foreground transition-colors hover:text-foreground"
    >
      <Disc3 className="h-3.5 w-3.5" />
      <span className="font-semibold text-foreground">{stored.length}</span>
      <span className="text-xs">
        {/* The shelf is the useful half when there is only one, and it fits
            in the space the label would have taken anyway. */}
        {stored.length === 1 && stored[0].location
          ? t('vehicle.oneOnShelf', { code: stored[0].location.code })
          : t('vehicle.inStorage')}
      </span>
    </Link>
  )
}
