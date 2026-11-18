'use client'

import { statusBadgeClass } from '@/lib/status-colors'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { AppCard } from '@/components/app-card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useFormatDate } from '@/lib/use-format-date'
import { useFormatCurrency } from '@/components/currency-settings-context'
import { cn } from '@/lib/utils'
import { ClipboardList, FileText, Wrench } from 'lucide-react'

export type TireJobs = {
  quotes: {
    id: string
    quoteNumber: string | null
    status: string
    totalAmount: number
    createdAt: Date
    convertedToId: string | null
  }[]
  workOrders: {
    id: string
    invoiceNumber: string | null
    status: string
    totalAmount: number
    serviceDate: Date
    vehicleId: string | null
  }[]
}

/**
 * Selling and fitting a new set, from the set that is already here.
 *
 * Both routes are offered side by side because both are normal. A customer
 * asking what it would cost gets a quote; one who has already said yes gets
 * the job straight on the board, and making them sit through a quote first
 * would be a step invented by the software rather than the shop.
 *
 * Anything already raised is listed with its state, so a follow-up next week
 * starts from what happened rather than from nothing.
 */
export function TireJobsCard({
  jobs,
  hasVehicle,
  hasCustomer,
  currencyCode,
  onCreate,
}: {
  tireSetId: string
  jobs: TireJobs
  hasVehicle: boolean
  hasCustomer: boolean
  currencyCode: string
  onCreate: (mode: 'quote' | 'workOrder') => void
}) {
  const t = useTranslations('tireHotel')
  const { formatDate } = useFormatDate()
  const formatCurrency = useFormatCurrency()

  const empty = jobs.quotes.length === 0 && jobs.workOrders.length === 0

  return (
    <AppCard icon={Wrench} title={t('job.cardTitle')} contentClassName="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={() => onCreate('quote')}>
          <FileText className="mr-1.5 h-3.5 w-3.5" />
          {t('job.quote')}
        </Button>
        {/* Named for what it will actually produce. A set with no vehicle
            still gets billed, it just cannot hang off a car. */}
        <Button
          size="sm"
          variant="outline"
          onClick={() => onCreate('workOrder')}
          disabled={!hasVehicle && !hasCustomer}
          title={hasVehicle || hasCustomer ? undefined : t('job.needsCustomer')}
        >
          <ClipboardList className="mr-1.5 h-3.5 w-3.5" />
          {hasVehicle ? t('job.workOrder') : t('job.targetInvoice')}
        </Button>
      </div>

      {empty ? (
        <p className="text-sm text-muted-foreground">{t('job.none')}</p>
      ) : (
        <ul className="space-y-1.5">
          {jobs.quotes.map((quote) => (
            <li
              key={quote.id}
              className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border p-2 text-sm"
            >
              <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <Link
                href={`/quotes/${quote.id}`}
                className="min-w-0 flex-1 truncate font-medium text-primary hover:underline"
              >
                {quote.quoteNumber ?? t('job.quote')}
              </Link>
              <span className="shrink-0 text-xs text-muted-foreground">
                {formatDate(new Date(quote.createdAt))}
              </span>
              <span className="shrink-0 tabular-nums">
                {formatCurrency(quote.totalAmount, currencyCode)}
              </span>
              <Badge
                variant="outline"
                className={cn('shrink-0 text-[10px]', statusBadgeClass('quote', quote.status))}
              >
                {/* Converted beats the stored status: once it is a job, that
                    is the more useful thing to know about it. */}
                {quote.convertedToId ? t('job.converted') : quote.status}
              </Badge>
            </li>
          ))}

          {jobs.workOrders.map((order) => (
            <li
              key={order.id}
              className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border p-2 text-sm"
            >
              <ClipboardList className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <Link
                href={
                  order.vehicleId
                    ? `/vehicles/${order.vehicleId}/service/${order.id}`
                    : `/sales/${order.id}`
                }
                className="min-w-0 flex-1 truncate font-medium text-primary hover:underline"
              >
                {order.invoiceNumber ?? t('job.workOrder')}
              </Link>
              <span className="shrink-0 text-xs text-muted-foreground">
                {formatDate(new Date(order.serviceDate))}
              </span>
              <span className="shrink-0 tabular-nums">
                {formatCurrency(order.totalAmount, currencyCode)}
              </span>
              <Badge
                variant="outline"
                className={cn('shrink-0 text-[10px]', statusBadgeClass('workOrder', order.status))}
              >
                {order.status}
              </Badge>
            </li>
          ))}
        </ul>
      )}
    </AppCard>
  )
}
