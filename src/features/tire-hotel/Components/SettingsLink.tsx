'use client'

import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { Settings2 } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * A way back to the setting behind a number on screen.
 *
 * Prices, limits and defaults all come from somewhere, and the moment a
 * shop notices one is wrong is the moment they are looking at it, not the
 * moment they happen to be in settings. Every place the tire hotel shows a
 * figure it did not ask for should say where it came from.
 *
 * Renders nothing without permission to change settings. A link that only
 * leads to a redirect reads as the app being broken rather than as a
 * permission somebody does not have.
 */
export function SettingsLink({
  can,
  href = '/settings/tire-hotel',
  labelKey = 'settings.change',
  className,
}: {
  can: boolean
  href?: string
  /** Key under the tireHotel namespace, for wording that fits the context. */
  labelKey?: string
  className?: string
}) {
  const t = useTranslations('tireHotel')
  if (!can) return null

  return (
    <Link
      href={href}
      className={cn(
        'inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground',
        className
      )}
    >
      <Settings2 className="h-3 w-3" />
      {t(labelKey)}
    </Link>
  )
}
