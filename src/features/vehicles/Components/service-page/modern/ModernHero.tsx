'use client'

import { isPromiseOverdue } from '@/features/vehicles/Lib/promise'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { useState, type ReactNode } from 'react'
import { ArrowLeft, CalendarClock, Pencil, Shield } from 'lucide-react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { useFormatDate } from '@/lib/use-format-date'
import type { WarrantyFields } from '@/lib/warranty'
import {
  paymentStatusColors,
  paymentStatusLabels,
  statusMessageKeys,
  type ServiceDetail,
} from '../../service-detail/types'

interface ModernHeroProps {
  record: ServiceDetail
  status: string
  paymentStatus: string
  warranty: WarrantyFields
  /** Save, preview, send and the menu: the same cluster the classic header carries. */
  actions: ReactNode
  /** The title as it stands, unsaved edits included, and how to change it. */
  title: string
  onTitleChange: (title: string) => void
  /** Maintenance, repair and so on. Absent on a counter sale, which has no type. */
  type?: string
  onTypeChange?: (type: string) => void
  /** A locked invoice shows the title and type and edits neither. */
  locked?: boolean
}

/** How much of a title the header shows before it is cut. */
const TITLE_SHOWN = 50

/**
 * A title as the header shows it: whole up to fifty characters, and cut there
 * with an ellipsis beyond. By count, not by width, so it is cut at the same
 * place on every screen. The full title is in the tooltip and in the field.
 */
export function shownTitle(title: string): string {
  const characters = Array.from(title)
  if (characters.length <= TITLE_SHOWN) return title
  return `${characters.slice(0, TITLE_SHOWN).join('').trimEnd()}…`
}

const SERVICE_TYPES = ['maintenance', 'repair', 'upgrade', 'inspection'] as const

/**
 * The job's title, read as text with a pencil beside it; the pencil turns it
 * into a field in place. Enter or clicking away keeps what was typed, Escape
 * puts back what was there. Keeping is not saving: the title goes with the
 * rest of the job on Save, and the header says "unsaved changes" until then.
 * An emptied title is put back, because a job cannot be saved without one.
 */
function TitleEditor({
  title,
  onChange,
  locked,
  editLabel,
  fieldLabel,
}: {
  title: string
  onChange: (title: string) => void
  locked: boolean
  editLabel: string
  fieldLabel: string
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(title)

  const keep = () => {
    const next = draft.trim()
    if (next && next !== title) onChange(next)
    setEditing(false)
  }

  if (editing) {
    return (
      <input
        // The pencil was just pressed in order to type here.
        autoFocus
        aria-label={fieldLabel}
        data-testid="title-input"
        value={draft}
        maxLength={100}
        onChange={(e) => setDraft(e.target.value)}
        onFocus={(e) => e.target.select()}
        onBlur={keep}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            keep()
          } else if (e.key === 'Escape') {
            setEditing(false)
          }
        }}
        className="w-[min(44rem,100%)] min-w-64 rounded-md border border-input bg-background px-2 py-0.5 font-sans text-sm font-medium text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
    )
  }

  // A locked invoice only reads the title.
  if (locked) {
    return (
      <span className="min-w-0 whitespace-nowrap" data-testid="service-title" title={title}>
        {shownTitle(title)}
      </span>
    )
  }

  // The whole title is the way in, not only the pencil: it sits in a dashed
  // outline so it reads as something that can be changed before anybody
  // hovers over it, and turns into a field where it stands.
  return (
    <button
      type="button"
      aria-label={`${editLabel}: ${title}`}
      title={`${editLabel}: ${title}`}
      data-testid="edit-title"
      onClick={() => {
        setDraft(title)
        setEditing(true)
      }}
      // Always one line, and all of it for as long as there is room: the box
      // takes the width its text needs and gives none of it up to the items
      // beside it, which wrap under it instead. Its limit is the row itself
      // (measured against the row, not against a wrapper sized by the box,
      // which cut it early). Only a title wider than the whole row is cut with an ellipsis
      // (the full text is in the tooltip and in the field once it is opened)
      // rather than folding onto a second line and doubling the header.
      className="group/title -ml-1.5 inline-flex max-w-full shrink-0 cursor-text items-center gap-1.5 whitespace-nowrap rounded-md border border-dashed border-muted-foreground/40 px-1.5 py-px text-left font-medium text-foreground transition-colors hover:border-primary hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span className="min-w-0 truncate" data-testid="service-title">
        {shownTitle(title)}
      </span>
      <Pencil
        className="h-3 w-3 shrink-0 text-muted-foreground transition-colors group-hover/title:text-primary"
        aria-hidden="true"
      />
    </button>
  )
}

/**
 * "Kari Moe" as "K. Moe": the line is short and the desk knows its own
 * people. A single name is left as it is.
 */
function shortName(name: string): string {
  const parts = name.trim().split(/\s+/)
  if (parts.length < 2) return name.trim()
  return `${parts[0][0].toUpperCase()}. ${parts[parts.length - 1]}`
}

/** The customer and the car in the header's second line lead to their own pages. */
const factLink =
  'rounded-sm underline-offset-2 transition-colors hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

const pill =
  'inline-flex h-6 items-center gap-1 whitespace-nowrap rounded-md border px-2.5 text-xs font-semibold leading-none'

/**
 * The top of the overhauled page, and the only header it has: the work order
 * number and how far along the job is, then what the job is and who and what
 * it is for, with everything that can be done to the job beside it. It stays
 * put while the page scrolls under it, so Save is never out of reach. There
 * are no tabs: photos and status reports are sections of the page itself.
 *
 * The facts are read-only here; each is edited in the card that owns it.
 */
export function ModernHero({
  record,
  status,
  paymentStatus,
  warranty,
  actions,
  title,
  onTitleChange,
  type,
  onTypeChange,
  locked = false,
}: ModernHeroProps) {
  const t = useTranslations('service')
  const { formatDateTime } = useFormatDate()

  const customer = record.customer ?? record.vehicle?.customer ?? null
  const vehicle = record.vehicle
  // A job that has no number yet is known by its title alone.
  const number = record.invoiceNumber?.trim() || null

  const titleEditor = (
    <TitleEditor
      title={title}
      onChange={onTitleChange}
      locked={locked}
      editLabel={t('modern.editTitle')}
      fieldLabel={t('modern.titleField')}
    />
  )

  const opened = record.createdAt ? new Date(record.createdAt) : null
  const openedBy = record.createdBy?.name ? shortName(record.createdBy.name) : null

  // A promise that has passed on a job that is not finished is the one thing
  // in this header that needs somebody to act, so it changes colour.
  const promisedAt = record.promisedAt ? new Date(record.promisedAt) : null
  // One rule for the header, the work order list and the board card.
  const promiseOverdue = isPromiseOverdue(record.promisedAt, status)

  const warrantyLabel =
    warranty.warrantyStatus === 'included'
      ? warranty.warrantyMonths
        ? t('warranty.summaryMonths', { count: warranty.warrantyMonths })
        : t('warranty.statement.included')
      : null

  return (
    // Two lines and no more: this stays on screen while the page scrolls, so
    // every pixel of it is taken from the job. The back arrow stands where the
    // breadcrumb line was, and the vehicle it named is in the second line.
    <header
      data-testid="service-hero"
      className="@container shrink-0 border-b bg-background px-4 py-2"
    >
      <div className="mx-auto flex w-full max-w-[calc(1800px-2rem)] flex-wrap items-center justify-between gap-x-6 gap-y-2">
        <div className="flex min-w-0 items-center gap-3">
          <Link
            href={vehicle ? `/vehicles/${vehicle.id}` : '/work-orders'}
            aria-label={t('modern.back')}
            className="shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          </Link>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <h1
                className={cn(
                  'min-w-0 break-words text-xl font-bold leading-tight tracking-tight',
                  // Figures in the default font set, the heading face in the workshop one.
                  number ? 'order-number' : 'font-display'
                )}
                data-testid="service-number"
              >
                {number ?? titleEditor}
              </h1>
              <div className="flex flex-wrap items-center gap-1.5">
                <span
                  className={cn(pill, 'border-primary bg-primary text-primary-foreground')}
                  data-testid="service-status"
                >
                  {statusMessageKeys[status]
                    ? t(`basicInfo.statusOptions.${statusMessageKeys[status]}`)
                    : status}
                </span>
                <span className={cn(pill, paymentStatusColors[paymentStatus])}>
                  {paymentStatusLabels[paymentStatus] || t('header.unpaid')}
                </span>
                {type && onTypeChange && (
                  <Select value={type} onValueChange={onTypeChange} disabled={locked}>
                    <SelectTrigger
                      aria-label={t('basicInfo.type')}
                      data-testid="service-type"
                      // The same box as the pills beside it: the trigger's own height and
                      // padding are for a form field, and made this one taller.
                      className="h-6 gap-1 rounded-md px-2.5 py-0 text-xs font-semibold leading-none shadow-none data-[size=default]:h-6 [&_svg:not([class*='size-'])]:size-3"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SERVICE_TYPES.map((option) => (
                        <SelectItem key={option} value={option}>
                          {t(`basicInfo.typeOptions.${option}`)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                {promisedAt && (
                  <span
                    data-testid="service-promised"
                    suppressHydrationWarning
                    className={cn(
                      pill,
                      promiseOverdue
                        ? 'border-amber-500/40 bg-amber-500/15 text-amber-700 dark:text-amber-300'
                        : 'border-border text-muted-foreground'
                    )}
                  >
                    <CalendarClock className="h-3 w-3" aria-hidden="true" />
                    {t(promiseOverdue ? 'modern.promisedOverdue' : 'modern.promised', {
                      date: formatDateTime(promisedAt),
                    })}
                  </span>
                )}
                {warrantyLabel && (
                  <span
                    className={cn(
                      pill,
                      'border-teal-600/25 bg-teal-600/10 text-teal-700 dark:text-teal-300'
                    )}
                  >
                    <Shield className="h-3 w-3" aria-hidden="true" />
                    {t('warranty.title')} · {warrantyLabel}
                  </span>
                )}
              </div>
            </div>

            {/* A little air under the number: the two lines are different
                things, and ran together when they touched. */}
            <p className="mt-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-muted-foreground">
              {number && titleEditor}
              {number && (customer || vehicle) && <span aria-hidden="true">·</span>}
              {customer && (
                <Link href={`/customers/${customer.id}`} className={factLink}>
                  {customer.name}
                </Link>
              )}
              {customer && vehicle && <span aria-hidden="true">·</span>}
              {vehicle && (
                <Link href={`/vehicles/${vehicle.id}`} className={factLink}>
                  {vehicle.year} {vehicle.make} {vehicle.model}
                </Link>
              )}
              {vehicle?.licensePlate && (
                <>
                  <span aria-hidden="true">·</span>
                  <Link
                    href={`/vehicles/${vehicle.id}`}
                    className={cn(factLink, 'font-mono text-foreground')}
                  >
                    {vehicle.licensePlate}
                  </Link>
                </>
              )}
              {/* Left out on a phone or tablet: the line is for which job this
                  is, and on a small screen when it was opened pushed the plate
                  onto a line of its own. `contents` keeps the dot and the text
                  in the row's own gaps from lg up, where the money bar starts too. */}
              {opened && (
                <span className="hidden lg:contents">
                  <span aria-hidden="true">·</span>
                  <span suppressHydrationWarning data-testid="service-opened">
                    {openedBy
                      ? t('modern.openedBy', { date: formatDateTime(opened), name: openedBy })
                      : t('modern.opened', { date: formatDateTime(opened) })}
                  </span>
                </span>
              )}
            </p>
          </div>
        </div>

        {actions}
      </div>
    </header>
  )
}
