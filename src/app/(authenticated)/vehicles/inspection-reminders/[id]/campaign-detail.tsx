'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { Loader2, RotateCcw } from 'lucide-react'
import { AppCard } from '@/components/app-card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { TableCellLink } from '@/components/table-cell-link'
import {
  getInspectionReminderCampaign,
  retryFailedInspectionReminders,
} from '@/features/inspection-reminders/Actions/inspectionReminderActions'
import { useFormatDate } from '@/lib/use-format-date'

type Campaign = NonNullable<Awaited<ReturnType<typeof getInspectionReminderCampaign>>['data']>

const STATUS_CLASS: Record<string, string> = {
  sent: 'border-emerald-500/30 text-emerald-600',
  failed: 'border-destructive/30 text-destructive',
  scheduled: '',
  cancelled: 'text-muted-foreground',
}

export function CampaignDetail({ campaign }: { campaign: Campaign }) {
  const t = useTranslations('vehicles.inspectionReminders.campaign')
  const tc = useTranslations('vehicles.inspectionReminders')
  const { formatDate, formatDateTime } = useFormatDate()
  const router = useRouter()
  const [busy, setBusy] = useState(false)

  const failed = campaign.sends.filter((s) => s.scheduledMessage?.status === 'failed').length
  const sent = campaign.sends.filter((s) => s.scheduledMessage?.status === 'sent').length
  const booked = campaign.sends.filter((s) => s.bookedAt && !s.cancelledAt).length

  const retry = async () => {
    setBusy(true)
    const result = await retryFailedInspectionReminders(campaign.id)
    setBusy(false)
    if (!result.success || !result.data) toast.error(result.error ?? t('retryFailed'))
    else {
      toast.success(t('retried', { count: result.data.retried }))
      router.refresh()
    }
  }

  return (
    <div className="space-y-4">
      <AppCard
        title={t('title', { date: formatDateTime(campaign.createdAt) })}
        description={t('summary', {
          channel: tc(`channels.${campaign.channel}`),
          window: campaign.windowDays,
        })}
        contentClassName="space-y-4"
      >
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            [t('recipients'), campaign.recipientCount],
            [t('sent'), sent],
            [t('failed'), failed],
            [t('booked'), booked],
          ].map(([label, value]) => (
            <div key={String(label)} className="rounded-lg border p-3">
              <p className="text-lg font-semibold tabular-nums">{value}</p>
              <p className="text-xs text-muted-foreground">{label}</p>
            </div>
          ))}
        </div>
        <div className="rounded-lg border bg-muted/30 p-3 text-sm">
          {campaign.subject && <p className="font-medium">{campaign.subject}</p>}
          <p className="whitespace-pre-wrap">{campaign.body}</p>
        </div>
        {failed > 0 && (
          <Button variant="outline" size="sm" onClick={retry} disabled={busy}>
            {busy ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
            )}
            {t('retryFailedButton', { count: failed })}
          </Button>
        )}
      </AppCard>

      <AppCard title={t('rows')} contentClassName="p-0">
        <div className="divide-y">
          {campaign.sends.map((s) => {
            const status = s.scheduledMessage?.status ?? 'scheduled'
            return (
              <div key={s.id} className="flex flex-wrap items-center gap-3 px-5 py-2.5 text-sm">
                <span className="min-w-0 flex-1 truncate">
                  <TableCellLink href={`/vehicles/${s.vehicle.id}`}>
                    {s.vehicle.year} {s.vehicle.make} {s.vehicle.model}
                  </TableCellLink>
                  {s.vehicle.licensePlate && (
                    <span className="ml-2 font-mono text-xs text-muted-foreground">
                      {s.vehicle.licensePlate}
                    </span>
                  )}
                  <span className="ml-2 text-muted-foreground">{s.customer.name}</span>
                </span>
                <span className="hidden font-mono text-xs text-muted-foreground md:inline">
                  {s.recipient}
                </span>
                <span className="text-xs text-muted-foreground">{formatDate(s.dueAt)}</span>
                <Badge variant="outline" className={`text-[11px] ${STATUS_CLASS[status] ?? ''}`}>
                  {t(`status.${status}`)}
                </Badge>
                {s.bookedAt && !s.cancelledAt && (
                  <Badge className="bg-emerald-500/15 text-emerald-700 border-emerald-500/20 text-[11px] dark:text-emerald-400">
                    {s.bookedServiceRecordId
                      ? t('bookedOn', { date: formatDate(s.bookedAt) })
                      : t('requestedOn', { date: formatDate(s.bookedAt) })}
                  </Badge>
                )}
                {s.cancelledAt && (
                  <Badge variant="outline" className="text-[11px] text-muted-foreground">
                    {t('cancelledOn', { date: formatDate(s.cancelledAt) })}
                  </Badge>
                )}
                {s.scheduledMessage?.errorMessage && (
                  <span className="w-full truncate text-xs text-destructive">
                    {s.scheduledMessage.errorMessage}
                  </span>
                )}
              </div>
            )
          })}
        </div>
      </AppCard>
    </div>
  )
}
