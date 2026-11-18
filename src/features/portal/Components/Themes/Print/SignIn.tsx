import { ArrowUpRight, Phone } from 'lucide-react'
import { getLocale, getTranslations } from 'next-intl/server'
import { PortalWorkshopMark } from '../../PortalWorkshopMark'
import { portalWeekLines } from '../../SignIn/weekLines'
import type { PortalSignInProps } from '../types'
import { PRINT_GUTTER, PRINT_LABEL, PRINT_RULE, PrintOpenLine } from './parts'

const SECTION_TITLE = 'p-display text-xl leading-7 lg:text-[22px]'
const SERIF = 'font-[family-name:var(--p-font-display)]'

/**
 * "Tuesday 17 November" for a day the workshop's calendar gave as
 * YYYY-MM-DD. The day is already on the workshop's clock, so it is printed
 * as it stands (noon UTC, formatted in UTC) and never moved by the server's.
 */
function dayOf(today: string, locale: string): string | null {
  const date = new Date(`${today}T12:00:00Z`)
  if (Number.isNaN(date.getTime())) return null
  const text = new Intl.DateTimeFormat(locale, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  }).format(date)
  return text.charAt(0).toLocaleUpperCase(locale) + text.slice(1)
}

/**
 * Print's sign-in page: the front page of the workshop's own paper.
 *
 * A dateline (the day, what this is, whether the workshop is open), then the
 * masthead with the workshop's name in the serif and its own words beside
 * it. Under the masthead's heavy rule, on a desk: the cover photo over three
 * ruled columns (opening hours, find us, call us) on the left, and the
 * sign-in in its own ruled column on the right. On a phone the parts stack
 * in the order a visitor needs them: who this is, the sign-in, then how to
 * find and reach the workshop.
 *
 * A workshop without a cover photo gets a plate in its place on a desk: its
 * initial, large and quiet, so the page keeps its shape.
 */
export async function SignIn({
  workshop,
  description,
  hoursText,
  coverUrl,
  eyebrow,
  heading,
  children,
}: PortalSignInProps) {
  const [t, tp, locale] = await Promise.all([
    getTranslations('portal.signIn'),
    getTranslations('portal.themes.print'),
    getLocale(),
  ])
  const week = workshop.hours ? portalWeekLines(workshop.hours, locale, t) : []
  const today = workshop.hours ? dayOf(workshop.hours.today, locale) : null
  const hasHours = week.length > 0 || Boolean(hoursText)
  const hasContact = Boolean(workshop.phone || workshop.email)
  const hasDetails = hasHours || Boolean(workshop.address) || hasContact
  const initial = workshop.name.trim().charAt(0).toUpperCase()

  return (
    <div className={`flex flex-1 flex-col tabular-nums lining-nums ${PRINT_GUTTER}`}>
      <div
        className={`${PRINT_LABEL} flex min-h-10 flex-wrap items-center justify-between gap-x-8 gap-y-1 border-b py-2.5`}
      >
        {today && <span>{today}</span>}
        <span className={today ? 'hidden sm:inline' : undefined}>{tp('portalLabel')}</span>
        <PrintOpenLine open={workshop.openNow}>{workshop.openLine}</PrintOpenLine>
      </div>

      <header className="flex flex-wrap items-center justify-between gap-x-10 gap-y-3 border-b-2 border-[color:var(--p-ink)] py-5 lg:py-6">
        <div className="flex min-w-0 items-center gap-3.5 lg:gap-[18px]">
          <PortalWorkshopMark
            name={workshop.name}
            logoUrl={workshop.logoUrl}
            size={52}
            className="italic"
          />
          <h1 className="p-display min-w-0 text-[length:clamp(2rem,5.2vw,3rem)] leading-[1.08] tracking-[-0.02em]">
            {workshop.name}
          </h1>
        </div>
        {description && (
          <p
            className={`${SERIF} p-muted max-w-[46ch] whitespace-pre-line text-[17px] italic leading-[1.4] lg:text-xl`}
          >
            {description}
          </p>
        )}
      </header>

      <div className="grid flex-1 gap-y-8 py-6 lg:grid-cols-[minmax(0,1fr)_minmax(400px,520px)] lg:grid-rows-[minmax(260px,1fr)_auto] lg:gap-y-7 lg:py-10">
        {coverUrl ? (
          <div className="relative h-44 sm:h-64 lg:col-start-1 lg:row-start-1 lg:h-auto">
            <img
              src={coverUrl}
              alt=""
              className="absolute inset-0 h-full w-full object-cover"
              style={{ background: 'var(--p-photo)' }}
            />
          </div>
        ) : (
          <div
            aria-hidden
            className={`${SERIF} hidden items-center justify-center overflow-hidden bg-[var(--p-soft)] text-[length:clamp(10rem,22vw,20rem)] italic leading-none text-[color:var(--p-line)] lg:col-start-1 lg:row-start-1 lg:flex`}
          >
            {initial}
          </div>
        )}

        <main className="flex min-w-0 flex-col lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:ml-10 lg:border-l lg:pl-10">
          <div className="flex w-full max-w-[520px] flex-col gap-4">
            <p className={`${PRINT_LABEL} p-ink`}>{eyebrow}</p>
            <h2 className="p-display text-[length:clamp(1.875rem,4vw,3rem)] leading-[1.08] tracking-[-0.02em]">
              {heading}
            </h2>
            <div className="mt-3 flex flex-col gap-5">{children}</div>
          </div>
        </main>

        {hasDetails && (
          <div className="grid gap-x-8 gap-y-7 sm:grid-cols-[repeat(auto-fit,minmax(210px,1fr))] lg:col-start-1 lg:row-start-2">
            {hasHours && (
              <section aria-labelledby="signin-hours" className={PRINT_RULE}>
                <h2 id="signin-hours" className={SECTION_TITLE}>
                  {t('hoursTitle')}
                </h2>
                {week.length > 0 ? (
                  <dl className="mt-3 border-b text-[15px] leading-5">
                    {week.map((line) => (
                      <div
                        key={line.days}
                        aria-current={line.today ? 'date' : undefined}
                        className={`flex min-h-9 flex-wrap items-center justify-between gap-x-4 border-t py-1.5 ${
                          line.today ? 'font-semibold' : ''
                        }`}
                      >
                        <dt>{line.days}</dt>
                        <dd className="first-letter:uppercase">{line.hours}</dd>
                      </div>
                    ))}
                  </dl>
                ) : (
                  <p className="mt-3 whitespace-pre-line border-t pt-3 text-[15px] leading-[1.6]">
                    {hoursText}
                  </p>
                )}
              </section>
            )}

            {workshop.address && (
              <section aria-labelledby="signin-find" className={`${PRINT_RULE} flex flex-col`}>
                <h2 id="signin-find" className={SECTION_TITLE}>
                  {t('findUs')}
                </h2>
                <p
                  className={`${SERIF} mt-3 whitespace-pre-line border-t pt-3 text-[22px] leading-[1.25]`}
                >
                  {workshop.address}
                </p>
                {workshop.directionsUrl && (
                  <a
                    href={workshop.directionsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-link p-link--block mt-auto gap-1.5 self-start text-sm"
                  >
                    {t('directions')}
                    <ArrowUpRight className="h-4 w-4 shrink-0" aria-hidden />
                  </a>
                )}
              </section>
            )}

            {hasContact && (
              <section aria-labelledby="signin-call" className={`${PRINT_RULE} flex flex-col`}>
                <h2 id="signin-call" className={SECTION_TITLE}>
                  {t('callUs')}
                </h2>
                <div className="mt-3 flex flex-1 flex-col border-t pt-3">
                  {workshop.phone && (
                    <>
                      <p className={`${SERIF} whitespace-nowrap text-[22px] leading-[1.25]`}>
                        {workshop.phone}
                      </p>
                      <p className="p-muted text-[15px] leading-[22px]">{workshop.openLine}</p>
                    </>
                  )}
                  {workshop.email && (
                    <a
                      href={`mailto:${workshop.email}`}
                      className="p-link p-link--block self-start break-all text-[15px]"
                    >
                      {workshop.email}
                    </a>
                  )}
                  {workshop.phone && workshop.phoneHref && (
                    <a
                      href={workshop.phoneHref}
                      className="p-link p-link--block mt-auto gap-2 self-start text-sm"
                    >
                      <Phone className="h-4 w-4 shrink-0" aria-hidden />
                      {tp('callWorkshop')}
                    </a>
                  )}
                </div>
              </section>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
