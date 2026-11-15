import { ArrowRight, ArrowUpRight, Check, ChevronRight } from 'lucide-react'
import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import type {
  PortalHomeData,
  PortalHomeFormat,
  PortalHomeInvoice,
  PortalHomeJob,
  PortalHomeQuote,
  PortalHomeTireSet,
} from '../../../Lib/homeTypes'
import { portalHeroLine, portalJobLine, portalJobSteps, tireSeasonKey } from '../../Home/homeCopy'
import { PortalAcceptQuoteButton } from '../../Home/PortalAcceptQuoteButton'
import { PortalBadge, PortalEmptyState, PortalLinkButton, PortalListRow } from '../../Ui'
import type { PortalHomeProps } from '../types'
import { ACTION, ACTION_RULE, CELL, LABEL, Plate, SquareDot, TAG } from './parts'

type T = Awaited<ReturnType<typeof getTranslations>>

type Part = string | null | undefined | false
const joined = (parts: Part[]) => parts.filter(Boolean).join(' · ')
const spaced = (parts: Part[]) => parts.filter(Boolean).join(' ')

/** A row of cells with a hairline between every two, however they wrap. */
const BOARD_ROW = 'flex flex-wrap gap-px border-t bg-[var(--p-line)]'

/**
 * Garage's home: a pit board. A near-black ground cut into cells by thin
 * rules, nothing floating. The car in the workshop leads with the time it is
 * ready as one huge numeral and a three-cell status board under it; then what
 * needs an answer and what there is to pay; then a quieter deck with tyres,
 * cars and the next visit.
 *
 * From 1100 px the chat is a full-height column on the right edge that stays
 * in view while the board scrolls. Below that the chat is behind the
 * Messages tab and its latest line is a strip at the top.
 *
 * The board sizes itself by its own width (container queries), so it is
 * right with the chat beside it and without. Every cell can be missing; the
 * ones in the same row grow into the room.
 */
export async function Home({ orgParam, data, format, chat }: PortalHomeProps) {
  const [t, g] = await Promise.all([
    getTranslations('portal.home'),
    getTranslations('portal.themes.garage'),
  ])
  const base = `/portal/${orgParam}`
  const word = (key: string) => t(data.marine ? `${key}Marine` : key)
  const job = data.jobs[0]
  const otherJobs = data.jobs.slice(1)
  const tires = data.tires ?? []
  // With no car in the workshop, the next visit leads and is not said twice.
  const visitLeads = !job && data.nextVisit !== null
  const showVisitCell = Boolean(job)

  return (
    <div className="p-shell flex flex-1 flex-col min-[1100px]:flex-row">
      {/* The board runs out through the container's gutters, so its rules reach
          the edge; each cell pads by the same gutter, so what it holds lines
          up with the header. Beside the chat it stops at the chat's rule. */}
      <div
        className={`@container -mx-4 flex min-w-0 flex-1 flex-col sm:-mx-6 lg:-mx-10 ${
          chat ? 'min-[1100px]:mr-0' : ''
        }`}
      >
        {data.messages.enabled && (
          <MessagePreview data={data} format={format} href={`${base}/messages`} t={t} />
        )}

        {job ? (
          <JobHero job={job} data={data} format={format} t={t} g={g} />
        ) : visitLeads ? (
          <VisitHero data={data} format={format} t={t} />
        ) : (
          <NothingHero data={data} format={format} bookHref={`${base}/request-service`} t={t} />
        )}

        {(data.toAnswer.length > 0 || data.toPay.length > 0) && (
          <div className={BOARD_ROW}>
            {data.toAnswer[0] && (
              <QuoteCell
                quote={data.toAnswer[0]}
                more={data.toAnswer.length - 1}
                listHref={`${base}/quotes`}
                format={format}
                t={t}
              />
            )}
            {data.toPay[0] && (
              <InvoiceCell
                invoice={data.toPay[0]}
                count={data.toPayCount}
                overdueCount={data.toPayOverdueCount}
                total={data.toPayTotal}
                listHref={`${base}/invoices`}
                format={format}
                t={t}
              />
            )}
          </div>
        )}

        <div className={`${BOARD_ROW} flex-1`}>
          {otherJobs.length > 0 && (
            <DeckCell id="home-jobs" label={t('otherJobs')}>
              <ul>
                {otherJobs.map((other) => (
                  <PortalListRow
                    key={other.id}
                    as="li"
                    href={other.vehicle ? `${base}/vehicles/${other.vehicle.id}` : undefined}
                    title={other.title}
                    meta={joined([other.vehicle?.label, portalJobLine(other, format, t)])}
                  />
                ))}
              </ul>
            </DeckCell>
          )}

          {tires.length > 0 && (
            <TiresCell tires={tires} marine={data.marine} format={format} t={t} g={g} />
          )}

          <DeckCell id="home-cars" label={word('cars')}>
            {data.cars.length === 0 ? (
              <PortalEmptyState title={word('carsEmptyTitle')}>
                {word('carsEmptyBody')}
              </PortalEmptyState>
            ) : (
              <ul className="border-b">
                {data.cars.map((car) => (
                  <li key={car.id} className="border-t">
                    <Link
                      href={car.url}
                      className="group flex min-h-[72px] items-center gap-3 py-3 text-[color:var(--p-ink)] no-underline"
                    >
                      <span className="flex min-w-0 flex-1 flex-col gap-1">
                        <span className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                          <span className="p-display min-w-0 text-[24px] leading-[1.1] tracking-[0.03em] group-hover:underline">
                            {car.label}
                          </span>
                          {car.licensePlate && <Plate small>{car.licensePlate}</Plate>}
                        </span>
                        <span className="p-muted flex flex-wrap items-center gap-x-1.5 text-[15px] leading-5">
                          <span>{t('carVisits', { count: car.visits })}</span>
                          {car.inWorkshop && (
                            <>
                              <span aria-hidden>·</span>
                              <span className="inline-flex items-center gap-1.5 font-medium text-[color:var(--p-ink)]">
                                <SquareDot tone="accent" />
                                {t('carInWorkshop')}
                              </span>
                            </>
                          )}
                          {car.warranty && (
                            <>
                              <span aria-hidden>·</span>
                              <span
                                className={
                                  car.warranty === 'active'
                                    ? 'font-medium text-[color:var(--p-open)]'
                                    : 'font-medium text-[color:var(--p-ink)]'
                                }
                              >
                                {car.warranty === 'active'
                                  ? t('carWarrantyActive')
                                  : t('carWarrantyExpiring')}
                              </span>
                            </>
                          )}
                        </span>
                      </span>
                      <ChevronRight className="p-muted h-5 w-5 shrink-0" aria-hidden />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </DeckCell>

          {showVisitCell && (
            <DeckCell id="home-visit" label={t('nextVisit')}>
              {data.nextVisit ? (
                <>
                  <p className="p-display text-[24px] font-semibold leading-[1.15] tracking-[0.04em]">
                    {format.dayLong(data.nextVisit.startAt)}
                  </p>
                  <p className="p-display mt-1.5 whitespace-nowrap text-[length:clamp(48px,7cqw,64px)] leading-[0.85]">
                    {format.time(data.nextVisit.startAt)}
                  </p>
                  {data.nextVisit.vehicle && (
                    <p className="mt-3.5 font-semibold leading-snug">
                      {data.nextVisit.vehicle.label}
                    </p>
                  )}
                  <p
                    className={`p-muted text-[15px] leading-snug ${data.nextVisit.vehicle ? '' : 'mt-3.5'}`}
                  >
                    {data.nextVisit.title}
                  </p>
                  <WhereToGo data={data} t={t} className="mt-auto" />
                </>
              ) : (
                <PortalEmptyState
                  title={t('nextVisitEmptyTitle')}
                  action={
                    <PortalLinkButton variant="outline" href={`${base}/request-service`}>
                      {t('bookVisit')}
                    </PortalLinkButton>
                  }
                >
                  {word('nextVisitEmptyBody')}
                </PortalEmptyState>
              )}
            </DeckCell>
          )}

          {data.requests.length > 0 && (
            <DeckCell id="home-requests" label={t('requests')}>
              <ul>
                {data.requests.map((request) => (
                  <PortalListRow
                    key={request.id}
                    as="li"
                    title={<span className="line-clamp-3">{request.description}</span>}
                    meta={joined([
                      t('requestSent', { day: format.day(request.createdAt) }),
                      request.vehicle?.label,
                      t('requestWaiting'),
                    ])}
                  />
                ))}
              </ul>
            </DeckCell>
          )}
        </div>
      </div>

      {chat && (
        <aside
          aria-label={t('messagesLabel', { workshop: data.workshop.name })}
          className="hidden shrink-0 border-l bg-[var(--p-surface)] min-[1100px]:sticky min-[1100px]:-mr-10 min-[1100px]:top-[var(--p-chrome-top)] min-[1100px]:block min-[1100px]:h-[calc(100svh_-_var(--p-chrome-top))] min-[1100px]:min-h-[480px] min-[1100px]:w-[clamp(380px,28vw,480px)] min-[1100px]:self-start"
        >
          {chat}
        </aside>
      )}
    </div>
  )
}

/** The latest line of the chat, below the desk width, where the chat is a tab away. */
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
      className="flex min-h-12 items-center gap-2.5 border-b bg-[var(--p-surface)] px-4 py-2 text-[color:var(--p-ink)] no-underline sm:px-6 lg:px-10 min-[1100px]:hidden"
    >
      <SquareDot tone={data.messages.unread > 0 ? 'accent' : 'muted'} />
      <span className="sr-only">{t('messagePreviewOpen', { workshop })}: </span>
      {last ? (
        <>
          <span className="min-w-0 flex-1 truncate text-sm">
            <span className="font-semibold">
              {last.direction === 'inbound'
                ? t('messagePreviewYou')
                : t('messagePreviewFrom', { name: last.authorName ?? workshop })}
            </span>{' '}
            <span className="p-muted">{last.body || t('messagePreviewPhoto')}</span>
          </span>
          <span className="p-muted whitespace-nowrap text-[13px]">
            {format.isPast(last.createdAt)
              ? format.day(last.createdAt)
              : format.time(last.createdAt)}
          </span>
        </>
      ) : (
        <span className="min-w-0 flex-1 text-sm font-semibold">
          {t('messagePreviewEmpty', { workshop })}
        </span>
      )}
      <ChevronRight className="p-muted h-[18px] w-[18px] shrink-0" aria-hidden />
    </Link>
  )
}

/**
 * The time a job turns on, when it has one that still lies ahead: when the
 * car is ready, or when it is expected in. The same cases the shared opening
 * sentence names a time in, so the numeral and the sentence never disagree.
 */
function jobTime(
  job: PortalHomeJob,
  format: PortalHomeFormat,
  g: T
): { label: string; time: string } | null {
  if (job.stage === 'working' && job.promisedAt && !format.isPast(job.promisedAt)) {
    return {
      label: g('readyAround', { day: format.relativeDay(job.promisedAt) }),
      time: format.time(job.promisedAt),
    }
  }
  if (job.stage === 'booked' && job.startAt && !format.isPast(job.startAt)) {
    return {
      label: g('expectedAt', { day: format.relativeDay(job.startAt) }),
      time: format.time(job.startAt),
    }
  }
  return null
}

/**
 * A time as the board's one huge numeral. A twelve-hour time ("12:30 PM") is
 * set smaller so it keeps its line beside the update on a desk.
 */
function Numeral({ children }: { children: string }) {
  return (
    <span
      className={`p-display block whitespace-nowrap leading-[0.8] tracking-[-0.01em] ${
        children.length > 5
          ? 'text-[length:clamp(60px,14cqw,120px)]'
          : 'text-[length:clamp(88px,22cqw,168px)]'
      }`}
    >
      {children}
    </span>
  )
}

/** The car in the workshop: which, when, how far, and the latest word on it. */
function JobHero({
  job,
  data,
  format,
  t,
  g,
}: {
  job: PortalHomeJob
  data: PortalHomeData
  format: PortalHomeFormat
  t: T
  g: T
}) {
  const line = portalHeroLine(data, format, t)
  const steps = portalJobSteps(job, t)
  const now = steps.find((step) => step.state === 'now')
  const time = jobTime(job, format, g)
  const update = job.update

  return (
    <section
      aria-labelledby="home-hero"
      className="flex flex-col gap-5 px-4 pb-5 pt-5 sm:px-6 lg:px-10 @[760px]:gap-7 @[760px]:py-8"
    >
      <p className="flex flex-wrap items-center gap-x-3 gap-y-2 @[760px]:gap-x-4">
        {now && (
          <span className={`${TAG} bg-[var(--p-accent)] text-[color:var(--p-on-accent)]`}>
            {now.label}
          </span>
        )}
        {job.vehicle && (
          <span className="p-display min-w-0 text-[22px] tracking-[0.03em] @[760px]:text-[28px]">
            {job.vehicle.label}
          </span>
        )}
        {job.vehicle?.licensePlate && <Plate>{job.vehicle.licensePlate}</Plate>}
        <span className="p-muted min-w-0">{job.title}</span>
      </p>

      <div className="flex flex-col gap-5 @[860px]:flex-row @[860px]:items-end @[860px]:gap-12">
        {time ? (
          // The sentence is what a screen reader hears; the board shows it as a label and a numeral.
          <h1 id="home-hero" className="flex min-w-0 flex-col gap-2 @[860px]:shrink-0">
            <span className="sr-only">{line}</span>
            <span aria-hidden className={`${LABEL} p-muted`}>
              {time.label}
            </span>
            <span aria-hidden>
              <Numeral>{time.time}</Numeral>
            </span>
          </h1>
        ) : (
          <h1
            id="home-hero"
            className="p-display min-w-0 text-[length:clamp(34px,6.5cqw,68px)] leading-[0.98] @[860px]:flex-1"
          >
            {line}
          </h1>
        )}

        {update && (
          <div className="flex min-w-0 flex-col border-t pt-4 @[860px]:flex-1 @[860px]:justify-end @[860px]:self-stretch @[860px]:border-l @[860px]:border-t-0 @[860px]:pl-10 @[860px]:pt-0">
            <p className={`${LABEL} p-muted`}>
              {t('latestUpdate', {
                when: format.isPast(update.at)
                  ? `${format.day(update.at)}, ${format.time(update.at)}`
                  : format.time(update.at),
              })}
            </p>
            <p className="mt-2 line-clamp-4 max-w-[52ch] whitespace-pre-line text-[15px] font-medium leading-[1.45] @[760px]:text-xl @[760px]:leading-[1.4]">
              {update.message ?? t('updateFallback')}
            </p>
            <a href={update.url} className={`${ACTION} mt-1`}>
              <span className={ACTION_RULE}>{t('seeUpdate')}</span>
              <ArrowRight className="h-[18px] w-[18px] shrink-0" strokeWidth={2.4} aria-hidden />
            </a>
          </div>
        )}
      </div>

      <ol className="flex border" aria-label={t('stepsLabel')}>
        {steps.map((step, index) => {
          const isNow = step.state === 'now'
          return (
            <li
              key={step.label}
              aria-current={isNow ? 'step' : undefined}
              className={`flex min-h-[92px] min-w-0 flex-1 flex-col gap-1 p-2.5 @[820px]:min-h-[88px] @[820px]:flex-row @[820px]:items-center @[820px]:gap-3.5 @[820px]:px-5 @[820px]:py-3 ${
                index > 0 ? 'border-l' : ''
              } ${
                isNow
                  ? 'bg-[var(--p-accent)] text-[color:var(--p-on-accent)] @[820px]:flex-[1.35]'
                  : step.state === 'done'
                    ? 'bg-[var(--p-surface)]'
                    : 'p-muted'
              }`}
            >
              <span
                aria-hidden
                className={`p-display text-sm leading-none tracking-[0.1em] @[820px]:text-[40px] @[820px]:tracking-normal ${
                  step.state === 'done' ? 'p-muted' : ''
                }`}
              >
                {`0${index + 1}`}
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="p-display text-[15px] font-semibold tracking-[0.05em] @[820px]:text-xl">
                  {step.label}
                </span>
                {step.state === 'done' && (
                  <span className="flex items-center gap-1.5 text-[13px] leading-4 text-[color:var(--p-open)] @[820px]:text-[15px] @[820px]:leading-5">
                    <Check className="h-4 w-4 shrink-0" strokeWidth={2.6} aria-hidden />
                    {g('stepDone')}
                  </span>
                )}
                {isNow && (
                  <span className="hidden text-[15px] font-medium leading-5 @[820px]:block">
                    {job.title}
                  </span>
                )}
                {step.state === 'todo' && (
                  <span className="text-[13px] leading-4 @[820px]:text-[15px] @[820px]:leading-5">
                    {index === 2 && time && job.stage === 'working'
                      ? g('stepNotYetAround', { time: time.time })
                      : g('stepNotYet')}
                  </span>
                )}
              </span>
              {isNow && (
                <span
                  className={`${TAG} mt-auto self-start bg-[var(--p-on-accent)] text-[color:var(--p-accent)] @[820px]:mt-0 @[820px]:self-center`}
                >
                  {g('stepNow')}
                </span>
              )}
            </li>
          )
        })}
      </ol>
    </section>
  )
}

/** No car in the workshop, and a visit ahead: the visit leads. */
function VisitHero({ data, format, t }: { data: PortalHomeData; format: PortalHomeFormat; t: T }) {
  const visit = data.nextVisit
  if (!visit) return null
  return (
    <section
      aria-labelledby="home-hero"
      className="flex flex-col gap-5 px-4 pb-6 pt-5 sm:px-6 lg:px-10 @[760px]:gap-7 @[760px]:py-8"
    >
      <p className="p-muted">{portalHeroLine(data, format, t)}</p>
      <div className="flex flex-col gap-5 @[860px]:flex-row @[860px]:items-end @[860px]:gap-12">
        <h1 id="home-hero" className="flex min-w-0 flex-col gap-2 @[860px]:shrink-0">
          <span className={`${LABEL} p-muted`}>
            {t('nextVisit')}
            <span aria-hidden> · </span>
            <span className="text-[color:var(--p-ink)]">{format.dayLong(visit.startAt)}</span>
          </span>
          <Numeral>{format.time(visit.startAt)}</Numeral>
        </h1>
        <div className="flex min-w-0 flex-col border-t pt-4 @[860px]:flex-1 @[860px]:justify-end @[860px]:self-stretch @[860px]:border-l @[860px]:border-t-0 @[860px]:pl-10 @[860px]:pt-0">
          <p className="flex flex-wrap items-center gap-x-3 gap-y-2">
            {visit.vehicle && (
              <span className="p-display min-w-0 text-[22px] tracking-[0.03em] @[760px]:text-[28px]">
                {visit.vehicle.label}
              </span>
            )}
            {visit.vehicle?.licensePlate && <Plate>{visit.vehicle.licensePlate}</Plate>}
          </p>
          <p className="mt-1.5 text-[15px] font-medium leading-[1.45] @[760px]:text-xl">
            {visit.title}
          </p>
          <WhereToGo data={data} t={t} className="mt-3" />
        </div>
      </div>
    </section>
  )
}

/** Nothing in the workshop and nothing booked: say so calmly and offer a visit. */
function NothingHero({
  data,
  format,
  bookHref,
  t,
}: {
  data: PortalHomeData
  format: PortalHomeFormat
  bookHref: string
  t: T
}) {
  return (
    <section
      aria-labelledby="home-hero"
      className="flex flex-col items-start gap-4 px-4 pb-7 pt-6 sm:px-6 lg:px-10 @[760px]:gap-5 @[760px]:pb-12 @[760px]:pt-10"
    >
      <h1
        id="home-hero"
        className="p-display max-w-[22ch] text-[length:clamp(34px,6.5cqw,68px)] leading-[0.98]"
      >
        {portalHeroLine(data, format, t)}
      </h1>
      <p className="p-muted max-w-[52ch] text-[15px] leading-normal @[760px]:text-lg">
        {t(data.marine ? 'heroNothingBodyMarine' : 'heroNothingBody')}
      </p>
      <PortalLinkButton variant="accent" size="lg" href={bookHref} className="mt-1">
        {t('bookVisit')}
        <ArrowRight className="h-5 w-5 shrink-0" strokeWidth={2.4} aria-hidden />
      </PortalLinkButton>
    </section>
  )
}

/** The workshop's address with the way there, under a rule. */
function WhereToGo({ data, t, className }: { data: PortalHomeData; t: T; className?: string }) {
  const { address, directionsUrl } = data.workshop
  if (!address) return null
  return (
    <p
      className={`flex flex-wrap items-center justify-between gap-x-4 border-t pt-1 ${className ?? ''}`}
    >
      <span className="p-muted min-w-0 py-2 text-[15px] leading-snug">{address}</span>
      {directionsUrl && (
        <a href={directionsUrl} target="_blank" rel="noopener noreferrer" className={ACTION}>
          <span className={ACTION_RULE}>{t('directions')}</span>
          <ArrowUpRight className="h-4 w-4 shrink-0" strokeWidth={2.4} aria-hidden />
        </a>
      )}
    </p>
  )
}

/** The head of an action cell: what it is, marked, and which paper on the right. */
function ActionHead({
  id,
  label,
  aside,
  danger,
}: {
  id: string
  label: string
  aside: string
  danger?: boolean
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
      <h2 id={id} className={`${LABEL} flex items-center gap-2.5`}>
        <SquareDot tone={danger ? 'danger' : 'accent'} large />
        {label}
      </h2>
      <span className={`${LABEL} p-muted`}>{aside}</span>
    </div>
  )
}

/** What it is for on the left, the amount large on the right; the amount drops below a long title. */
function TitleAndAmount({
  title,
  meta,
  amount,
  danger,
}: {
  title: string
  meta: React.ReactNode
  amount: string
  danger?: boolean
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
      <div className="flex min-w-0 flex-col gap-0.5">
        <p className="text-base font-semibold leading-snug @[760px]:text-xl">{title}</p>
        <p className="p-muted flex flex-wrap items-center gap-x-2 gap-y-1 text-sm leading-snug @[760px]:text-[15px]">
          {meta}
        </p>
      </div>
      <p
        className={`p-display whitespace-nowrap text-[length:clamp(34px,5.4cqw,56px)] leading-[0.9] ${
          danger ? 'text-[color:var(--p-danger)]' : ''
        }`}
      >
        {amount}
      </p>
    </div>
  )
}

function QuoteCell({
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
    <section
      aria-labelledby="home-answer"
      className={`${CELL} flex-[1_1_420px] gap-3.5 bg-[var(--p-bg)]`}
    >
      <ActionHead
        id="home-answer"
        label={t('needsAnswer')}
        aside={quote.quoteNumber ? t('quoteNumber', { number: quote.quoteNumber }) : t('quote')}
      />
      <TitleAndAmount
        title={quote.title}
        meta={joined([
          quote.vehicle?.label,
          quote.validUntil && t('validUntil', { day: format.day(quote.validUntil) }),
        ])}
        amount={format.money(quote.total)}
      />
      <div className="mt-auto pt-2">
        <PortalAcceptQuoteButton quoteId={quote.id}>
          <PortalLinkButton variant="outline" href={quote.url}>
            {t('readQuote')}
          </PortalLinkButton>
        </PortalAcceptQuoteButton>
      </div>
      {more > 0 && (
        <Link href={listHref} className="p-link p-link--block self-start text-sm">
          {t('moreQuotes', { count: more })}
        </Link>
      )}
    </section>
  )
}

/**
 * What there is to pay. One invoice is the cell: its title and its amount.
 * Several lead with the sum of them all as the numeral, how many there are
 * and how many are overdue; then the one to deal with first, with its own
 * amount and buttons; then the way to the whole list.
 */
function InvoiceCell({
  invoice,
  count,
  overdueCount,
  total,
  listHref,
  format,
  t,
}: {
  invoice: PortalHomeInvoice
  count: number
  overdueCount: number
  total: number
  listHref: string
  format: PortalHomeFormat
  t: T
}) {
  const several = count > 1
  const number = invoice.invoiceNumber
    ? t('invoiceNumber', { number: invoice.invoiceNumber })
    : t('invoice')
  const facts = joined([
    several && number,
    invoice.vehicle?.label,
    invoice.dueAt && !invoice.overdue && t('due', { day: format.day(invoice.dueAt) }),
    invoice.paid > 0 &&
      t('paidSoFar', { paid: format.money(invoice.paid), total: format.money(invoice.total) }),
  ])
  const meta = (
    <>
      {invoice.overdue && invoice.dueAt && (
        <PortalBadge tone="danger">
          {t('overdueSince', { day: format.day(invoice.dueAt) })}
        </PortalBadge>
      )}
      {facts && <span>{facts}</span>}
    </>
  )
  const buttons = (
    <div className="mt-auto flex flex-wrap gap-2.5 pt-2">
      {invoice.payUrl && (
        <PortalLinkButton variant="accent" href={invoice.payUrl}>
          {t('payNow')}
        </PortalLinkButton>
      )}
      <PortalLinkButton variant={invoice.payUrl ? 'outline' : 'strong'} href={invoice.viewUrl}>
        {t('seeInvoice')}
      </PortalLinkButton>
    </div>
  )

  if (!several) {
    return (
      <section
        aria-labelledby="home-pay"
        className={`${CELL} flex-[1_1_420px] gap-3.5 bg-[var(--p-bg)]`}
      >
        <ActionHead
          id="home-pay"
          label={t('toPay')}
          danger={invoice.overdue}
          aside={joined([number, format.day(invoice.date)])}
        />
        <TitleAndAmount
          title={invoice.title}
          danger={invoice.overdue}
          meta={meta}
          amount={format.money(invoice.balance)}
        />
        {buttons}
      </section>
    )
  }

  return (
    <section
      aria-labelledby="home-pay"
      className={`${CELL} flex-[1_1_420px] gap-3.5 bg-[var(--p-bg)]`}
    >
      <ActionHead
        id="home-pay"
        label={t('toPay')}
        danger={overdueCount > 0}
        aside={t('toPayCount', { count })}
      />
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
        <p className="p-display whitespace-nowrap text-[length:clamp(44px,7cqw,72px)] leading-[0.85]">
          {format.money(total)}
        </p>
        {overdueCount > 0 && (
          <PortalBadge tone="danger">{t('toPayOverdueCount', { count: overdueCount })}</PortalBadge>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-3 border-t pt-3.5">
        <p className={`${LABEL} p-muted`}>{t(invoice.overdue ? 'toPayMostUrgent' : 'toPayNext')}</p>
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-1">
          <div className="flex min-w-0 flex-col gap-0.5">
            <p className="text-base font-semibold leading-snug @[760px]:text-lg">{invoice.title}</p>
            <p className="p-muted flex flex-wrap items-center gap-x-2 gap-y-1 text-sm leading-snug">
              {meta}
            </p>
          </div>
          <p
            className={`p-display whitespace-nowrap text-[28px] leading-none ${
              invoice.overdue ? 'text-[color:var(--p-danger)]' : ''
            }`}
          >
            {format.money(invoice.balance)}
          </p>
        </div>
        {buttons}
      </div>
      <Link href={listHref} className={ACTION}>
        <span className={ACTION_RULE}>{t('seeAllInvoices', { count })}</span>
        <ArrowRight className="h-[18px] w-[18px] shrink-0" strokeWidth={2.4} aria-hidden />
      </Link>
    </section>
  )
}

/** A cell of the quieter deck under the actions: a label and what it holds. */
function DeckCell({
  id,
  label,
  aside,
  children,
}: {
  id: string
  label: string
  aside?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section
      aria-labelledby={id}
      className={`${CELL} flex-[1_1_360px] bg-[var(--p-garage-deck,var(--p-bg))]`}
    >
      <div className="mb-3.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <h2 id={id} className={`${LABEL} p-muted`}>
          {label}
        </h2>
        {aside}
      </div>
      {children}
    </section>
  )
}

/** Tyres the workshop stores: the first set as a spec sheet, any others as lines. */
function TiresCell({
  tires,
  marine,
  format,
  t,
  g,
}: {
  tires: PortalHomeTireSet[]
  marine: boolean
  format: PortalHomeFormat
  t: T
  g: T
}) {
  const [first, ...rest] = tires
  const setLine = (set: PortalHomeTireSet) =>
    joined([
      t('tiresCount', { count: set.quantity }),
      set.studded && t('tiresStudded'),
      set.withRims && t('tiresOnRims'),
    ])
  const specs: { label: string; value: string; strong?: boolean }[] = []
  if (first.vehicle) {
    specs.push({ label: g(marine ? 'tireCarMarine' : 'tireCar'), value: first.vehicle.label })
  }
  if (first.brand || first.model) {
    specs.push({ label: g('tireMake'), value: spaced([first.brand, first.model]) })
  }
  if (first.size) specs.push({ label: g('tireSize'), value: first.size })
  specs.push({ label: g('tireSet'), value: setLine(first) })
  specs.push({
    label: g('tireTread'),
    value: first.treadDepthMm != null ? format.tread(first.treadDepthMm) : t('tiresNotMeasured'),
    strong: first.treadDepthMm != null,
  })

  return (
    <DeckCell
      id="home-tires"
      label={t('tires')}
      aside={
        first.storedSince && (
          <span className="p-muted inline-block text-sm first-letter:uppercase">
            {t('tiresStoredSince', { day: format.day(first.storedSince) })}
          </span>
        )
      }
    >
      <p className="text-lg font-semibold leading-snug">
        {t(tireSeasonKey(first.season, 'tiresStored'))}
      </p>
      <dl className="mt-3 border-b text-[15px]">
        {specs.map((row) => (
          <div
            key={row.label}
            className="flex min-h-8 items-baseline justify-between gap-4 border-t py-1"
          >
            <dt className="p-muted shrink-0">{row.label}</dt>
            <dd className={`min-w-0 text-right ${row.strong ? 'font-semibold' : ''}`}>
              {row.value}
            </dd>
          </div>
        ))}
      </dl>
      {rest.length > 0 && (
        <ul className="mt-2">
          {rest.map((set) => (
            <PortalListRow
              key={set.id}
              as="li"
              title={t(tireSeasonKey(set.season, 'tiresSeason'))}
              meta={joined([
                set.vehicle?.label,
                spaced([set.brand, set.model]),
                set.size,
                setLine(set),
                set.storedSince && t('tiresStoredSince', { day: format.day(set.storedSince) }),
                set.treadDepthMm != null &&
                  t('tiresTreadLine', { depth: format.tread(set.treadDepthMm) }),
              ])}
            />
          ))}
        </ul>
      )}
    </DeckCell>
  )
}
