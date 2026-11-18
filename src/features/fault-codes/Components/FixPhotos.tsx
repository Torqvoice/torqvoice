'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { MediaLightbox } from '@/features/inspections/Components/MediaLightbox'
import type { FixPhoto } from '../Lib/types'

/** Where the app serves a shared fix's photo from the code service. */
export function fixPhotoUrl(id: string, n: number, size: 'full' | 'thumb' = 'full'): string {
  const base = `/api/protected/fault-codes/fixes/${encodeURIComponent(id)}/photos/${n}`
  return size === 'thumb' ? `${base}?size=thumb` : base
}

/** "2014 Volkswagen Golf · CAXA", or null when the fix names no vehicle. */
export function fixVehicleLine(
  vehicle: {
    make?: string | null
    model?: string | null
    year?: number | null
    engine?: string | null
  } | null
): string | null {
  if (!vehicle) return null
  const name = [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(' ')
  const line = [name, vehicle.engine].filter(Boolean).join(' · ')
  return line || null
}

/** A fix's photos as small thumbnails; a tap opens them full size. */
export function FixPhotos({ fixId, photos }: { fixId: string; photos: FixPhoto[] }) {
  const t = useTranslations('faultCodes.fixes')
  const [open, setOpen] = useState<number | null>(null)
  if (photos.length === 0) return null
  const images = photos.map((p, i) => ({
    url: fixPhotoUrl(fixId, p.n),
    caption: t('photo', { n: i + 1, count: photos.length }),
  }))
  return (
    <>
      <ul className="flex flex-wrap gap-2">
        {photos.map((p, i) => (
          <li key={p.n}>
            <button
              type="button"
              onClick={() => setOpen(i)}
              className="block overflow-hidden rounded-md border border-card-edge bg-muted transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label={t('openPhoto', { n: i + 1 })}
            >
              <img
                src={fixPhotoUrl(fixId, p.n, 'thumb')}
                alt=""
                loading="lazy"
                width={p.width}
                height={p.height}
                className="size-16 object-cover sm:size-20"
              />
            </button>
          </li>
        ))}
      </ul>
      <MediaLightbox
        images={images}
        index={open}
        onClose={() => setOpen(null)}
        onNavigate={setOpen}
      />
    </>
  )
}
