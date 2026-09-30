'use client'

import { useTranslations } from 'next-intl'
import { History } from 'lucide-react'
import { AppCard } from '@/components/app-card'
import { useFormatCurrency } from '@/components/currency-settings-context'
import { useFormatDate } from '@/lib/use-format-date'
import type { ServiceDetail } from '../../service-detail/types'

interface ActivityCardProps {
  record: ServiceDetail
  currencyCode: string
  notificationHistory: {
    id: string
    body: string
    status: string
    createdAt: string
    toNumber: string
  }[]
}

/**
 * What has happened on the job that involved the customer, newest first: the
 * messages sent, the link shared and opened, the payments taken. Every line
 * is something the record already stores; there is no audit log behind this,
 * so it does not pretend to list edits.
 */
export function ActivityCard({ record, currencyCode, notificationHistory }: ActivityCardProps) {
  const t = useTranslations('service')
  const { formatDateTime, formatDate } = useFormatDate()
  const formatCurrency = useFormatCurrency()

  const items: { key: string; at: Date; text: string; detail?: string; dateOnly?: boolean }[] = []

  for (const n of notificationHistory) {
    items.push({
      key: `sms-${n.id}`,
      at: new Date(n.createdAt),
      text: t('modern.activity.messageSent'),
      detail: n.body,
    })
  }
  // When the job reached the workshop's own status it carries now ("Ready for
  // pickup"). Only the current one: nothing records the ones before it.
  if (record.customStatus && record.customStatusSince) {
    items.push({
      key: 'custom-status',
      at: new Date(record.customStatusSince),
      text: t('modern.activity.statusSet', { status: record.customStatus.name }),
    })
  }
  if (record.sharedAt) {
    items.push({
      key: 'shared',
      at: new Date(record.sharedAt),
      text: t('modern.activity.linkShared'),
    })
  }
  if (record.lastViewedAt && record.viewCount > 0) {
    items.push({
      key: 'viewed',
      at: new Date(record.lastViewedAt),
      text: t('modern.activity.linkViewed', { count: record.viewCount }),
    })
  }
  for (const p of record.payments ?? []) {
    items.push({
      key: `pay-${p.id}`,
      at: new Date(p.date),
      text: t('modern.activity.paymentTaken', {
        amount: formatCurrency(p.amount, currencyCode),
      }),
      // A payment is dated, not timed.
      dateOnly: true,
    })
  }

  if (items.length === 0) return null

  items.sort((a, b) => b.at.getTime() - a.at.getTime())

  return (
    <AppCard icon={History} title={t('modern.activity.title')}>
      <ol className="space-y-3">
        {items.map((item) => (
          <li key={item.key} className="grid grid-cols-[10px_minmax(0,1fr)] items-start gap-3">
            <span className="mt-1.5 h-2 w-2 rounded-full bg-muted-foreground/40" />
            <span className="min-w-0">
              <span className="block text-[13px]">{item.text}</span>
              {item.detail && (
                <span className="block truncate text-xs text-muted-foreground">{item.detail}</span>
              )}
              <span className="block text-xs text-muted-foreground" suppressHydrationWarning>
                {item.dateOnly ? formatDate(item.at) : formatDateTime(item.at)}
              </span>
            </span>
          </li>
        ))}
      </ol>
    </AppCard>
  )
}
