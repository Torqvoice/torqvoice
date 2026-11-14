'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { useFormatter, useTranslations } from 'next-intl'
import { ClipboardCheck, FileText, History, Paperclip } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { CustomStatusChip, StatusBadge } from '@/components/status-badge'
import { useFormatCurrency } from '@/components/currency-settings-context'
import { useDateSettings } from '@/components/date-settings-context'
import { safeTimeZone, zonedParts } from '@/lib/timezone'
import { useServiceLabels } from '@/features/vehicles/Lib/useServiceLabels'
import { quoteStatusLabel } from '@/features/quotes/Lib/quoteStatus'
import { getWarrantyStatus } from '@/lib/warranty'
import { CopyText } from '@/components/copy-value'
import { cn } from '@/lib/utils'
import type { VehicleJobWarning } from '@/features/vehicles/Lib/vehicleJobWarnings'
import { JobWarningLine } from './job-warning'

export interface FeedWorkOrder {
  id: string
  title: string
  type: string
  status: string
  cost: number
  totalAmount: number
  mileage: number | null
  serviceDate: Date
  startDateTime: Date | null
  invoiceNumber: string | null
  techName: string | null
  warrantyMileage: number | null
  warrantyExpiresAt: Date | null
  _count: { attachments: number }
  laborItems?: { description: string }[]
  partItems?: { name: string }[]
  /** The workshop's own status on the job, shown beside its stage. */
  customStatus?: { name: string; color: string } | null
}

export interface FeedQuote {
  id: string
  quoteNumber: string | null
  title: string
  status: string
  totalAmount: number
  createdAt: Date
}

export interface FeedInspection {
  id: string
  status: string
  createdAt: Date
  completedAt: Date | null
  template: { name: string }
  items: { condition: string }[]
}

export type FeedFilter = 'all' | 'services' | 'quotes' | 'inspections'

type FeedEvent =
  | { kind: 'wo'; id: string; date: Date; wo: FeedWorkOrder }
  | { kind: 'quote'; id: string; date: Date; quote: FeedQuote }
  | { kind: 'inspection'; id: string; date: Date; inspection: FeedInspection }

/** Statuses that mean the car is with the workshop right now. */
const IN_WORKSHOP = new Set(['in-progress', 'in_progress', 'waiting-parts', 'waiting_parts'])

/** Where an open job sorts: in the workshop, then booked, then not yet booked. */
function openRank(status: string) {
  if (IN_WORKSHOP.has(status)) return 0
  if (status === 'scheduled') return 1
  return 2
}

/** When the car is in: the booked start, else the day the job was made. */
const visitDate = (wo: FeedWorkOrder) => new Date(wo.startDateTime ?? wo.serviceDate)
const woTotal = (wo: FeedWorkOrder) => (wo.totalAmount > 0 ? wo.totalAmount : wo.cost)

const SHOWN_AT_FIRST = 30
const NOTHING_OWED: Record<string, 'unpaid' | 'partial'> = {}
const OPEN_AT_FIRST = 6

/**
 * What was done on a job, from its first labour and part lines, so the list
 * answers "when was the oil changed" without anybody opening the job.
 */
function workDone(wo: FeedWorkOrder) {
  const lines = [
    ...(wo.laborItems ?? []).map((l) => l.description),
    ...(wo.partItems ?? []).map((p) => p.name),
  ]
    .map((line) => line.trim())
    .filter((line) => line && line !== wo.title)
  return [...new Set(lines)].join(' · ')
}

/**
 * The vehicle's work as one table. First every job that is not finished, the
 * ones in the workshop on top, each with its status and any booking problem
 * on its own row. Then what has been done, newest first and grouped by year,
 * with quotes and inspections in among the work orders. Every row says what
 * the job was, what was done on it, who did it, the reading and the amount.
 */
export function VehicleActivityFeed({
  vehicleId,
  filter,
  search,
  workOrders,
  quotes,
  inspections,
  distUnit,
  readingLabel,
  currencyCode,
  vehicleMileage,
  jobWarnings = [],
  owed = NOTHING_OWED,
}: {
  vehicleId: string
  filter: FeedFilter
  /** What the history is narrowed to; work orders arrive already searched. */
  search: string
  workOrders: FeedWorkOrder[]
  quotes: FeedQuote[]
  inspections: FeedInspection[]
  distUnit: string
  /** The heading over the readings: mileage for a car, engine hours for a boat. */
  readingLabel: string
  currencyCode: string
  vehicleMileage: number
  /** Booking problems on open jobs, spelled out under the job's own line. */
  jobWarnings?: VehicleJobWarning[]
  /** Jobs the customer has been billed for and has not paid in full, by id. */
  owed?: Record<string, 'unpaid' | 'partial'>
}) {
  const t = useTranslations('vehicles.detail.feed')
  const tQuoteStatus = useTranslations('quotes.statusLabels')
  const tServices = useTranslations('vehicles.services')
  const tHeader = useTranslations('service.header')
  const tInspections = useTranslations('inspections.list')
  const serviceLabel = useServiceLabels()
  const formatCurrency = useFormatCurrency()
  const numberFormat = useFormatter()
  // Days and years are the workshop's, on the server and in the browser
  // alike: a job at half past midnight Oslo time is on that day whichever
  // machine draws the row, and the two never disagree about it.
  const timeZone = safeTimeZone(useDateSettings().timezone)
  const [showAll, setShowAll] = useState(false)
  const [showAllOpen, setShowAllOpen] = useState(false)
  const warningFor = useMemo(
    () => new Map(jobWarnings.map((w) => [w.serviceRecordId, w])),
    [jobWarnings]
  )

  const { open, events, years } = useMemo(() => {
    const needle = search.trim().toLowerCase()
    const matches = (text: string | null | undefined) =>
      !needle || (text ?? '').toLowerCase().includes(needle)
    const withJobs = filter === 'all' || filter === 'services'

    // In the workshop and booked jobs in the order they happen; jobs with no
    // slot yet after them, the newest first.
    const openJobs = workOrders
      .filter((wo) => wo.status !== 'completed')
      .sort((a, b) => {
        const rank = openRank(a.status) - openRank(b.status)
        if (rank !== 0) return rank
        const order = +visitDate(a) - +visitDate(b)
        return openRank(a.status) === 2 ? -order : order
      })

    const list: FeedEvent[] = []
    if (withJobs) {
      for (const wo of workOrders) {
        if (wo.status === 'completed') list.push({ kind: 'wo', id: wo.id, date: visitDate(wo), wo })
      }
    }
    if (filter === 'all' || filter === 'quotes') {
      for (const quote of quotes) {
        if (matches(quote.title) || matches(quote.quoteNumber))
          list.push({ kind: 'quote', id: quote.id, date: new Date(quote.createdAt), quote })
      }
    }
    if (filter === 'all' || filter === 'inspections') {
      for (const inspection of inspections) {
        if (matches(inspection.template.name))
          list.push({
            kind: 'inspection',
            id: inspection.id,
            date: new Date(inspection.completedAt ?? inspection.createdAt),
            inspection,
          })
      }
    }
    list.sort((a, b) => +b.date - +a.date)

    // Per year: how many finished visits and what they came to, over the
    // whole year, not only the part of it on screen.
    const perYear = new Map<number, { visits: number; total: number }>()
    for (const wo of workOrders) {
      if (wo.status !== 'completed') continue
      const year = zonedParts(visitDate(wo), timeZone).year
      const entry = perYear.get(year) ?? { visits: 0, total: 0 }
      entry.visits += 1
      entry.total += woTotal(wo)
      perYear.set(year, entry)
    }

    return { open: withJobs ? openJobs : [], events: list, years: perYear }
  }, [filter, search, workOrders, quotes, inspections, timeZone])

  const shownOpen = showAllOpen ? open : open.slice(0, OPEN_AT_FIRST)
  const shown = showAll ? events : events.slice(0, SHOWN_AT_FIRST)
  const groups: { year: number; items: FeedEvent[] }[] = []
  for (const event of shown) {
    const year = zonedParts(event.date, timeZone).year
    const last = groups[groups.length - 1]
    if (last?.year === year) last.items.push(event)
    else groups.push({ year, items: [event] })
  }

  const dayMonth = (date: Date) =>
    numberFormat.dateTime(date, { day: 'numeric', month: 'short', timeZone })
  const reading = (km: number | null) => (km ? `${numberFormat.number(km)} ${distUnit}` : null)
  const money = (amount: number) => (amount > 0 ? formatCurrency(amount, currencyCode) : null)

  if (open.length === 0 && events.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed px-6 py-16 text-center">
        <History className="h-8 w-8 text-muted-foreground/60" />
        <p className="text-sm text-muted-foreground">{search ? t('noMatches') : t('empty')}</p>
      </div>
    )
  }

  const jobRow = (wo: FeedWorkOrder, isOpen: boolean) => {
    const href = `/vehicles/${vehicleId}/service/${wo.id}`
    const summary = wo.laborItems?.[0]?.description
    const warning = isOpen ? warningFor.get(wo.id) : undefined
    const warranty = getWarrantyStatus(
      wo.warrantyExpiresAt,
      wo.warrantyMileage,
      wo.mileage,
      vehicleMileage
    )
    const debt = owed[wo.id]
    return (
      <Row
        key={wo.id}
        date={dayMonth(visitDate(wo))}
        href={href}
        title={wo.title}
        number={wo.invoiceNumber}
        attachments={wo._count.attachments}
        detail={
          <>
            {debt && (
              <span className="font-medium text-destructive">
                {debt === 'partial' ? t('partlyPaid') : tHeader('unpaid')}
              </span>
            )}
            {/* What is owed is said whatever else is: with several bills out,
                the row is the only place that says which. A booking problem
                takes the place of what was done, not of the debt. */}
            {warning ? (
              <JobWarningLine warning={warning} href={href} />
            ) : (
              workDone(wo) || (summary && summary !== wo.title ? summary : null)
            )}
          </>
        }
        hasDetail={Boolean(warning || debt || workDone(wo))}
        extra={
          (warranty === 'active' || warranty === 'expiring') && (
            <span className="shrink-0 rounded bg-emerald-500/10 px-1.5 py-px text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">
              {tServices(`warranty.status.${warranty}`)}
            </span>
          )
        }
        status={
          <>
            <StatusBadge kind="workOrder" status={wo.status}>
              {serviceLabel.status(wo.status)}
            </StatusBadge>
            {wo.customStatus && <CustomStatusChip status={wo.customStatus} />}
          </>
        }
        tech={wo.techName}
        reading={reading(wo.mileage)}
        amount={money(woTotal(wo))}
      />
    )
  }

  return (
    <div className="@container rounded-xl border bg-card pb-1">
      <div
        aria-hidden
        className={cn(
          COLUMNS,
          'hidden border-b px-3 py-2 text-xs font-medium text-muted-foreground sm:px-4 @2xl:grid'
        )}
      >
        <span>{tServices('table.date')}</span>
        <span>{t('colJob')}</span>
        <span>{tServices('table.status')}</span>
        <span className="hidden @4xl:block">{tServices('table.technician')}</span>
        <span className="truncate text-right">{readingLabel}</span>
        <span className="text-right">{tServices('table.total')}</span>
      </div>

      {open.length > 0 && (
        <section aria-label={t('open')}>
          <GroupHeading label={t('open')} meta={String(open.length)} />
          <ol className="divide-y divide-border/70 px-1 sm:px-2">
            {shownOpen.map((wo) => jobRow(wo, true))}
          </ol>
          {!showAllOpen && open.length > OPEN_AT_FIRST && (
            <div className="border-t border-border/70 px-3 py-1.5 sm:px-4">
              <Button
                size="sm"
                variant="ghost"
                className="-ml-2 h-7 text-[12.5px] text-muted-foreground"
                onClick={() => setShowAllOpen(true)}
              >
                {t('showMoreOpen', { count: open.length - OPEN_AT_FIRST })}
              </Button>
            </div>
          )}
        </section>
      )}

      {groups.map((group) => {
        const totals = years.get(group.year)
        return (
          <section key={group.year} aria-label={String(group.year)}>
            <GroupHeading
              label={String(group.year)}
              meta={
                totals
                  ? t('yearSummary', {
                      count: totals.visits,
                      total: formatCurrency(totals.total, currencyCode),
                    })
                  : undefined
              }
            />
            <ol className="divide-y divide-border/70 px-1 sm:px-2">
              {group.items.map((event) => {
                if (event.kind === 'wo') return jobRow(event.wo, false)
                if (event.kind === 'quote') {
                  const q = event.quote
                  return (
                    <Row
                      key={event.id}
                      date={dayMonth(event.date)}
                      icon={<FileText className="h-3.5 w-3.5 text-amber-700 dark:text-amber-400" />}
                      kind={t('quote')}
                      href={`/quotes/${q.id}`}
                      title={q.title}
                      number={q.quoteNumber}
                      status={
                        <StatusBadge kind="quote" status={q.status}>
                          {quoteStatusLabel(q.status, tQuoteStatus)}
                        </StatusBadge>
                      }
                      amount={money(q.totalAmount)}
                    />
                  )
                }
                const insp = event.inspection
                const passed = insp.items.filter((i) => i.condition === 'pass').length
                const failed = insp.items.filter((i) => i.condition === 'fail').length
                const done = insp.status === 'completed'
                return (
                  <Row
                    key={event.id}
                    date={dayMonth(event.date)}
                    icon={
                      <ClipboardCheck className="h-3.5 w-3.5 text-teal-700 dark:text-teal-400" />
                    }
                    href={`/inspections/${insp.id}`}
                    title={insp.template.name}
                    detail={
                      <>
                        {failed > 0 && (
                          <span className="font-medium text-red-700 dark:text-red-400">
                            {t('inspectionFailed', { count: failed })}
                          </span>
                        )}
                        {(done || passed + failed > 0) && t('inspectionResult', { passed })}
                      </>
                    }
                    hasDetail={done || passed + failed > 0}
                    status={
                      <StatusBadge kind="inspection" status={insp.status}>
                        {done ? tInspections('statusCompleted') : tInspections('statusInProgress')}
                      </StatusBadge>
                    }
                  />
                )
              })}
            </ol>
          </section>
        )
      })}

      {!showAll && events.length > SHOWN_AT_FIRST && (
        <div className="px-3 py-3 sm:px-4">
          <Button size="sm" variant="outline" className="h-8" onClick={() => setShowAll(true)}>
            {t('showOlder', { count: events.length - SHOWN_AT_FIRST })}
          </Button>
        </div>
      )}
    </div>
  )
}

/** The table's columns from the width where they fit; narrower, a row stacks instead. */
const COLUMNS =
  '@2xl:grid-cols-[3.5rem_minmax(0,1fr)_8rem_6.5rem_6.25rem] @4xl:grid-cols-[3.5rem_minmax(0,1fr)_8.5rem_8.5rem_6.5rem_6.25rem] gap-x-3'

/** "Open jobs" or a year over its rows, staying in view while they scroll. */
function GroupHeading({ label, meta }: { label: string; meta?: string }) {
  return (
    <div className="flex items-baseline gap-2 border-b border-border/70 bg-muted/40 px-3 py-1.5 sm:px-4 xl:sticky xl:top-0 xl:z-20 xl:backdrop-blur">
      <h2 className="text-[13px] font-semibold">{label}</h2>
      {meta && <span className="text-xs tabular-nums text-muted-foreground">{meta}</span>}
    </div>
  )
}

/**
 * One row of the table: the day, what the job was with what was done under
 * it, its status, who did it, the reading and the amount, in columns that
 * line up down the list so each can be read on its own. Where the list is
 * narrow the status, the technician and the reading drop to a line under
 * the title instead. The whole row opens the thing it describes.
 */
function Row({
  date,
  icon,
  kind,
  href,
  title,
  number,
  attachments = 0,
  extra,
  detail,
  hasDetail = false,
  status,
  tech,
  reading,
  amount,
}: {
  date: string
  icon?: React.ReactNode
  /** What the row is when it is not a work order, said to a screen reader. */
  kind?: string
  href: string
  title: string
  number?: string | null
  attachments?: number
  /** A small marker after the title, such as a warranty still running. */
  extra?: React.ReactNode
  /** The line under the title: what was done, or what is wrong. */
  detail?: React.ReactNode
  hasDetail?: boolean
  status?: React.ReactNode
  tech?: string | null
  reading?: string | null
  amount?: string | null
}) {
  // A title made from the job number already says it; no need to print it twice.
  const showNumber = number && !title.startsWith(number)
  const hasMeta = Boolean(status || tech || reading)
  return (
    <li className="py-0.5">
      <div
        className={cn(
          COLUMNS,
          'relative grid grid-cols-[3.25rem_minmax(0,1fr)_auto] items-start rounded-lg px-2 py-1.5 transition-colors hover:bg-muted/50'
        )}
      >
        <span className="pt-px text-[12.5px] tabular-nums text-muted-foreground">{date}</span>
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-2">
            {icon && (
              <span className="shrink-0" title={kind}>
                {icon}
                {kind && <span className="sr-only">{kind}</span>}
              </span>
            )}
            <Link
              href={href}
              className="shrink truncate text-sm font-medium outline-none after:absolute after:inset-0 after:rounded-lg focus-visible:after:ring-2 focus-visible:after:ring-ring"
            >
              {title}
            </Link>
            {showNumber && (
              <CopyText
                value={number}
                label={number}
                className="relative z-10 hidden shrink-0 font-mono text-[11.5px] text-muted-foreground sm:inline-flex"
              />
            )}
            {attachments > 0 && (
              <span className="inline-flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                <Paperclip aria-hidden className="h-3 w-3" />
                {attachments}
              </span>
            )}
            {extra}
          </div>
          {hasDetail && (
            <div className="mt-0.5 flex min-w-0 items-center gap-2 truncate text-[12.5px] text-muted-foreground">
              {detail}
            </div>
          )}
          {/* Between the stacked row and the full table there is a status
              column but not yet one for the technician, so the name stays
              under the title until its column appears. */}
          {tech && (
            <div className="mt-0.5 hidden truncate text-[12.5px] text-muted-foreground @2xl:block @4xl:hidden">
              {tech}
            </div>
          )}
          {hasMeta && (
            <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-muted-foreground @2xl:hidden">
              {status}
              {tech && <span className="truncate">{tech}</span>}
              {reading && <span className="tabular-nums">{reading}</span>}
            </div>
          )}
        </div>
        <div className="hidden min-w-0 flex-wrap items-center gap-1 @2xl:flex">{status}</div>
        <div className="hidden min-w-0 truncate pt-px text-[12.5px] text-muted-foreground @4xl:block">
          {tech}
        </div>
        <div className="hidden pt-px text-right text-[12.5px] tabular-nums text-muted-foreground @2xl:block">
          {reading}
        </div>
        <div className="pt-px text-right text-[13px] font-semibold tabular-nums">{amount}</div>
      </div>
    </li>
  )
}
