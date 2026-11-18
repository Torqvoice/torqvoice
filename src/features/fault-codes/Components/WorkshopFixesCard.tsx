'use client'

import { useLocale, useTranslations } from 'next-intl'
import { Users } from 'lucide-react'
import { AppCard } from '@/components/app-card'
import { useServiceType } from '@/components/service-type-context'
import { useFormatDate } from '@/lib/use-format-date'
import type { SharedFix } from '../Lib/types'
import { FixText } from './FixText'
import { FixPhotos, fixVehicleLine } from './FixPhotos'

/** "Norwegian" for nb, in the reader's language; null when it is the reader's own. */
function languageName(lang: string, locale: string): string | null {
  if (lang.toLowerCase() === locale.toLowerCase()) return null
  try {
    return new Intl.DisplayNames([locale], { type: 'language' }).of(lang) ?? null
  } catch {
    return null
  }
}

/**
 * "Fixes from other workshops": what fixed this code elsewhere, as a person
 * at Torqvoice published it, newest first. Each shows the vehicle, the text,
 * the photos and when it was shared, and never which workshop sent it.
 */
export function WorkshopFixesCard({
  code,
  label = code,
  meaning = null,
  fixes: allFixes,
  available,
}: {
  code: string
  /** The code as people read it ("BMW 283700"); the code itself otherwise. */
  label?: string
  /** For a make's own code, the meaning on screen: only its fixes, and those for the code as a whole. */
  meaning?: string | null
  fixes: SharedFix[]
  available: boolean
}) {
  const fixes = meaning
    ? allFixes.filter((f) => f.meaning === null || f.meaning === meaning)
    : allFixes
  const t = useTranslations('faultCodes.fixes')
  const locale = useLocale()
  const isMarine = useServiceType() === 'marine'
  const { formatDate } = useFormatDate()

  return (
    <AppCard
      icon={Users}
      title={t('title')}
      badge={fixes.length > 0 ? fixes.length : undefined}
      contentClassName={fixes.length > 0 ? 'p-0 py-1' : 'space-y-3'}
    >
      {!available ? (
        <p className="text-sm text-muted-foreground">{t('unavailable')}</p>
      ) : fixes.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('empty', { code: label })}</p>
      ) : (
        <ul className="divide-y divide-card-edge/60">
          {fixes.map((fix) => {
            const vehicle = fixVehicleLine(fix.vehicle)
            const language = languageName(fix.lang, locale)
            return (
              <li key={fix.id} className="space-y-2 px-5 py-4">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <span className="text-sm font-medium">
                    {vehicle ?? (isMarine ? t('unknownVehicleMarine') : t('unknownVehicle'))}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {t('sharedOn', { date: formatDate(fix.createdAt) })}
                  </span>
                </div>
                <FixText text={fix.text} />
                {language && (
                  <p className="text-xs text-muted-foreground">{t('writtenIn', { language })}</p>
                )}
                <FixPhotos fixId={fix.id} photos={fix.photos} />
              </li>
            )
          })}
        </ul>
      )}
    </AppCard>
  )
}
