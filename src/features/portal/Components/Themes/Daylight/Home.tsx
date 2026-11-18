import { ArrowRight, ChevronRight, MapPin } from 'lucide-react'
import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import type {
  PortalHomeData,
  PortalHomeFormat,
  PortalHomeQuote,
  PortalHomeTireSet,
} from '../../../Lib/homeTypes'
import { PortalAcceptQuoteButton } from '../../Home/PortalAcceptQuoteButton'
import { PortalRequestText } from '../../Home/PortalRequestText'
import { portalHeroLine, portalJobLine, portalJobSteps, tireSeasonKey } from '../../Home/homeCopy'
import {
  PortalBadge,
  PortalEmptyState,
  PortalLinkButton,
  PortalListRow,
  PortalPanel,
  PortalPlate,
  PortalSectionLabel,
  PortalStatusDot,
} from '../../Ui'
import type { PortalHomeProps } from '../types'

type T = Awaited<ReturnType<typeof getTranslations>>

type Part = string | null | undefined | false
const joined = (parts: Part[]) => parts.filter(Boolean).join(' · ')
const spaced = (parts: Part[]) => parts.filter(Boolean).join(' ')

/**
 * Daylight's home: light and calm, with the car that is in the workshop in a
 * dark band at the top.
 *
 * On a desk the page is two columns that fill the width: what is happening
 * on the left (the band, what needs an answer and what there is to pay, then
 * tyres, cars and the next visit) and the chat on the right, which stays in
 * view while the left scrolls. Below 1024 px it is one column, the chat is
 * behind the Messages tab and its latest line sits at the top.
 *
 * The left column sizes its own rows by how wide it is (container queries),
 * not by the screen, so it is right with the chat beside it and without.
 * Every block can be missing; the ones that remain close ranks.
 */
export async function Home({ orgParam, data, format, chat }: PortalHomeProps) {
  const t = await getTranslations('portal.home')
  const base = `/portal/${orgParam}`
  const word = (key: string) => t(data.marine ? `${key}Marine` : key)
  const otherJobs = data.jobs.slice(1)
  const tires = data.tires ?? []

  return (
    <div className="p-shell flex flex-1 flex-col gap-3 pb-5 pt-3 sm:gap-5 sm:pb-8 sm:pt-6 lg:flex-row lg:items-start lg:gap-7 lg:pt-7">
      <div className="@container flex min-w-0 flex-1 flex-col gap-3 sm:gap-5">
        {data.messages.enabled && (
          <MessagePreview data={data} format={format} href={`${base}/messages`} t={t} />
        )}

        <Hero data={data} format={format} bookHref={`${base}/request-service`} t={t} word={word} />

        {(data.toAnswer.length > 0 || data.toPay.length > 0) && (
          <div className="flex flex-wrap gap-3 sm:gap-5">
            {data.toAnswer[0] && (
              <QuoteCard
                quote={data.toAnswer[0]}
                more={data.toAnswer.length - 1}
                listHref={`${base}/quotes`}
                format={format}
                t={t}
              />
            )}
            {data.toPay[0] && (
              <InvoiceCard data={data} listHref={`${base}/invoices`} format={format} t={t} />
            )}
          </div>
        )}

        {/* As many columns as fit at 300 px or more: a block moves to the
            next row before it is squeezed. */}
        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,300px),1fr))] gap-3 sm:gap-5">
          {tires.length > 0 && <TiresCard tires={tires} format={format} t={t} />}

          <PortalPanel aria-labelledby="home-cars" className="flex flex-col">
            <PortalSectionLabel id="home-cars" className="mb-2">
              {word('cars')}
            </PortalSectionLabel>
            {data.cars.length === 0 ? (
              <PortalEmptyState title={word('carsEmptyTitle')} className="mt-1">
                {word('carsEmptyBody')}
              </PortalEmptyState>
            ) : (
              <ul>
                {data.cars.map((car) => (
                  <PortalListRow
                    key={car.id}
                    as="li"
                    href={car.url}
                    title={<span className="whitespace-nowrap">{car.label}</span>}
                    meta={
                      <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        {car.inWorkshop && <PortalBadge>{t('carInWorkshop')}</PortalBadge>}
                        <span>
                          {joined([
                            car.licensePlate,
                            t('carVisits', { count: car.visits }),
                            car.warranty === 'active' && t('carWarrantyActive'),
                            car.warranty === 'expiring' && t('carWarrantyExpiring'),
                          ])}
                        </span>
                      </span>
                    }
                  />
                ))}
              </ul>
            )}
          </PortalPanel>

          <PortalPanel aria-labelledby="home-visit" className="flex flex-col gap-2.5">
            <PortalSectionLabel id="home-visit">{t('nextVisit')}</PortalSectionLabel>
            {data.nextVisit ? (
              <>
                <p className="p-display text-xl">
                  {t('visitWhen', {
                    day: format.dayLong(data.nextVisit.startAt),
                    time: format.time(data.nextVisit.startAt),
                  })}
                </p>
                <p className="p-muted text-sm">
                  {joined([data.nextVisit.vehicle?.label, data.nextVisit.title])}
                </p>
                {data.workshop.address && data.workshop.directionsUrl && (
                  <p className="p-muted mt-auto flex items-start gap-2.5 pt-3 text-sm">
                    <MapPin className="mt-0.5 h-[18px] w-[18px] shrink-0" aria-hidden />
                    <span className="min-w-0">
                      {data.workshop.address}
                      {' · '}
                      <a
                        href={data.workshop.directionsUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-link whitespace-nowrap"
                      >
                        {t('directions')}
                      </a>
                    </span>
                  </p>
                )}
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
          </PortalPanel>

          {otherJobs.length > 0 && (
            <PortalPanel aria-labelledby="home-jobs" className="flex flex-col">
              <PortalSectionLabel id="home-jobs" className="mb-2">
                {t('otherJobs')}
              </PortalSectionLabel>
              <ul>
                {otherJobs.map((job) => (
                  <PortalListRow
                    key={job.id}
                    as="li"
                    href={job.vehicle ? `${base}/vehicles/${job.vehicle.id}` : undefined}
                    title={job.title}
                    meta={joined([job.vehicle?.label, portalJobLine(job, format, t)])}
                  />
                ))}
              </ul>
            </PortalPanel>
          )}

          {data.requests.length > 0 && (
            <PortalPanel aria-labelledby="home-requests" className="flex flex-col">
              <PortalSectionLabel id="home-requests" className="mb-2">
                {t('requests')}
              </PortalSectionLabel>
              <ul>
                {data.requests.map((request) => (
                  <PortalListRow
                    key={request.id}
                    as="li"
                    title={<PortalRequestText text={request.description} />}
                    meta={joined([
                      t('requestSent', { day: format.day(request.createdAt) }),
                      request.vehicle?.label,
                      t('requestWaiting'),
                    ])}
                  />
                ))}
              </ul>
            </PortalPanel>
          )}
        </div>
      </div>

      {chat && (
        <aside
          aria-label={t('messagesLabel', { workshop: data.workshop.name })}
          className="p-panel p-panel--flush hidden shrink-0 lg:sticky lg:top-[100px] lg:flex lg:h-[calc(100svh-128px)] lg:max-h-[920px] lg:min-h-[480px] lg:w-[380px] lg:flex-col xl:w-[430px]"
        >
          {chat}
        </aside>
      )}
    </div>
  )
}

/** The latest line of the chat, on a phone, where the chat is a tab away. */
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
      className="flex min-h-[52px] items-center gap-2.5 rounded-[min(var(--p-radius),16px)] border bg-[var(--p-surface)] px-3.5 py-2 lg:hidden"
    >
      <PortalStatusDot tone={data.messages.unread > 0 ? 'accent' : 'closed'} />
      <span className="sr-only">{t('messagePreviewOpen', { workshop })}: </span>
      {last ? (
        <>
          <span className="min-w-0 flex-1 truncate text-sm">
            <span className="font-semibold">
              {last.direction === 'inbound'
                ? t('messagePreviewYou')
                : t('messagePreviewFrom', { name: last.authorName ?? workshop })}
            </span>{' '}
            {last.body || t('messagePreviewPhoto')}
          </span>
          <span className="p-muted whitespace-nowrap text-xs">
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

/** The dark band: the car in the workshop, or that nothing is. */
function Hero({
  data,
  format,
  bookHref,
  t,
  word,
}: {
  data: PortalHomeData
  format: PortalHomeFormat
  bookHref: string
  t: T
  word: (key: string) => string
}) {
  const job = data.jobs[0]
  const line = portalHeroLine(data, format, t)

  if (!job) {
    return (
      <PortalPanel
        tone="hero"
        aria-labelledby="home-hero"
        className="flex flex-col gap-5 p-5 sm:p-7 @[820px]:flex-row @[820px]:gap-8 @[820px]:px-8"
      >
        <div className="flex min-w-0 flex-1 flex-col items-start gap-4">
          <h1
            id="home-hero"
            className="p-display text-[28px] leading-[1.1] sm:text-4xl @[820px]:text-[40px] @[820px]:leading-[1.08]"
          >
            {line}
          </h1>
          <p className="p-muted max-w-[52ch] text-[15px] leading-normal">
            {word('heroNothingBody')}
          </p>
          <PortalLinkButton variant="hero" href={bookHref} className="mt-1">
            {t('bookVisit')}
            <ArrowRight className="h-4 w-4 shrink-0" aria-hidden />
          </PortalLinkButton>
        </div>
        <HeroAside label={data.workshop.name}>
          <WorkshopNow data={data} t={t} />
        </HeroAside>
      </PortalPanel>
    )
  }

  const steps = portalJobSteps(job, t)
  const update = job.update
  return (
    <PortalPanel
      tone="hero"
      aria-labelledby="home-hero"
      className="flex flex-col gap-5 p-5 sm:p-7 @[820px]:flex-row @[820px]:gap-8 @[820px]:px-8"
    >
      <div className="flex min-w-0 flex-1 flex-col gap-3.5">
        <p className="p-muted flex flex-wrap items-center gap-x-2.5 gap-y-1 text-sm">
          {job.vehicle && <span className="p-ink font-semibold">{job.vehicle.label}</span>}
          {job.vehicle?.licensePlate && <PortalPlate>{job.vehicle.licensePlate}</PortalPlate>}
          <span>{job.title}</span>
        </p>
        <h1
          id="home-hero"
          className="p-display text-[28px] leading-[1.1] sm:text-4xl @[820px]:text-[40px] @[820px]:leading-[1.08]"
        >
          {line}
        </h1>
        <ol className="p-steps mt-1" aria-label={t('stepsLabel')}>
          {steps.map((step) => (
            <li
              key={step.label}
              className="p-step"
              data-state={step.state}
              aria-current={step.state === 'now' ? 'step' : undefined}
            >
              {step.label}
            </li>
          ))}
        </ol>
      </div>

      {update ? (
        <HeroAside
          label={t('latestUpdate', {
            when: format.isPast(update.at)
              ? `${format.day(update.at)}, ${format.time(update.at)}`
              : format.time(update.at),
          })}
        >
          <p className="line-clamp-4 whitespace-pre-line text-[15px] leading-[1.45]">
            {update.message ?? t('updateFallback')}
          </p>
          <PortalLinkButton variant="hero" href={update.url} className="min-h-11 text-sm">
            {t('seeUpdate')}
            <ArrowRight className="h-4 w-4 shrink-0" aria-hidden />
          </PortalLinkButton>
        </HeroAside>
      ) : (
        // Nothing shared yet: what happens next, and whether the workshop is open.
        <HeroAside label={t('nextStep')}>
          <p className="text-[15px] leading-[1.45]">
            {job.stage === 'booked'
              ? word('nextStepWorking')
              : job.stage === 'ready'
                ? t('nextStepCollect')
                : t(data.messages.enabled ? 'nextStepReady' : 'nextStepReadyNoChat')}
          </p>
          <WorkshopNow data={data} t={t} />
        </HeroAside>
      )}
    </PortalPanel>
  )
}

/**
 * The band's second half: beside the headline on a wide band, under it and
 * above a rule on a narrow one. The band always has one, so its right side
 * is never left empty.
 */
function HeroAside({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col items-start gap-2.5 border-t pt-5 @[820px]:w-[300px] @[820px]:shrink-0 @[820px]:justify-center @[820px]:border-l @[820px]:border-t-0 @[820px]:pl-7 @[820px]:pt-0">
      <PortalSectionLabel as="p" className="text-xs">
        {label}
      </PortalSectionLabel>
      {children}
    </div>
  )
}

/** Whether the workshop is open right now, and its number to call. */
function WorkshopNow({ data, t }: { data: PortalHomeData; t: T }) {
  const { workshop } = data
  return (
    <>
      <p className="p-muted flex items-center gap-2 text-sm">
        <PortalStatusDot tone={workshop.openNow ? 'open' : 'closed'} />
        {workshop.openLine}
      </p>
      {workshop.phone && workshop.phoneHref && (
        <a href={workshop.phoneHref} className="p-link p-link--block text-[15px]">
          {workshop.phone}
        </a>
      )}
      {!workshop.phone && workshop.address && workshop.directionsUrl && (
        <a
          href={workshop.directionsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="p-link p-link--block text-[15px]"
        >
          {t('directions')}
        </a>
      )}
    </>
  )
}

/** The head of a card: what it is on the left, a date on the right. */
function CardHead({ id, label, aside }: { id: string; label: string; aside?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
      <PortalSectionLabel id={id}>{label}</PortalSectionLabel>
      {aside}
    </div>
  )
}

/** A title and an amount on one line; the amount drops below a long title. */
function TitleAndAmount({ title, amount }: { title: string; amount: string }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
      <p className="p-display min-w-0 text-xl tracking-[-0.01em] sm:text-2xl">{title}</p>
      <p className="p-display whitespace-nowrap text-xl sm:text-2xl">{amount}</p>
    </div>
  )
}

function QuoteCard({
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
    <PortalPanel aria-labelledby="home-answer" className="flex flex-[1_1_340px] flex-col gap-3.5">
      <CardHead
        id="home-answer"
        label={t('needsAnswer')}
        aside={
          quote.validUntil && (
            <span className="p-muted text-[13px]">
              {t('validUntil', { day: format.day(quote.validUntil) })}
            </span>
          )
        }
      />
      <TitleAndAmount title={quote.title} amount={format.money(quote.total)} />
      <p className="p-muted text-sm">
        {joined([
          quote.quoteNumber ? t('quoteNumber', { number: quote.quoteNumber }) : t('quote'),
          quote.vehicle?.label,
        ])}
      </p>
      <div className="mt-auto pt-0.5">
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
    </PortalPanel>
  )
}

/**
 * What there is to pay. One invoice shows as itself. With several, the sum
 * still owed is the headline with how many invoices it is spread over, then
 * the most urgent one (overdue first, else next due) with its buttons, then
 * the way to all of them.
 */
function InvoiceCard({
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
  const dueLine =
    invoice.dueAt &&
    (invoice.overdue
      ? t('overdueSince', { day: format.day(invoice.dueAt) })
      : t('due', { day: format.day(invoice.dueAt) }))
  const facts = joined([
    invoice.invoiceNumber ? t('invoiceNumber', { number: invoice.invoiceNumber }) : t('invoice'),
    invoice.vehicle?.label,
    format.day(invoice.date),
    invoice.paid > 0 &&
      t('paidSoFar', { paid: format.money(invoice.paid), total: format.money(invoice.total) }),
  ])
  const actions = (
    <div className="flex flex-wrap gap-2.5 pt-0.5">
      {invoice.payUrl && (
        <PortalLinkButton variant="strong" href={invoice.payUrl}>
          {t('payNow')}
        </PortalLinkButton>
      )}
      <PortalLinkButton variant={invoice.payUrl ? 'outline' : 'strong'} href={invoice.viewUrl}>
        {t('seeInvoice')}
      </PortalLinkButton>
    </div>
  )
  const due = dueLine && (
    <span
      className={
        invoice.overdue
          ? 'text-[13px] font-semibold text-[color:var(--p-danger)]'
          : 'p-muted text-[13px]'
      }
    >
      {dueLine}
    </span>
  )

  if (!several) {
    return (
      <PortalPanel aria-labelledby="home-pay" className="flex flex-[1_1_340px] flex-col gap-3.5">
        <CardHead
          id="home-pay"
          label={t('toPay')}
          aside={
            invoice.overdue && dueLine ? <PortalBadge tone="danger">{dueLine}</PortalBadge> : due
          }
        />
        <TitleAndAmount title={invoice.title} amount={format.money(invoice.balance)} />
        <p className="p-muted text-sm">{facts}</p>
        <div className="mt-auto">{actions}</div>
      </PortalPanel>
    )
  }

  return (
    <PortalPanel aria-labelledby="home-pay" className="flex flex-[1_1_340px] flex-col gap-3.5">
      <CardHead
        id="home-pay"
        label={t('toPay')}
        aside={
          data.toPayOverdueCount > 0 && (
            <PortalBadge tone="danger">
              {t('toPayOverdueCount', { count: data.toPayOverdueCount })}
            </PortalBadge>
          )
        }
      />
      <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="p-display whitespace-nowrap text-[32px] sm:text-4xl">
          {format.money(data.toPayTotal)}
        </span>
        <span className="p-muted text-sm">{t('toPayCount', { count: data.toPayCount })}</span>
      </p>
      <div className="flex flex-col gap-2 border-t pt-3.5">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
          <PortalSectionLabel as="p" className="text-xs">
            {invoice.overdue ? t('toPayMostUrgent') : t('toPayNext')}
          </PortalSectionLabel>
          {due}
        </div>
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <p className="min-w-0 text-base font-semibold">{invoice.title}</p>
          <p className="whitespace-nowrap text-base font-semibold">
            {format.money(invoice.balance)}
          </p>
        </div>
        <p className="p-muted text-sm">{facts}</p>
        {actions}
      </div>
      <Link href={listHref} className="p-link p-link--block mt-auto self-start text-sm">
        {t('seeAllInvoices', { count: data.toPayCount })}
      </Link>
    </PortalPanel>
  )
}

/** Tyres the workshop stores: the first set in full, any others as lines. */
function TiresCard({
  tires,
  format,
  t,
}: {
  tires: PortalHomeTireSet[]
  format: PortalHomeFormat
  t: T
}) {
  const [first, ...rest] = tires
  const facts = (set: PortalHomeTireSet) =>
    joined([
      set.size,
      set.studded && t('tiresStudded'),
      set.withRims && t('tiresOnRims'),
      set.storedSince && t('tiresStoredSince', { day: format.day(set.storedSince) }),
    ])
  return (
    <PortalPanel aria-labelledby="home-tires" className="flex flex-col gap-2.5">
      <PortalSectionLabel id="home-tires">{t('tires')}</PortalSectionLabel>
      <p className="p-display text-xl tracking-[-0.01em]">
        {t(tireSeasonKey(first.season, 'tiresStored'))}
      </p>
      <p className="p-muted text-sm leading-normal">
        {joined([first.vehicle?.label, spaced([first.brand, first.model])])}
        <br />
        {facts(first)}
      </p>
      <p className="mt-auto flex flex-wrap items-baseline gap-x-3 pt-2">
        {first.treadDepthMm != null ? (
          <>
            <span className="p-display whitespace-nowrap text-[28px]">
              {format.tread(first.treadDepthMm)}
            </span>
            <span className="p-muted text-[13px]">{t('tiresTreadLeft')}</span>
          </>
        ) : (
          <span className="p-muted text-[13px]">{t('tiresNotMeasured')}</span>
        )}
      </p>
      {rest.length > 0 && (
        <ul className="border-t pt-1">
          {rest.map((set) => (
            <PortalListRow
              key={set.id}
              as="li"
              title={t(tireSeasonKey(set.season, 'tiresSeason'))}
              meta={joined([
                set.vehicle?.label,
                spaced([set.brand, set.model]),
                facts(set),
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
