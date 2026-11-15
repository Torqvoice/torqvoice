import {
  ArrowRight,
  CalendarDays,
  Car,
  Check,
  ChevronRight,
  CircleDot,
  CreditCard,
  FileText,
  MapPin,
  MessageSquare,
  MessageSquareText,
  Sailboat,
  Send,
  Wrench,
} from 'lucide-react'
import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import type {
  PortalHomeCar,
  PortalHomeData,
  PortalHomeFormat,
  PortalHomeJob,
  PortalHomeQuote,
  PortalHomeTireSet,
  PortalHomeUpdate,
  PortalHomeVisit,
  PortalWorkshop,
} from '../../../Lib/homeTypes'
import { PortalAcceptQuoteButton } from '../../Home/PortalAcceptQuoteButton'
import { portalHeroLine, portalJobLine, portalJobSteps, tireSeasonKey } from '../../Home/homeCopy'
import { PortalBadge, PortalEmptyState, PortalLinkButton, PortalPanel } from '../../Ui'
import type { PortalHomeProps } from '../types'
import { DEEP, FIELD, HIGHLIGHT, PANEL, PanelHead, SOFT_ON_DEEP, TILE } from './parts'

type T = Awaited<ReturnType<typeof getTranslations>>

type Part = string | null | undefined | false
const joined = (parts: Part[]) => parts.filter(Boolean).join(' · ')
const spaced = (parts: Part[]) => parts.filter(Boolean).join(' ')

/** A text link that is an action of its own: the ink, underlined, with an arrow. */
const ACTION_LINK = 'p-link p-link--block gap-2 self-start text-[15px] font-extrabold'

/** A big amount: "4 850 kr". Sized so a long one still fits a narrow panel. */
const AMOUNT = 'p-display text-[28px] leading-9 sm:text-[32px] sm:leading-10'

/**
 * Colour's home: the workshop's own colour floods the top of the page.
 *
 * The header and the car in the workshop sit on one field of the workshop's
 * colour, the status in very large type with the three steps as one
 * segmented bar. Everything else is on big white panels with soft corners,
 * the first row of which overlaps the foot of the field. What waits on the
 * customer (a quote to answer, a due date, an unread message) is the one
 * warm highlight.
 *
 * On a desk (from 1100 px) the chat is a white panel on the right that
 * starts on the field and stays in view while the left scrolls. Below that
 * it is one column, the chat is behind the Messages tab and its latest line
 * sits on the field under the steps.
 *
 * The left column sizes its own rows by how wide it is (container queries),
 * so it is right with the chat beside it and without. Every block can be
 * missing; the ones that remain close ranks. With no car in the workshop the
 * field holds the next visit, or says that nothing is in and offers a visit.
 */
export async function Home({ orgParam, data, format, chat }: PortalHomeProps) {
  const [t, tc] = await Promise.all([
    getTranslations('portal.home'),
    getTranslations('portal.themes.colour'),
  ])
  const base = `/portal/${orgParam}`
  const word = (key: string) => t(data.marine ? `${key}Marine` : key)
  const job = data.jobs[0]
  const otherJobs = data.jobs.slice(1)
  const tires = data.tires ?? []
  // Without a car in the workshop the next visit is what the field leads with.
  const visitOnField = job ? null : data.nextVisit

  return (
    // The field is wider than the column it hangs from: this clips its ends,
    // and keeps it in front of the page's own background.
    <div className="isolate flex w-full flex-1 flex-col overflow-x-clip">
      <div className="p-shell flex flex-1 flex-col pb-6 sm:pb-8 min-[1100px]:flex-row min-[1100px]:items-start min-[1100px]:gap-6 lg:pb-10">
        <div className="@container flex min-w-0 flex-1 flex-col">
          <section
            aria-labelledby="home-hero"
            className={`relative flex flex-col pt-1 @[560px]:pt-3 @[820px]:pt-4 ${FIELD}`}
          >
            {/* The field: the full width of the page, from under the header
                to a little past the top of the first row of panels. */}
            <div
              aria-hidden
              className="-inset-x-[100vw] -bottom-11 -top-px absolute -z-10 bg-[var(--p-accent)] @[560px]:-bottom-16 @[820px]:-bottom-[84px]"
            />

            {job && <JobLine job={job} />}
            <h1
              id="home-hero"
              className="p-display mt-2 text-[length:clamp(28px,6.2cqw,60px)] leading-[1.08] tracking-[-0.03em] @[820px]:mt-4"
            >
              {portalHeroLine(data, format, t)}
            </h1>

            {job ? (
              <Tracker job={job} t={t} now={tc('stepNow')} />
            ) : visitOnField ? (
              <FieldVisit visit={visitOnField} workshop={data.workshop} format={format} t={t} />
            ) : (
              <>
                <p className="mt-3 max-w-[52ch] text-[15px] font-semibold leading-normal @[820px]:text-[17px]">
                  {word('heroNothingBody')}
                </p>
                <PortalLinkButton
                  variant="hero"
                  href={`${base}/request-service`}
                  className="mt-4 self-start"
                >
                  {t('bookVisit')}
                  <ArrowRight className="h-4 w-4 shrink-0" aria-hidden />
                </PortalLinkButton>
              </>
            )}

            {data.messages.enabled && (
              <MessagePreview data={data} format={format} href={`${base}/messages`} t={t} />
            )}
          </section>

          <div className="mt-3 flex flex-col gap-3 @[560px]:mt-5 @[560px]:gap-5 @[820px]:mt-7">
            {(job?.update || data.toAnswer.length > 0 || data.toPay.length > 0) && (
              <div className="flex flex-wrap gap-3 @[560px]:gap-5">
                {job?.update && <UpdatePanel update={job.update} format={format} t={t} />}
                {data.toAnswer[0] && (
                  <QuotePanel
                    quote={data.toAnswer[0]}
                    more={data.toAnswer.length - 1}
                    listHref={`${base}/quotes`}
                    format={format}
                    t={t}
                  />
                )}
                {data.toPay[0] && (
                  <InvoicePanel data={data} listHref={`${base}/invoices`} format={format} t={t} />
                )}
              </div>
            )}

            <div className="flex flex-wrap gap-3 @[560px]:gap-5">
              {otherJobs.length > 0 && (
                <PortalPanel aria-labelledby="home-jobs" className={`${PANEL} border-transparent`}>
                  <PanelHead id="home-jobs" icon={Wrench} label={t('otherJobs')} />
                  <ul className="mt-3 flex flex-col gap-2">
                    {otherJobs.map((other) => (
                      <TileRow
                        key={other.id}
                        href={other.vehicle ? `${base}/vehicles/${other.vehicle.id}` : undefined}
                        title={other.title}
                        meta={joined([other.vehicle?.label, portalJobLine(other, format, t)])}
                      />
                    ))}
                  </ul>
                </PortalPanel>
              )}

              <PortalPanel aria-labelledby="home-cars" className={`${PANEL} border-transparent`}>
                <PanelHead
                  id="home-cars"
                  icon={data.marine ? Sailboat : Car}
                  label={word('cars')}
                />
                {data.cars.length === 0 ? (
                  <PortalEmptyState title={word('carsEmptyTitle')} className="mt-3.5">
                    {word('carsEmptyBody')}
                  </PortalEmptyState>
                ) : (
                  <ul className="mt-3 flex flex-col gap-2">
                    {data.cars.map((car) => (
                      <CarRow key={car.id} car={car} t={t} />
                    ))}
                  </ul>
                )}
              </PortalPanel>

              {!visitOnField && (
                <VisitPanel
                  visit={data.nextVisit}
                  workshop={data.workshop}
                  bookHref={`${base}/request-service`}
                  emptyBody={word('nextVisitEmptyBody')}
                  format={format}
                  t={t}
                />
              )}

              {tires.length > 0 && (
                <TiresPanel tires={tires} format={format} t={t} storedSince={tc('storedSince')} />
              )}

              {data.requests.length > 0 && (
                <PortalPanel
                  aria-labelledby="home-requests"
                  className={`${PANEL} border-transparent`}
                >
                  <PanelHead id="home-requests" icon={Send} label={t('requests')} />
                  <ul className="mt-3 flex flex-col gap-2">
                    {data.requests.map((request) => (
                      <TileRow
                        key={request.id}
                        title={<span className="line-clamp-3">{request.description}</span>}
                        meta={joined([
                          t('requestSent', { day: format.day(request.createdAt) }),
                          request.vehicle?.label,
                          request.preferredDate &&
                            t('requestWishedDay', { day: format.day(request.preferredDate) }),
                          t('requestWaiting'),
                        ])}
                      />
                    ))}
                  </ul>
                </PortalPanel>
              )}
            </div>
          </div>
        </div>

        {chat && (
          <aside
            aria-label={t('messagesLabel', { workshop: data.workshop.name })}
            className="p-panel p-panel--flush mt-4 hidden shrink-0 border-transparent min-[1100px]:sticky min-[1100px]:top-[88px] min-[1100px]:flex min-[1100px]:h-[calc(100svh-104px)] min-[1100px]:max-h-[920px] min-[1100px]:min-h-[480px] min-[1100px]:w-[360px] min-[1100px]:flex-col xl:w-[400px] 2xl:w-[440px]"
          >
            {chat}
          </aside>
        )}
      </div>
    </div>
  )
}

/** Which car, its plate and what it is in for, above the big line. */
function JobLine({ job }: { job: PortalHomeJob }) {
  return (
    <p className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-sm font-semibold leading-snug @[820px]:gap-x-3 @[820px]:text-base">
      {job.vehicle && (
        <span className="text-[15px] font-extrabold @[820px]:text-lg">{job.vehicle.label}</span>
      )}
      {job.vehicle?.licensePlate && (
        <span className="inline-flex min-h-[22px] items-center whitespace-nowrap rounded-lg bg-[var(--p-on-accent)] px-2 text-xs font-extrabold tracking-[0.02em] text-[color:var(--p-accent)] @[820px]:min-h-[26px] @[820px]:px-2.5 @[820px]:text-sm">
          {job.vehicle.licensePlate}
        </span>
      )}
      <span className="min-w-0">{job.title}</span>
    </p>
  )
}

/**
 * The three steps as one segmented bar in the deeper tone: the step the job
 * is at is the filled segment. On a phone each segment is a word; with room
 * it gets its mark (done, here, still to come).
 */
function Tracker({ job, t, now }: { job: PortalHomeJob; t: T; now: string }) {
  const steps = portalJobSteps(job, t)
  return (
    <ol
      aria-label={t('stepsLabel')}
      className={`${DEEP} mt-3 grid grid-cols-3 gap-0.5 rounded-[16px] p-1 @[560px]:gap-1.5 @[560px]:rounded-[20px] @[560px]:p-1.5 @[820px]:mt-6`}
    >
      {steps.map((step) => (
        <li
          key={step.label}
          aria-current={step.state === 'now' ? 'step' : undefined}
          className={`flex min-h-10 min-w-0 flex-col items-center justify-center gap-x-2.5 rounded-[12px] px-1.5 py-1 text-center text-xs leading-4 @[560px]:min-h-11 @[560px]:flex-row @[560px]:justify-start @[560px]:rounded-[14px] @[560px]:px-3 @[560px]:text-left @[560px]:text-[15px] @[560px]:leading-5 ${
            step.state === 'now'
              ? 'bg-[var(--p-on-accent)] font-extrabold text-[color:var(--p-accent)]'
              : step.state === 'done'
                ? 'font-bold'
                : `font-semibold ${SOFT_ON_DEEP}`
          }`}
        >
          <StepMark state={step.state} />
          <span className="min-w-0">{step.label}</span>{' '}
          {/* A visit that is only booked is not happening now. */}
          {step.state === 'now' && job.stage !== 'booked' && (
            <span className="text-[11px] font-bold leading-[14px] @[560px]:text-sm">{now}</span>
          )}
        </li>
      ))}
    </ol>
  )
}

function StepMark({ state }: { state: 'done' | 'now' | 'todo' }) {
  const box = 'hidden h-7 w-7 shrink-0 items-center justify-center rounded-full @[560px]:flex'
  if (state === 'done') {
    return (
      <span aria-hidden className={`${box} bg-[var(--p-on-accent)] text-[color:var(--p-accent)]`}>
        <Check className="h-4 w-4" strokeWidth={3} />
      </span>
    )
  }
  if (state === 'now') {
    return (
      <span aria-hidden className={`${box} border-2 border-[color:var(--p-accent)]`}>
        <span className="h-3 w-3 rounded-full bg-[var(--p-accent)]" />
      </span>
    )
  }
  return <span aria-hidden className={`${box} border-2 border-[color:var(--pc-ring)]`} />
}

/** The next visit, on the field, for a customer with no car in the workshop. */
function FieldVisit({
  visit,
  workshop,
  format,
  t,
}: {
  visit: PortalHomeVisit
  workshop: PortalWorkshop
  format: PortalHomeFormat
  t: T
}) {
  return (
    <section
      aria-labelledby="home-visit"
      className={`${DEEP} mt-4 flex flex-col gap-x-8 gap-y-4 rounded-[20px] p-4 @[560px]:p-5 @[820px]:mt-6 @[820px]:flex-row @[820px]:items-end @[820px]:p-6`}
    >
      <div className="flex min-w-0 flex-1 flex-col">
        <h2
          id="home-visit"
          className={`flex items-center gap-2 text-sm font-extrabold ${SOFT_ON_DEEP}`}
        >
          <CalendarDays className="h-5 w-5 shrink-0" aria-hidden />
          {t('nextVisit')}
        </h2>
        <p className="p-display mt-2.5 text-[length:clamp(22px,4cqw,36px)] leading-[1.12]">
          {t('visitWhen', { day: format.dayLong(visit.startAt), time: format.time(visit.startAt) })}
        </p>
        <p className="mt-1.5 text-[15px] font-semibold leading-snug @[820px]:text-base">
          {joined([visit.vehicle?.label, visit.title])}
        </p>
      </div>
      {workshop.address && (
        <div className="flex min-w-0 flex-col items-start gap-2.5 @[820px]:max-w-[320px] @[820px]:items-end @[820px]:text-right">
          <p
            className={`flex items-start gap-2 text-sm font-semibold leading-snug ${SOFT_ON_DEEP}`}
          >
            <MapPin className="mt-px h-[18px] w-[18px] shrink-0" aria-hidden />
            <span className="min-w-0 whitespace-pre-line">{workshop.address}</span>
          </p>
          {workshop.directionsUrl && (
            <PortalLinkButton variant="hero" href={workshop.directionsUrl} external>
              {t('directions')}
              <ArrowRight className="h-4 w-4 shrink-0" aria-hidden />
            </PortalLinkButton>
          )}
        </div>
      )}
    </section>
  )
}

/** The latest line of the chat, on the field, where the chat is a tab away. */
function MessagePreview({
  data,
  format,
  href,
  t,
}: {
  data: PortalHomeData
  format: PortalHomeFormat
  href: string
  t: T
}) {
  const last = data.messages.latest[data.messages.latest.length - 1]
  const workshop = data.workshop.name
  return (
    <Link
      href={href}
      className={`${DEEP} mt-2 flex min-h-11 items-center gap-2.5 rounded-[14px] px-3 py-1.5 text-sm min-[1100px]:hidden`}
    >
      <span className="relative flex shrink-0">
        <MessageSquare className="h-5 w-5" aria-hidden />
        {data.messages.unread > 0 && (
          <span
            aria-hidden
            className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full border border-[color:var(--pc-deep)] bg-[var(--pc-highlight)]"
          />
        )}
      </span>
      <span className="sr-only">{t('messagePreviewOpen', { workshop })}: </span>
      {last ? (
        <>
          <span className="min-w-0 flex-1 truncate font-semibold">
            <span className="font-extrabold">
              {last.direction === 'inbound'
                ? t('messagePreviewYou')
                : t('messagePreviewFrom', { name: last.authorName ?? workshop })}
            </span>{' '}
            {last.body || t('messagePreviewPhoto')}
          </span>
          <span className={`whitespace-nowrap text-[13px] font-semibold ${SOFT_ON_DEEP}`}>
            {format.isPast(last.createdAt)
              ? format.day(last.createdAt)
              : format.time(last.createdAt)}
          </span>
        </>
      ) : (
        <span className="min-w-0 flex-1 font-extrabold">
          {t('messagePreviewEmpty', { workshop })}
        </span>
      )}
      <ChevronRight className="h-[18px] w-[18px] shrink-0" aria-hidden />
    </Link>
  )
}

/** What the workshop last shared about the car that is in. */
function UpdatePanel({
  update,
  format,
  t,
}: {
  update: PortalHomeUpdate
  format: PortalHomeFormat
  t: T
}) {
  return (
    <PortalPanel aria-labelledby="home-update" className={`${PANEL} border-transparent`}>
      <PanelHead
        id="home-update"
        icon={MessageSquareText}
        label={t('latestUpdate', {
          when: format.isPast(update.at)
            ? `${format.day(update.at)}, ${format.time(update.at)}`
            : format.time(update.at),
        })}
      />
      <p className="mt-3.5 line-clamp-6 whitespace-pre-line text-[15px] font-semibold leading-[22px]">
        {update.message ?? t('updateFallback')}
      </p>
      <div className="mt-auto flex pt-2">
        <Link href={update.url} className={ACTION_LINK}>
          {t('seeUpdate')}
          <ArrowRight className="h-[18px] w-[18px] shrink-0" aria-hidden />
        </Link>
      </div>
    </PortalPanel>
  )
}

/** The quote that waits for an answer: the one panel in the warm highlight. */
function QuotePanel({
  quote,
  more,
  listHref,
  format,
  t,
}: {
  quote: PortalHomeQuote
  more: number
  listHref: string
  format: PortalHomeFormat
  t: T
}) {
  return (
    <PortalPanel
      aria-labelledby="home-answer"
      className={`${PANEL} ${HIGHLIGHT} border-transparent`}
    >
      <PanelHead plain id="home-answer" icon={FileText} label={t('needsAnswer')} />
      <h3 className="mt-3.5 text-[17px] font-extrabold leading-6">{quote.title}</h3>
      <p className="p-muted mt-0.5 text-sm font-semibold leading-5">
        {joined([
          quote.quoteNumber ? t('quoteNumber', { number: quote.quoteNumber }) : t('quote'),
          quote.vehicle?.label,
        ])}
      </p>
      <p className={`${AMOUNT} mt-3`}>{format.money(quote.total)}</p>
      {quote.validUntil && (
        <p className="p-muted text-sm font-semibold leading-5">
          {t('validUntil', { day: format.day(quote.validUntil) })}
        </p>
      )}
      {/* The buttons share a line where both fit and stack where they do not. */}
      <div className="mt-auto pt-4 [&_.p-btn]:flex-1">
        <PortalAcceptQuoteButton quoteId={quote.id} variant="strong">
          <PortalLinkButton variant="outline" href={quote.url}>
            {t('readQuote')}
          </PortalLinkButton>
        </PortalAcceptQuoteButton>
      </div>
      {more > 0 && (
        <Link href={listHref} className="p-link p-link--block mt-1 self-start text-sm">
          {t('moreQuotes', { count: more })}
        </Link>
      )}
    </PortalPanel>
  )
}

/**
 * What there is to pay. One invoice is shown as itself. With several, the
 * sum of them all is the headline, with how many there are and how many are
 * overdue; under it the most urgent one with its own action, then the way
 * to all of them.
 */
function InvoicePanel({
  data,
  listHref,
  format,
  t,
}: {
  data: PortalHomeData
  listHref: string
  format: PortalHomeFormat
  t: T
}) {
  const invoice = data.toPay[0]
  const several = data.toPayCount > 1
  const anyOverdue = several ? data.toPayOverdueCount > 0 : invoice.overdue
  const due =
    invoice.dueAt &&
    (invoice.overdue ? (
      <PortalBadge tone="danger">
        {t('overdueSince', { day: format.day(invoice.dueAt) })}
      </PortalBadge>
    ) : (
      <span className="inline-flex min-h-6 items-center whitespace-nowrap rounded-[12px] bg-[var(--pc-highlight)] px-2.5 text-[13px] font-extrabold text-[color:var(--pc-on-highlight)]">
        {t('due', { day: format.day(invoice.dueAt) })}
      </span>
    ))
  const facts = joined([
    invoice.invoiceNumber ? t('invoiceNumber', { number: invoice.invoiceNumber }) : t('invoice'),
    invoice.vehicle?.label,
    format.day(invoice.date),
  ])
  const paid = invoice.paid > 0 && (
    <p className="p-muted text-sm font-semibold leading-5">
      {t('paidSoFar', { paid: format.money(invoice.paid), total: format.money(invoice.total) })}
    </p>
  )
  const actions = (
    <div className="flex flex-wrap gap-2.5 [&_.p-btn]:flex-1">
      {invoice.payUrl && (
        <PortalLinkButton variant="accent" href={invoice.payUrl}>
          {t('payNow')}
        </PortalLinkButton>
      )}
      <PortalLinkButton variant={invoice.payUrl ? 'outline' : 'accent'} href={invoice.viewUrl}>
        {t('seeInvoice')}
      </PortalLinkButton>
    </div>
  )
  const panel = `${PANEL} ${anyOverdue ? 'border-[color:var(--p-danger)]' : 'border-transparent'}`

  if (!several) {
    return (
      <PortalPanel aria-labelledby="home-pay" className={panel}>
        <PanelHead id="home-pay" icon={CreditCard} label={t('toPay')} aside={due} />
        <h3 className="mt-3.5 text-[17px] font-extrabold leading-6">{invoice.title}</h3>
        <p className="p-muted mt-0.5 text-sm font-semibold leading-5">{facts}</p>
        <p className={`${AMOUNT} mt-3`}>{format.money(invoice.balance)}</p>
        {paid}
        <div className="mt-auto pt-4">{actions}</div>
      </PortalPanel>
    )
  }

  return (
    <PortalPanel aria-labelledby="home-pay" className={panel}>
      <PanelHead
        id="home-pay"
        icon={CreditCard}
        label={t('toPay')}
        aside={
          data.toPayOverdueCount > 0 && (
            <PortalBadge tone="danger">
              {t('toPayOverdueCount', { count: data.toPayOverdueCount })}
            </PortalBadge>
          )
        }
      />
      <p className={`${AMOUNT} mt-3.5`}>{format.money(data.toPayTotal)}</p>
      <p className="p-muted text-sm font-semibold leading-5">
        {t('toPayCount', { count: data.toPayCount })}
      </p>
      {/* The one to deal with first, as a tile of its own inside the panel. */}
      <div className="mt-3.5 flex flex-col rounded-[16px] bg-[var(--p-soft)] p-3.5">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
          <p className="p-muted text-[13px] font-extrabold leading-5">
            {invoice.overdue ? t('toPayMostUrgent') : t('toPayNext')}
          </p>
          {due}
        </div>
        <div className="mt-2 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5">
          <h3 className="min-w-0 text-[15px] font-extrabold leading-5">{invoice.title}</h3>
          <p className="whitespace-nowrap text-[15px] font-extrabold leading-5">
            {format.money(invoice.balance)}
          </p>
        </div>
        <p className="p-muted mt-0.5 text-[13px] font-semibold leading-[18px]">{facts}</p>
        {paid}
        <div className="mt-3">{actions}</div>
      </div>
      <div className="mt-auto flex pt-2">
        <Link href={listHref} className={ACTION_LINK}>
          {t('seeAllInvoices', { count: data.toPayCount })}
          <ArrowRight className="h-[18px] w-[18px] shrink-0" aria-hidden />
        </Link>
      </div>
    </PortalPanel>
  )
}

/** One soft tile of a list in a white panel; a link when it goes somewhere. */
function TileRow({
  href,
  title,
  meta,
  note,
}: {
  href?: string
  title: React.ReactNode
  meta?: React.ReactNode
  /** A third line that says what is going on: "In the workshop". */
  note?: React.ReactNode
}) {
  const inner = (
    <>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-[15px] font-extrabold leading-5">{title}</span>
        {meta && <span className="p-muted text-[13px] font-semibold leading-[18px]">{meta}</span>}
        {note && (
          <span className="text-[13px] font-bold leading-[18px] first-letter:uppercase">
            {note}
          </span>
        )}
      </span>
      {href && <ChevronRight className="h-5 w-5 shrink-0" strokeWidth={2.5} aria-hidden />}
    </>
  )
  return (
    <li>
      {href ? (
        <Link href={href} className={`${TILE} hover:bg-[var(--p-bg)]`}>
          {inner}
        </Link>
      ) : (
        <div className={TILE}>{inner}</div>
      )}
    </li>
  )
}

function CarRow({ car, t }: { car: PortalHomeCar; t: T }) {
  return (
    <TileRow
      href={car.url}
      title={car.label}
      meta={joined([car.licensePlate, t('carVisits', { count: car.visits })])}
      note={
        joined([
          car.inWorkshop && t('carInWorkshop'),
          car.warranty === 'active' && t('carWarrantyActive'),
          car.warranty === 'expiring' && t('carWarrantyExpiring'),
        ]) || undefined
      }
    />
  )
}

/** The next visit as a panel, or that none is booked and how to book one. */
function VisitPanel({
  visit,
  workshop,
  bookHref,
  emptyBody,
  format,
  t,
}: {
  visit: PortalHomeVisit | null
  workshop: PortalWorkshop
  bookHref: string
  emptyBody: string
  format: PortalHomeFormat
  t: T
}) {
  return (
    <PortalPanel aria-labelledby="home-visit" className={`${PANEL} border-transparent`}>
      <PanelHead id="home-visit" icon={CalendarDays} label={t('nextVisit')} />
      {visit ? (
        <>
          <h3 className="p-display mt-3.5 text-xl leading-[26px] tracking-[-0.01em]">
            {format.dayLong(visit.startAt)}
          </h3>
          <p className="mt-1 text-[15px] font-bold leading-[22px]">
            {joined([format.time(visit.startAt), visit.vehicle?.label])}
          </p>
          <p className="p-muted text-sm font-semibold leading-5">{visit.title}</p>
          {workshop.address && (
            <p className="p-muted mt-auto flex items-start gap-2 pt-4 text-sm font-semibold leading-5">
              <MapPin className="mt-px h-[18px] w-[18px] shrink-0" aria-hidden />
              <span className="min-w-0 whitespace-pre-line">{workshop.address}</span>
            </p>
          )}
          {workshop.directionsUrl && (
            <a
              href={workshop.directionsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={`${ACTION_LINK} ${workshop.address ? '' : 'mt-auto'}`}
            >
              {t('directions')}
              <ArrowRight className="h-[18px] w-[18px] shrink-0" aria-hidden />
            </a>
          )}
        </>
      ) : (
        <PortalEmptyState
          title={t('nextVisitEmptyTitle')}
          className="mt-3.5"
          action={
            <PortalLinkButton variant="outline" href={bookHref}>
              {t('bookVisit')}
            </PortalLinkButton>
          }
        >
          {emptyBody}
        </PortalEmptyState>
      )}
    </PortalPanel>
  )
}

/** Tyres the workshop stores: the first set in full, any others as tiles. */
function TiresPanel({
  tires,
  format,
  t,
  storedSince,
}: {
  tires: PortalHomeTireSet[]
  format: PortalHomeFormat
  t: T
  /** "Stored since", as the name of a fact. */
  storedSince: string
}) {
  const [first, ...rest] = tires
  const facts = (set: PortalHomeTireSet) =>
    joined([
      spaced([set.brand, set.model]),
      set.size,
      set.studded && t('tiresStudded'),
      set.withRims && t('tiresOnRims'),
    ])
  return (
    <PortalPanel aria-labelledby="home-tires" className={`${PANEL} border-transparent`}>
      <PanelHead
        id="home-tires"
        icon={CircleDot}
        label={t('tires')}
        aside={
          first.vehicle && (
            <span className="p-muted text-sm font-semibold">{first.vehicle.label}</span>
          )
        }
      />
      <h3 className="mt-3.5 text-[17px] font-extrabold leading-6">
        {t(tireSeasonKey(first.season, 'tiresStored'))}
      </h3>
      {facts(first) && (
        <p className="p-muted mt-0.5 text-sm font-semibold leading-5">{facts(first)}</p>
      )}
      <dl className="mt-3 flex flex-wrap gap-2 [&>div]:flex-[1_1_112px]">
        <Fact
          label={t('tiresTreadLeft')}
          value={first.treadDepthMm != null ? format.tread(first.treadDepthMm) : null}
          fallback={t('tiresNotMeasured')}
        />
        {first.storedSince && <Fact label={storedSince} value={format.day(first.storedSince)} />}
      </dl>
      {rest.length > 0 && (
        <ul className="mt-2 flex flex-col gap-2">
          {rest.map((set) => (
            <TileRow
              key={set.id}
              title={t(tireSeasonKey(set.season, 'tiresSeason'))}
              meta={joined([
                set.vehicle?.label,
                facts(set),
                set.storedSince && t('tiresStoredSince', { day: format.day(set.storedSince) }),
                set.treadDepthMm != null &&
                  t('tiresTreadLine', { depth: format.tread(set.treadDepthMm) }),
              ])}
            />
          ))}
        </ul>
      )}
    </PortalPanel>
  )
}

/**
 * One fact as a small soft tile: its name over its value. Without a value
 * the tile says so in a sentence of its own (`fallback`).
 */
function Fact({
  label,
  value,
  fallback,
}: {
  label: string
  value: string | null
  fallback?: string
}) {
  return (
    <div className="flex min-h-[52px] min-w-0 flex-col justify-center rounded-[14px] bg-[var(--p-soft)] px-3 py-2">
      {value != null ? (
        <>
          <dt className="p-muted text-xs font-semibold leading-4 first-letter:uppercase">
            {label}
          </dt>
          <dd className="text-[15px] font-extrabold leading-5">{value}</dd>
        </>
      ) : (
        <>
          <dt className="sr-only">{label}</dt>
          <dd className="p-muted text-[13px] font-semibold leading-[18px]">{fallback}</dd>
        </>
      )}
    </div>
  )
}
