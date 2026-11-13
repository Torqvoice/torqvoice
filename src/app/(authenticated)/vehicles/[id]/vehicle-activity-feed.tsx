'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { useFormatter, useTranslations } from 'next-intl'
import {
  ChevronRight,
  ClipboardCheck,
  FileText,
  History,
  Paperclip,
  Pin,
  Wrench,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { StatusLamp, serviceStatusTone, type LampTone } from '@/components/status-lamp'
import { useFormatCurrency } from '@/components/currency-settings-context'
import { useDayFormatter } from '@/features/calendar/Components/useDayFormatter'
import { useServiceLabels } from '@/features/vehicles/Lib/useServiceLabels'
import { quoteStatusLabel } from '@/features/quotes/Lib/quoteStatus'
import { getWarrantyStatus } from '@/lib/warranty'
import { cn } from '@/lib/utils'
import { CopyText } from '@/components/copy-value'
import type { VehicleJobWarning } from '@/features/vehicles/Lib/vehicleJobWarnings'
import { JobWarningCallout, JobWarningChip } from './job-warning'

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

export interface FeedNote {
  id: string
  title: string
  content: string
  isPinned: boolean
  createdAt: Date
}

export type FeedFilter = 'all' | 'services' | 'quotes' | 'inspections'

type FeedEvent =
  | { kind: 'wo'; id: string; date: Date; wo: FeedWorkOrder }
  | { kind: 'quote'; id: string; date: Date; quote: FeedQuote }
  | { kind: 'inspection'; id: string; date: Date; inspection: FeedInspection }
  | { kind: 'note'; id: string; date: Date; note: FeedNote }

/** Statuses that mean the car is with the workshop right now. */
const IN_WORKSHOP = new Set(['in-progress', 'in_progress', 'waiting-parts', 'waiting_parts'])

/** How far along a job is, as four segments: booked, in, being worked on, done. */
function stage(status: string) {
  if (status === 'completed') return 4
  if (IN_WORKSHOP.has(status)) return 3
  return 1
}

const QUOTE_TONE: Record<string, LampTone> = {
  draft: 'slate',
  sent: 'amber',
  changes_requested: 'amber',
  accepted: 'green',
  converted: 'violet',
  rejected: 'red',
  expired: 'slate',
}

/** When the car is in: the booked start, else the day the job was made. */
const visitDate = (wo: FeedWorkOrder) => new Date(wo.startDateTime ?? wo.serviceDate)
const woTotal = (wo: FeedWorkOrder) => (wo.totalAmount > 0 ? wo.totalAmount : wo.cost)
/** A job still open with nothing on it yet has no amount to show, rather than a row of zeros. */
const showsAmount = (wo: FeedWorkOrder) => wo.status === 'completed' || woTotal(wo) > 0

/** A note's text without its markup, for a one-line preview. */
function plain(html: string) {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim()
}

const SHOWN_AT_FIRST = 20

/**
 * Everything that has happened to the vehicle, newest first, on one line: work
 * orders, quotes, inspections and notes, grouped by year. Jobs the car is in
 * the workshop for, or booked in for, sit above the history in a card of their
 * own, so the first thing on the page is what is going on now.
 */
export function VehicleActivityFeed({
  vehicleId,
  filter,
  search,
  workOrders,
  quotes,
  inspections,
  notes,
  distUnit,
  currencyCode,
  vehicleMileage,
  jobWarnings = [],
  onSelectNote,
}: {
  vehicleId: string
  filter: FeedFilter
  /** What the history is narrowed to; work orders arrive already searched. */
  search: string
  workOrders: FeedWorkOrder[]
  quotes: FeedQuote[]
  inspections: FeedInspection[]
  notes: FeedNote[]
  distUnit: string
  currencyCode: string
  vehicleMileage: number
  /** Booking problems on open jobs, flagged on the job's own line. */
  jobWarnings?: VehicleJobWarning[]
  onSelectNote: (note: FeedNote) => void
}) {
  const t = useTranslations('vehicles.detail.feed')
  const tQuoteStatus = useTranslations('quotes.statusLabels')
  const tWarranty = useTranslations('vehicles.services')
  const serviceLabel = useServiceLabels()
  const formatCurrency = useFormatCurrency()
  const day = useDayFormatter()
  const numberFormat = useFormatter()
  const [showAll, setShowAll] = useState(false)
  const warningFor = useMemo(
    () => new Map(jobWarnings.map((w) => [w.serviceRecordId, w])),
    [jobWarnings]
  )

  const startOfToday = new Date()
  startOfToday.setHours(0, 0, 0, 0)

  const { now, events, years } = useMemo(() => {
    const needle = search.trim().toLowerCase()
    const matches = (text: string | null | undefined) =>
      !needle || (text ?? '').toLowerCase().includes(needle)

    const isNow = (wo: FeedWorkOrder) =>
      IN_WORKSHOP.has(wo.status) || (wo.status === 'scheduled' && visitDate(wo) >= startOfToday)
    const nowJobs = workOrders
      .filter(isNow)
      .sort((a, b) => stage(b.status) - stage(a.status) || +visitDate(a) - +visitDate(b))

    const list: FeedEvent[] = []
    if (filter === 'all' || filter === 'services') {
      for (const wo of workOrders) {
        if (!isNow(wo)) list.push({ kind: 'wo', id: wo.id, date: visitDate(wo), wo })
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
    if (filter === 'all') {
      for (const note of notes) {
        if (matches(note.title) || matches(plain(note.content)))
          list.push({ kind: 'note', id: note.id, date: new Date(note.createdAt), note })
      }
    }
    list.sort((a, b) => +b.date - +a.date)

    // Per year: how many visits and what they came to, over the whole year,
    // not only the part of it on screen.
    const perYear = new Map<number, { visits: number; total: number }>()
    for (const wo of workOrders) {
      const year = visitDate(wo).getFullYear()
      const entry = perYear.get(year) ?? { visits: 0, total: 0 }
      entry.visits += 1
      entry.total += woTotal(wo)
      perYear.set(year, entry)
    }

    return {
      now: filter === 'all' || filter === 'services' ? nowJobs : [],
      events: list,
      years: perYear,
    }
    // startOfToday changes every render by identity, not by day.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, search, workOrders, quotes, inspections, notes])

  const shown = showAll ? events : events.slice(0, SHOWN_AT_FIRST)
  const groups: { year: number; items: FeedEvent[] }[] = []
  for (const event of shown) {
    const year = event.date.getFullYear()
    const last = groups[groups.length - 1]
    if (last?.year === year) last.items.push(event)
    else groups.push({ year, items: [event] })
  }

  const dayMonth = (date: Date) => day.dateTime(date, { day: 'numeric', month: 'short' })
  const reading = (km: number | null) => (km ? `${numberFormat.number(km)} ${distUnit}` : null)

  if (now.length === 0 && events.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed px-6 py-16 text-center">
        <History className="h-8 w-8 text-muted-foreground/40" />
        <p className="text-sm text-muted-foreground">{search ? t('noMatches') : t('empty')}</p>
      </div>
    )
  }

  return (
    <div>
      {now.length > 0 && (
        <section aria-label={t('now')} className="mb-2">
          <GroupHeading label={t('now')} />
          <div className="rounded-xl border bg-card">
            {now.map((wo, i) => {
              const tone = serviceStatusTone(wo.status)
              const href = `/vehicles/${vehicleId}/service/${wo.id}`
              const summary = wo.laborItems?.[0]?.description
              const warning = warningFor.get(wo.id)
              return i === 0 ? (
                <div key={wo.id} className="flex flex-col gap-3 p-4">
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                    <StatusLamp tone={tone}>{serviceLabel.status(wo.status)}</StatusLamp>
                    <StageTrack done={stage(wo.status)} tone={tone} />
                    <span className="text-[12.5px] text-muted-foreground">
                      {[wo.techName, dayMonth(visitDate(wo))].filter(Boolean).join(' · ')}
                    </span>
                    <Button asChild size="sm" variant="outline" className="ml-auto h-8">
                      <Link href={href}>
                        {t('openJob')}
                        <ChevronRight className="ml-0.5 h-3.5 w-3.5" />
                      </Link>
                    </Button>
                  </div>
                  <div className="flex min-w-0 items-baseline gap-2.5">
                    {wo.invoiceNumber && (
                      <span className="shrink-0 font-mono text-xs text-muted-foreground">
                        {wo.invoiceNumber}
                      </span>
                    )}
                    <span className="truncate text-[15px] font-semibold">{wo.title}</span>
                    {showsAmount(wo) && (
                      <span className="ml-auto shrink-0 font-semibold tabular-nums">
                        {formatCurrency(woTotal(wo), currencyCode)}
                      </span>
                    )}
                  </div>
                  {summary && summary !== wo.title && (
                    <p className="-mt-1.5 truncate text-[13px] text-muted-foreground">{summary}</p>
                  )}
                  {warning && <JobWarningCallout warning={warning} href={href} />}
                </div>
              ) : (
                // A job behind the first one is a single line; one whose
                // booking will not work gets the same callout as the first,
                // under its line, since that is the job somebody has to open.
                <div key={wo.id} className="border-t border-dashed">
                  <Link
                    href={href}
                    className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-[13px] transition-colors hover:bg-muted/40"
                  >
                    <StatusLamp tone={tone} className="text-[12.5px]">
                      {serviceLabel.status(wo.status)}
                    </StatusLamp>
                    <span className="text-muted-foreground">{dayMonth(visitDate(wo))}</span>
                    <span className="truncate font-medium">{wo.title}</span>
                    {wo.techName && <span className="text-muted-foreground">{wo.techName}</span>}
                    <ChevronRight className="ml-auto h-3.5 w-3.5 text-muted-foreground" />
                  </Link>
                  {warning && (
                    <div className="px-4 pb-3">
                      <JobWarningCallout warning={warning} href={href} />
                    </div>
                  )}
                </div>
              )
            })}
          </div>
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
            <ol className="relative before:absolute before:inset-y-2 before:left-[calc(3.5rem+0.625rem+0.875rem-0.5px)] sm:before:left-[calc(4.75rem+0.75rem+1.125rem-0.5px)] before:w-px before:bg-border">
              {group.items.map((event) => {
                if (event.kind === 'wo') {
                  const wo = event.wo
                  const summary = wo.laborItems?.[0]?.description
                  const warranty = getWarrantyStatus(
                    wo.warrantyExpiresAt,
                    wo.warrantyMileage,
                    wo.mileage,
                    vehicleMileage
                  )
                  return (
                    <Row
                      key={event.id}
                      date={dayMonth(event.date)}
                      sub={reading(wo.mileage)}
                      icon={<Wrench className="h-3.5 w-3.5" />}
                      iconClass="bg-muted text-foreground/70"
                      href={`/vehicles/${vehicleId}/service/${wo.id}`}
                      title={wo.title}
                      number={wo.invoiceNumber}
                      amount={
                        showsAmount(wo) ? formatCurrency(woTotal(wo), currencyCode) : undefined
                      }
                    >
                      {wo.status !== 'completed' && (
                        <StatusLamp tone={serviceStatusTone(wo.status)} className="text-xs">
                          {serviceLabel.status(wo.status)}
                        </StatusLamp>
                      )}
                      {/* Wrapped, so the dot between details sits outside the
                          chip's border rather than inside it. */}
                      {warningFor.has(wo.id) && (
                        <span>
                          <JobWarningChip
                            warning={warningFor.get(wo.id) as VehicleJobWarning}
                            href={`/vehicles/${vehicleId}/service/${wo.id}`}
                          />
                        </span>
                      )}
                      {wo.techName && <span>{wo.techName}</span>}
                      {summary && summary !== wo.title && (
                        <span className="min-w-0 truncate">{summary}</span>
                      )}
                      {wo._count.attachments > 0 && (
                        <span className="inline-flex items-center gap-1">
                          <Paperclip className="h-3 w-3" />
                          {wo._count.attachments}
                        </span>
                      )}
                      {(warranty === 'active' || warranty === 'expiring') && (
                        <span>
                          <span className="rounded bg-emerald-500/10 px-1.5 py-px text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">
                            {tWarranty(`warranty.status.${warranty}`)}
                          </span>
                        </span>
                      )}
                    </Row>
                  )
                }
                if (event.kind === 'quote') {
                  const q = event.quote
                  return (
                    <Row
                      key={event.id}
                      date={dayMonth(event.date)}
                      icon={<FileText className="h-3.5 w-3.5" />}
                      iconClass="border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-400"
                      href={`/quotes/${q.id}`}
                      title={q.title}
                      number={q.quoteNumber}
                      amount={formatCurrency(q.totalAmount, currencyCode)}
                    >
                      <StatusLamp tone={QUOTE_TONE[q.status] ?? 'slate'} className="text-xs">
                        {quoteStatusLabel(q.status, tQuoteStatus)}
                      </StatusLamp>
                      <span>{t('quote')}</span>
                    </Row>
                  )
                }
                if (event.kind === 'inspection') {
                  const insp = event.inspection
                  const passed = insp.items.filter((i) => i.condition === 'pass').length
                  const failed = insp.items.filter((i) => i.condition === 'fail').length
                  const done = insp.status === 'completed'
                  return (
                    <Row
                      key={event.id}
                      date={dayMonth(event.date)}
                      icon={<ClipboardCheck className="h-3.5 w-3.5" />}
                      iconClass="border-teal-600/25 bg-teal-600/10 text-teal-700 dark:text-teal-400"
                      href={`/inspections/${insp.id}`}
                      title={insp.template.name}
                    >
                      {!done && (
                        <StatusLamp tone="blue" className="text-xs">
                          {t('inspectionOpen')}
                        </StatusLamp>
                      )}
                      {(done || passed + failed > 0) && (
                        <span>{t('inspectionResult', { passed })}</span>
                      )}
                      {failed > 0 && (
                        <span className="font-medium text-red-700 dark:text-red-400">
                          {t('inspectionFailed', { count: failed })}
                        </span>
                      )}
                    </Row>
                  )
                }
                const note = event.note
                const text = plain(note.content)
                return (
                  <Row
                    key={event.id}
                    date={dayMonth(event.date)}
                    icon={
                      note.isPinned ? (
                        <Pin className="h-3.5 w-3.5" />
                      ) : (
                        <FileText className="h-3.5 w-3.5" />
                      )
                    }
                    iconClass="bg-card text-muted-foreground"
                    onClick={() => onSelectNote(note)}
                    title={note.title}
                  >
                    {text && <span className="min-w-0 truncate italic">{text}</span>}
                  </Row>
                )
              })}
            </ol>
          </section>
        )
      })}

      {!showAll && events.length > SHOWN_AT_FIRST && (
        <div className="pl-[4.5rem] pt-3 sm:pl-[5.5rem]">
          <Button size="sm" variant="outline" className="h-8" onClick={() => setShowAll(true)}>
            {t('showOlder', { count: events.length - SHOWN_AT_FIRST })}
          </Button>
        </div>
      )}
    </div>
  )
}

/** A year (or "Now") over its part of the feed, with a hairline to the edge. */
function GroupHeading({ label, meta }: { label: string; meta?: string }) {
  return (
    <div className="flex items-baseline gap-2.5 bg-background pb-2 pt-5 first:pt-1 xl:sticky xl:top-0 xl:z-20">
      <span className="text-[13px] font-semibold">{label}</span>
      {meta && <span className="text-xs text-muted-foreground">{meta}</span>}
      <span aria-hidden className="h-px flex-1 -translate-y-1 bg-border" />
    </div>
  )
}

/** Four short segments: how far a job has come. The current one is lit in its status colour. */
function StageTrack({ done, tone }: { done: number; tone: LampTone }) {
  const lit: Record<LampTone, string> = {
    slate: 'bg-slate-500',
    teal: 'bg-teal-600',
    blue: 'bg-blue-600',
    violet: 'bg-violet-600',
    green: 'bg-emerald-600',
    amber: 'bg-amber-500',
    red: 'bg-red-600',
  }
  return (
    <span aria-hidden className="inline-flex gap-[3px]">
      {[1, 2, 3, 4].map((n) => (
        <span
          key={n}
          className={cn(
            'h-1 w-[18px] rounded-full',
            n < done ? 'bg-muted-foreground/60' : n === done ? lit[tone] : 'bg-border'
          )}
        />
      ))}
    </span>
  )
}

/**
 * One line of the history: the day and reading on the left, a small marker on
 * the line, the title with one line of detail, the amount on the right. The
 * whole row opens the thing it describes.
 */
function Row({
  date,
  sub,
  icon,
  iconClass,
  href,
  onClick,
  title,
  number,
  amount,
  children,
}: {
  date: string
  sub?: string | null
  icon: React.ReactNode
  iconClass: string
  href?: string
  onClick?: () => void
  title: string
  number?: string | null
  amount?: string
  children?: React.ReactNode
}) {
  const stretched =
    'outline-none after:absolute after:inset-0 after:rounded-lg focus-visible:after:ring-2 focus-visible:after:ring-ring'
  return (
    <li className="relative grid grid-cols-[3.5rem_1.75rem_minmax(0,1fr)_auto] items-start gap-x-2.5 rounded-lg py-2.5 pr-1 transition-colors hover:bg-muted/40 sm:grid-cols-[4.75rem_2.25rem_minmax(0,1fr)_auto] sm:gap-x-3 sm:pr-2">
      <div className="pt-0.5 text-right">
        <div className="text-[12.5px] font-semibold leading-tight">{date}</div>
        {sub && (
          <div className="mt-0.5 hidden whitespace-nowrap font-mono text-[10.5px] leading-tight text-muted-foreground sm:block">
            {sub}
          </div>
        )}
      </div>
      <span
        className={cn(
          'relative z-10 mx-auto flex size-6 items-center justify-center rounded-full border sm:size-7',
          iconClass
        )}
      >
        {icon}
      </span>
      <div className="min-w-0">
        <div className="flex min-w-0 items-baseline gap-2">
          {href ? (
            <Link href={href} className={cn('truncate text-sm font-medium', stretched)}>
              {title}
            </Link>
          ) : (
            <button
              type="button"
              onClick={onClick}
              className={cn('truncate text-left text-sm font-medium', stretched)}
            >
              {title}
            </button>
          )}
          {number && (
            <CopyText
              value={number}
              label={number}
              className="hidden shrink-0 font-mono text-[11.5px] text-muted-foreground sm:inline-flex"
            />
          )}
        </div>
        {children && (
          <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1 text-[12.5px] text-muted-foreground sm:[&>*+*]:before:mr-2.5 sm:[&>*+*]:before:inline-block sm:[&>*+*]:before:size-[3px] sm:[&>*+*]:before:-translate-y-0.5 sm:[&>*+*]:before:rounded-full sm:[&>*+*]:before:bg-border sm:[&>*+*]:before:content-['']">
            {children}
          </div>
        )}
      </div>
      <div className="pt-0.5 text-right text-[13.5px] font-semibold tabular-nums">{amount}</div>
    </li>
  )
}
