'use client'

import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Megaphone } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { interactiveRow } from '@/lib/interactive-row'
import { useFormatDate } from '@/lib/use-format-date'

export interface CampaignListItem {
  id: string
  createdAt: string
  windowDays: number
  channel: string
  status: string
  recipients: number
  sent: number
  failed: number
  booked: number
}

/** Past campaigns, newest first, each opening its per-row status page. */
export function CampaignList({ campaigns }: { campaigns: CampaignListItem[] }) {
  const t = useTranslations('vehicles.inspectionReminders')
  const { formatDateTime } = useFormatDate()
  const router = useRouter()
  if (campaigns.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center text-sm text-muted-foreground">
        <Megaphone className="h-6 w-6" />
        <p>{t('campaign.none')}</p>
        <button
          type="button"
          className="text-primary underline-offset-4 hover:underline"
          onClick={() => router.push('/vehicles/inspection-reminders')}
        >
          {t('campaign.start')}
        </button>
      </div>
    )
  }
  return (
    <div className="flex-1 divide-y overflow-auto">
      {campaigns.map((c) => (
        <div
          key={c.id}
          className="flex cursor-pointer flex-wrap items-center gap-3 px-4 py-3 text-sm hover:bg-muted/50"
          {...interactiveRow(() => router.push(`/vehicles/inspection-reminders/${c.id}`))}
        >
          <span className="min-w-0 flex-1">
            <span className="font-medium">{formatDateTime(c.createdAt)}</span>
            <span className="ml-2 text-muted-foreground">
              {t('campaign.summary', { channel: t(`channels.${c.channel}`), window: c.windowDays })}
            </span>
          </span>
          <Badge variant="secondary">
            {t('campaign.recipientsCount', { count: c.recipients })}
          </Badge>
          {c.failed > 0 && (
            <Badge variant="outline" className="border-destructive/30 text-destructive">
              {t('campaign.failedCount', { count: c.failed })}
            </Badge>
          )}
          {c.booked > 0 && (
            <Badge className="bg-emerald-500/15 text-emerald-700 border-emerald-500/20 dark:text-emerald-400">
              {t('campaign.bookedCount', { count: c.booked })}
            </Badge>
          )}
        </div>
      ))}
    </div>
  )
}
