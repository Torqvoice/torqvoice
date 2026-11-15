import { ArrowRight, ArrowUpRight } from 'lucide-react'
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
import { PortalAcceptQuoteButton } from '../../Home/PortalAcceptQuoteButton'
import { portalHeroLine, portalJobLine, portalJobSteps, tireSeasonKey } from '../../Home/homeCopy'
import { PortalEmptyState, PortalLinkButton, PortalListRow } from '../../Ui'
import type { PortalHomeProps } from '../types'
import { PRINT_GUTTER, PRINT_LABEL, PRINT_RULE, PrintMark, PrintOpenLine } from './parts'

type T = Awaited<ReturnType<typeof getTranslations>>

type Part = string | null | undefined | false
const joined = (parts: Part[]) => parts.filter(Boolean).join(' · ')
const spaced = (parts: Part[]) => parts.filter(Boolean).join(' ')

/** How many quotes and how many invoices the ledger lists before it says "and more". */
const LEDGER_ROWS = 3

const HEADLINE =
  'p-display text-[length:clamp(2rem,6.2cqi,3.5rem)] leading-[1.06] tracking-[-0.02em]'
const SECTION_TITLE = 'p-display text-xl leading-7 @[900px]:text-[22px]'
const SERIF = 'font-[family-name:var(--p-font-display)]'
/** A title inside a shared list row, set in the serif as a line of the page. */
const ROW_TITLE = `${SERIF} text-[19px] font-normal leading-6`
/** One column of the lower part of the page: it hangs from a heavy rule. */
const COLUMN = `flex min-w-0 flex-[1_1_240px] flex-col ${PRINT_RULE}`

/**
 * Print's home: a broadsheet page. White paper, near-black ink, hairline
 * rules instead of boxes.
 *
 * Under the masthead runs a dateline (the day on the workshop's clock, where
 * the workshop is, who is reading). The lead is the car in the workshop as a
 * serif headline with its three steps and the workshop's latest update
 * beside it; with no car in, the next visit leads, or a calm line and a way
 * to book. Then a ledger of what waits for the customer (quotes to answer,
 * invoices to pay), and ruled columns for the cars, the next visit, stored
 * tyres and anything else booked or asked for. On a desk the chat stands in
 * its own ruled column on the right and stays in view; below 1024 px it is
 * behind the Messages tab and its latest line runs under the dateline.
 *
 * The page's own column sizes its rows by how wide it is (container
 * queries), so it is right with the chat beside it and without. Every block
 * can be missing; the ones that remain take the width.
 */
export async function Home({ orgParam, data, format, chat }: PortalHomeProps) {
  const [t, tp] = await Promise.all([
    getTranslations('portal.home'),
    getTranslations('portal.themes.print'),
  ])
  const base = `/portal/${orgParam}`
  const word = (key: string) => t(data.marine ? `${key}Marine` : key)
  const now = new Date().toISOString()
  const job = data.jobs[0]
  const otherJobs = data.jobs.slice(1)
  const tires = data.tires ?? []
  const waiting = data.toAnswer.length + data.toPayCount
  // With no car in, the next visit is the lead and is not told twice; with
  // nothing at all the lead already offers a visit.
  const visitColumn = Boolean(job)
  const { workshop } = data

  return (
    <div className={`flex flex-1 flex-col pb-8 tabular-nums lining-nums lg:pb-10 ${PRINT_GUTTER}`}>
      <div
        className={`${PRINT_LABEL} flex min-h-10 flex-wrap items-center justify-between gap-x-8 gap-y-1 border-b py-2.5`}
      >
        <span>{format.dayLong(now)}</span>
        {(workshop.address || workshop.phone) && (
          <span className="hidden min-w-0 lg:inline">
            {joined([workshop.address, workshop.phone])}
          </span>
        )}
        <span className="hidden min-w-0 lg:inline">{data.customerName}</span>
        <PrintOpenLine open={workshop.openNow} className="lg:hidden">
          {workshop.openLine}
        </PrintOpenLine>
      </div>

      <div className="flex flex-1 flex-col lg:flex-row lg:items-start">
        <div className="@container flex min-w-0 flex-1 flex-col gap-8 pt-6 lg:gap-10 lg:pt-8">
          {data.messages.enabled && (
            <MessagePreview data={data} format={format} href={`${base}/messages`} t={t} />
          )}

          {job ? (
            <JobLead
              job={job}
              line={portalHeroLine(data, format, t)}
              dateline={tp('dateline', { workshop: workshop.name, time: format.time(now) })}
              kicker={tp(data.marine ? 'kickerMarine' : 'kicker')}
              format={format}
              t={t}
              tp={tp}
            />
          ) : (
            <QuietLead
              data={data}
              line={portalHeroLine(data, format, t)}
              bookHref={`${base}/request-service`}
              format={format}
              t={t}
              word={word}
            />
          )}

          {waiting > 0 && (
            <section aria-labelledby="home-ledger">
              <div
                className={`${PRINT_RULE} flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1`}
              >
                <h2 id="home-ledger" className={SECTION_TITLE}>
                  {tp('waiting')}
                </h2>
                <p className="p-muted text-[13px]">
                  {joined([
                    tp('waitingCount', { count: waiting }),
                    data.toPayCount > 0 &&
                      tp('waitingOwed', {
                        total: format.money(data.toPayTotal),
                        invoices: t('toPayCount', { count: data.toPayCount }),
                      }),
                    data.toPayOverdueCount > 0 &&
                      t('toPayOverdueCount', { count: data.toPayOverdueCount }),
                  ])}
                </p>
              </div>
              <div className="mt-2.5 border-t @[900px]:grid @[900px]:grid-cols-[fit-content(165px)_minmax(120px,1fr)_fit-content(120px)_auto_fit-content(265px)] @[900px]:gap-x-4 @[900px]:border-t-0">
                <div
                  aria-hidden
                  className={`${PRINT_LABEL} hidden border-b pb-2.5 @[900px]:col-span-full @[900px]:grid @[900px]:grid-cols-subgrid @[900px]:gap-x-4`}
                >
                  <span>{tp('colWhat')}</span>
                  <span>{tp('colDocument')}</span>
                  <span>{tp('colDeadline')}</span>
                  <span className="text-right">{tp('colAmount')}</span>
                  <span />
                </div>
                <ul className="@[900px]:col-span-full @[900px]:grid @[900px]:grid-cols-subgrid @[900px]:gap-x-4">
                  {data.toAnswer.slice(0, LEDGER_ROWS).map((quote) => (
                    <QuoteRow key={quote.id} quote={quote} format={format} t={t} />
                  ))}
                  {data.toPay.slice(0, LEDGER_ROWS).map((invoice) => (
                    <InvoiceRow key={invoice.id} invoice={invoice} format={format} t={t} />
                  ))}
                </ul>
              </div>
              {(data.toAnswer.length > LEDGER_ROWS || data.toPay.length > LEDGER_ROWS) && (
                <p className="flex flex-wrap gap-x-8 pt-1 text-sm">
                  {data.toAnswer.length > LEDGER_ROWS && (
                    <Link href={`${base}/quotes`} className="p-link p-link--block">
                      {t('moreQuotes', { count: data.toAnswer.length - LEDGER_ROWS })}
                    </Link>
                  )}
                  {data.toPay.length > LEDGER_ROWS && (
                    <Link href={`${base}/invoices`} className="p-link p-link--block">
                      {t('moreInvoices', {
                        count: data.toPay.length - LEDGER_ROWS,
                        total: format.money(data.toPayTotal),
                      })}
                    </Link>
                  )}
                </p>
              )}
            </section>
          )}

          <div className="flex flex-wrap gap-8">
            <section aria-labelledby="home-cars" className={COLUMN}>
              <h2 id="home-cars" className={SECTION_TITLE}>
                {word('cars')}
              </h2>
              {data.cars.length === 0 ? (
                <PortalEmptyState title={word('carsEmptyTitle')} className="mt-3 border-t pt-3.5">
                  {word('carsEmptyBody')}
                </PortalEmptyState>
              ) : (
                <ul className="mt-3 border-y">
                  {data.cars.map((car) => {
                    const warranty =
                      car.warranty === 'active'
                        ? t('carWarrantyActive')
                        : car.warranty === 'expiring'
                          ? t('carWarrantyExpiring')
                          : null
                    return (
                      <PortalListRow
                        key={car.id}
                        as="li"
                        href={car.url}
                        title={<span className={ROW_TITLE}>{car.label}</span>}
                        meta={joined([
                          car.licensePlate,
                          t('carVisits', { count: car.visits }),
                          car.inWorkshop && warranty,
                        ])}
                        trailing={
                          car.inWorkshop ? (
                            <span
                              className={`${PRINT_LABEL} p-ink flex items-center gap-2 text-right`}
                            >
                              <PrintMark />
                              {t('carInWorkshop')}
                            </span>
                          ) : warranty ? (
                            <span className={`${PRINT_LABEL} text-right`}>{warranty}</span>
                          ) : null
                        }
                      />
                    )
                  })}
                </ul>
              )}
            </section>

            {visitColumn && (
              <section aria-labelledby="home-visit" className={COLUMN}>
                <h2 id="home-visit" className={SECTION_TITLE}>
                  {t('nextVisit')}
                </h2>
                <div className="mt-3 flex flex-1 flex-col border-t pt-3.5">
                  {data.nextVisit ? (
                    <>
                      <p className="p-display text-2xl leading-[1.2] @[900px]:text-[28px]">
                        {t('visitWhen', {
                          day: format.dayLong(data.nextVisit.startAt),
                          time: format.time(data.nextVisit.startAt),
                        })}
                      </p>
                      <p className="mt-1.5 text-sm">
                        {joined([data.nextVisit.vehicle?.label, data.nextVisit.title])}
                      </p>
                      <Where workshop={workshop} label={t('directions')} />
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
                </div>
              </section>
            )}

            {tires.length > 0 && (
              <TiresColumn tires={tires} marine={data.marine} format={format} t={t} tp={tp} />
            )}

            {otherJobs.length > 0 && (
              <section aria-labelledby="home-jobs" className={COLUMN}>
                <h2 id="home-jobs" className={SECTION_TITLE}>
                  {t('otherJobs')}
                </h2>
                <ul className="mt-3 border-y">
                  {otherJobs.map((other) => (
                    <PortalListRow
                      key={other.id}
                      as="li"
                      href={other.vehicle ? `${base}/vehicles/${other.vehicle.id}` : undefined}
                      title={<span className={ROW_TITLE}>{other.title}</span>}
                      meta={joined([other.vehicle?.label, portalJobLine(other, format, t)])}
                    />
                  ))}
                </ul>
              </section>
            )}

            {data.requests.length > 0 && (
              <section aria-labelledby="home-requests" className={COLUMN}>
                <h2 id="home-requests" className={SECTION_TITLE}>
                  {t('requests')}
                </h2>
                <ul className="mt-3 border-y">
                  {data.requests.map((request) => (
                    <PortalListRow
                      key={request.id}
                      as="li"
                      title={
                        <span className={`${ROW_TITLE} line-clamp-3`}>{request.description}</span>
                      }
                      meta={joined([
                        t('requestSent', { day: format.day(request.createdAt) }),
                        request.vehicle?.label,
                        t('requestWaiting'),
                      ])}
                    />
                  ))}
                </ul>
              </section>
            )}
          </div>
        </div>

        {chat && (
          <aside
            aria-label={t('messagesLabel', { workshop: workshop.name })}
            className="hidden shrink-0 border-l lg:sticky lg:top-[88px] lg:ml-8 lg:mt-8 lg:flex lg:h-[calc(100svh-120px)] lg:max-h-[920px] lg:min-h-[480px] lg:w-[380px] lg:flex-col xl:ml-10 xl:w-[400px] 2xl:w-[424px]"
          >
            {chat}
          </aside>
        )}
      </div>
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
      className="-mb-2 -mt-6 flex min-h-12 items-center gap-2.5 border-b py-2 -outline-offset-2 lg:hidden"
    >
      <PrintMark tone={data.messages.unread > 0 ? 'accent' : 'closed'} />
      <span className="sr-only">{t('messagePreviewOpen', { workshop })}: </span>
      {last ? (
        <>
          <span className="min-w-0 flex-1 truncate text-sm">
            <span className={`${PRINT_LABEL} p-ink`}>
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
      <ArrowRight className="p-muted h-4 w-4 shrink-0" aria-hidden />
    </Link>
  )
}

/** The lead story: the car in the workshop, its three steps, the latest update. */
function JobLead({
  job,
  line,
  dateline,
  kicker,
  format,
  t,
  tp,
}: {
  job: PortalHomeJob
  line: string
  dateline: string
  kicker: string
  format: PortalHomeFormat
  t: T
  tp: T
}) {
  const steps = portalJobSteps(job, t)
  const stateWord = { done: tp('stepDone'), now: tp('stepNow'), todo: tp('stepTodo') }
  const update = job.update
  const about = joined([job.vehicle?.label, job.vehicle?.licensePlate, job.title])
  return (
    <section
      aria-labelledby="home-hero"
      className={
        update
          ? 'flex flex-col gap-6 @[760px]:grid @[760px]:grid-cols-[minmax(0,1fr)_minmax(0,300px)] @[760px]:gap-x-10'
          : undefined
      }
    >
      <div className="flex min-w-0 flex-col">
        <p className={`${PRINT_LABEL} flex flex-wrap items-center gap-x-3 gap-y-1`}>
          <span className="p-ink flex items-center gap-2">
            <PrintMark />
            {kicker}
          </span>
          <span aria-hidden className="h-px w-6 bg-[var(--p-ink)]" />
          <span className="min-w-0">{about}</span>
        </p>
        <h1 id="home-hero" className={`${HEADLINE} mt-3`}>
          {line}
        </h1>
        <p className={`${SERIF} p-muted mt-3 text-[17px] italic leading-6`}>{dateline}</p>
        <ol className="mt-6 grid grid-cols-3 gap-x-2 @[760px]:gap-x-6" aria-label={t('stepsLabel')}>
          {steps.map((step) => (
            <li
              key={step.label}
              aria-current={step.state === 'now' ? 'step' : undefined}
              className={`flex min-w-0 flex-col gap-1 border-t-[3px] pt-2.5 ${
                step.state === 'now'
                  ? 'border-[color:var(--p-accent)]'
                  : step.state === 'done'
                    ? 'border-[color:var(--p-ink)]'
                    : 'border-[color:var(--p-line)] text-[color:var(--p-muted)]'
              }`}
            >
              <span className={PRINT_LABEL}>{stateWord[step.state]}</span>
              <span
                className={`${SERIF} text-[15px] leading-5 @[520px]:text-[19px] @[520px]:leading-6 @[900px]:text-[21px] ${
                  step.state === 'now' ? 'font-semibold' : ''
                }`}
              >
                {step.label}
              </span>
            </li>
          ))}
        </ol>
      </div>

      {update && (
        <div className="flex min-w-0 flex-col items-start border-t pt-4 @[760px]:border-l @[760px]:border-t-0 @[760px]:pl-8 @[760px]:pt-0">
          <p className={PRINT_LABEL}>
            {t('latestUpdate', {
              when: format.isPast(update.at)
                ? `${format.day(update.at)}, ${format.time(update.at)}`
                : format.time(update.at),
            })}
          </p>
          <p className={`${SERIF} mt-2.5 line-clamp-6 whitespace-pre-line text-[17px] leading-6`}>
            {update.message ?? t('updateFallback')}
          </p>
          <a href={update.url} className="p-link p-link--block mt-1 gap-2 text-sm">
            {t('seeUpdate')}
            <ArrowRight className="h-4 w-4 shrink-0" aria-hidden />
          </a>
        </div>
      )}
    </section>
  )
}

/**
 * The lead when no car is in: the next visit as the headline, or, with none
 * booked, that nothing is in the workshop and a way to book.
 */
function QuietLead({
  data,
  line,
  bookHref,
  format,
  t,
  word,
}: {
  data: PortalHomeData
  line: string
  bookHref: string
  format: PortalHomeFormat
  t: T
  word: (key: string) => string
}) {
  const visit = data.nextVisit
  if (!visit) {
    return (
      <section aria-labelledby="home-hero" className="flex flex-col items-start">
        <h1 id="home-hero" className={HEADLINE}>
          {line}
        </h1>
        <p className={`${SERIF} p-muted mt-3 max-w-[52ch] text-lg italic leading-[1.45]`}>
          {word('heroNothingBody')}
        </p>
        <PortalLinkButton variant="accent" href={bookHref} className="mt-5">
          {t('bookVisit')}
          <ArrowRight className="h-4 w-4 shrink-0" aria-hidden />
        </PortalLinkButton>
      </section>
    )
  }
  return (
    <section aria-labelledby="home-hero" className="flex flex-col">
      <p className={`${PRINT_LABEL} p-ink flex items-center gap-2`}>
        <PrintMark />
        {t('nextVisit')}
      </p>
      <h1 id="home-hero" className={`${HEADLINE} mt-3`}>
        {t('visitWhen', { day: format.dayLong(visit.startAt), time: format.time(visit.startAt) })}
      </h1>
      {(visit.vehicle || visit.title) && (
        <p className="mt-3 text-[17px] leading-6">{joined([visit.vehicle?.label, visit.title])}</p>
      )}
      <Where workshop={data.workshop} label={t('directions')} />
      <p className={`${SERIF} p-muted mt-2 border-t pt-3.5 text-[17px] italic leading-6`}>{line}</p>
    </section>
  )
}

/** Where a visit takes place, with the way there. Nothing for a workshop without an address. */
function Where({ workshop, label }: { workshop: PortalHomeData['workshop']; label: string }) {
  if (!workshop.address) return null
  return (
    <p className="p-muted mt-1 flex flex-wrap items-center justify-between gap-x-4 text-[13px]">
      <span className="min-w-0">{workshop.address}</span>
      {workshop.directionsUrl && (
        <a
          href={workshop.directionsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="p-link p-link--block gap-1.5 whitespace-nowrap text-sm"
        >
          {label}
          <ArrowUpRight className="h-4 w-4 shrink-0" aria-hidden />
        </a>
      )}
    </p>
  )
}

/**
 * One line of the ledger. On a wide page its five cells sit in the ledger's
 * columns (what, document, deadline, amount, what to do); on a narrow one
 * they stack: what and the deadline, the title and the amount, the buttons.
 */
function LedgerRow({
  kind,
  title,
  meta,
  deadline,
  amount,
  children,
}: {
  kind: string
  title: string
  meta: string
  deadline: React.ReactNode
  amount: string
  children: React.ReactNode
}) {
  const cell = '@[900px]:col-start-auto @[900px]:row-start-auto'
  return (
    <li className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-4 gap-y-1 border-b py-3.5 @[900px]:col-span-full @[900px]:grid-cols-subgrid @[900px]:items-center @[900px]:gap-x-4 @[900px]:gap-y-0 @[900px]:py-3">
      <p className={`${PRINT_LABEL} p-ink col-start-1 row-start-1 flex items-center gap-2 ${cell}`}>
        <PrintMark />
        {kind}
      </p>
      <div className={`col-start-1 row-start-2 min-w-0 ${cell}`}>
        <p className={`${SERIF} text-[19px] leading-6`}>{title}</p>
        <p className="p-muted text-[13px] leading-[18px]">{meta}</p>
      </div>
      <div
        className={`p-muted col-start-2 row-start-1 justify-self-end text-right text-[13px] @[900px]:justify-self-start @[900px]:text-left ${cell}`}
      >
        {deadline}
      </div>
      <p
        className={`p-display col-start-2 row-start-2 whitespace-nowrap text-right text-[22px] leading-7 ${cell}`}
      >
        {amount}
      </p>
      <div
        className={`col-span-2 row-start-3 pt-2 @[900px]:col-span-1 @[900px]:justify-self-end @[900px]:pt-0 ${cell}`}
      >
        {children}
      </div>
    </li>
  )
}

function QuoteRow({
  quote,
  format,
  t,
}: {
  quote: PortalHomeQuote
  format: PortalHomeFormat
  t: T
}) {
  return (
    <LedgerRow
      kind={t('needsAnswer')}
      title={quote.title}
      meta={joined([
        quote.quoteNumber ? t('quoteNumber', { number: quote.quoteNumber }) : t('quote'),
        quote.vehicle?.label,
      ])}
      deadline={quote.validUntil && t('validUntil', { day: format.day(quote.validUntil) })}
      amount={format.money(quote.total)}
    >
      <PortalAcceptQuoteButton quoteId={quote.id}>
        <Link href={quote.url} className="p-link p-link--block px-1 text-sm">
          {t('readQuote')}
        </Link>
      </PortalAcceptQuoteButton>
    </LedgerRow>
  )
}

function InvoiceRow({
  invoice,
  format,
  t,
}: {
  invoice: PortalHomeInvoice
  format: PortalHomeFormat
  t: T
}) {
  return (
    <LedgerRow
      kind={t('toPay')}
      title={invoice.title}
      meta={joined([
        invoice.invoiceNumber
          ? t('invoiceNumber', { number: invoice.invoiceNumber })
          : t('invoice'),
        invoice.vehicle?.label,
        format.day(invoice.date),
        invoice.paid > 0 &&
          t('paidSoFar', {
            paid: format.money(invoice.paid),
            total: format.money(invoice.total),
          }),
      ])}
      deadline={
        invoice.dueAt &&
        (invoice.overdue ? (
          <strong className="font-semibold text-[color:var(--p-danger)]">
            {t('overdueSince', { day: format.day(invoice.dueAt) })}
          </strong>
        ) : (
          t('due', { day: format.day(invoice.dueAt) })
        ))
      }
      amount={format.money(invoice.balance)}
    >
      <div className="flex flex-wrap items-center gap-2.5">
        {invoice.payUrl ? (
          <>
            <PortalLinkButton variant="accent" href={invoice.payUrl}>
              {t('payNow')}
            </PortalLinkButton>
            <Link href={invoice.viewUrl} className="p-link p-link--block px-1 text-sm">
              {t('seeInvoice')}
            </Link>
          </>
        ) : (
          <PortalLinkButton variant="outline" href={invoice.viewUrl}>
            {t('seeInvoice')}
          </PortalLinkButton>
        )}
      </div>
    </LedgerRow>
  )
}

/** Tyres the workshop stores: the first set as a small table of facts, any others as lines. */
function TiresColumn({
  tires,
  marine,
  format,
  t,
  tp,
}: {
  tires: PortalHomeTireSet[]
  marine: boolean
  format: PortalHomeFormat
  t: T
  tp: T
}) {
  const [first, ...rest] = tires
  const set = (tire: PortalHomeTireSet) =>
    joined([
      t('tiresCount', { count: tire.quantity }),
      tire.studded && t('tiresStudded'),
      tire.withRims && t('tiresOnRims'),
    ])
  const facts: [string, string | null][] = [
    [tp(marine ? 'tireCarMarine' : 'tireCar'), first.vehicle?.label ?? null],
    [tp('tireTyre'), spaced([first.brand, first.model]) || null],
    [tp('tireSize'), first.size],
    [tp('tireSet'), set(first)],
    [
      tp('tireTread'),
      first.treadDepthMm != null
        ? t('tiresTreadLine', { depth: format.tread(first.treadDepthMm) })
        : t('tiresNotMeasured'),
    ],
  ]
  return (
    <section aria-labelledby="home-tires" className={COLUMN}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5">
        <h2 id="home-tires" className={SECTION_TITLE}>
          {t('tires')}
        </h2>
        {first.storedSince && (
          <p className="p-muted inline-block text-[13px] first-letter:uppercase">
            {t('tiresStoredSince', { day: format.day(first.storedSince) })}
          </p>
        )}
      </div>
      <p className={`${SERIF} mt-3 border-t pt-3 text-[19px] leading-6`}>
        {t(tireSeasonKey(first.season, 'tiresStored'))}
      </p>
      <dl className="mt-2.5 grid grid-cols-2 gap-x-4 gap-y-2.5">
        {facts.map(
          ([label, value]) =>
            value && (
              <div key={label} className="min-w-0">
                <dt className={PRINT_LABEL}>{label}</dt>
                <dd className="mt-0.5 text-sm leading-5">{value}</dd>
              </div>
            )
        )}
      </dl>
      {rest.length > 0 && (
        <ul className="mt-3.5 border-y">
          {rest.map((tire) => (
            <PortalListRow
              key={tire.id}
              as="li"
              title={
                <span className={ROW_TITLE}>{t(tireSeasonKey(tire.season, 'tiresSeason'))}</span>
              }
              meta={joined([
                tire.vehicle?.label,
                spaced([tire.brand, tire.model]),
                tire.size,
                set(tire),
                tire.storedSince && t('tiresStoredSince', { day: format.day(tire.storedSince) }),
                tire.treadDepthMm != null &&
                  t('tiresTreadLine', { depth: format.tread(tire.treadDepthMm) }),
              ])}
            />
          ))}
        </ul>
      )}
    </section>
  )
}
