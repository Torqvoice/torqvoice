import { ArrowUpRight, Mail, Phone } from 'lucide-react'
import { getLocale, getTranslations } from 'next-intl/server'
import { formatClock } from '@/features/workboard/utils/clock'
import { PortalWorkshopMark } from '../../PortalWorkshopMark'
import { portalWeekLines } from '../../SignIn/weekLines'
import type { PortalSignInProps } from '../types'
import { ACTION, ACTION_RULE, LABEL, SquareDot, TAG } from './parts'

const minutesOf = (hhmm: string) => {
  const [hours, minutes] = hhmm.split(':').map(Number)
  return hours * 60 + minutes
}

/** One cell of the strip along the foot: ruled off from its neighbours, never floating. */
const FOOT_CELL = 'flex min-w-0 flex-col bg-[var(--p-bg)] px-5 py-6 sm:px-8 sm:py-7'

/** Diagonal stripes in the workshop's colour and the ink on it: the board's hazard tape. */
const HAZARD_TAPE =
  'repeating-linear-gradient(135deg, var(--p-accent) 0 14px, var(--p-on-accent) 14px 28px)'

/**
 * Garage's sign-in page: the workshop's front door as a board.
 *
 * From 1100 px the workshop takes the left side: a top rail with its mark,
 * name and whether it is open, its cover photo in a hard frame with its own
 * words boxed into the corner, and a ruled strip along the foot (how long it
 * is open today as a large numeral, the week, where it is and how to call).
 * The sign-in is a lighter panel down the right edge. Below 1100 px the same
 * parts stack in the order a visitor needs them: who this is, the sign-in,
 * then how to find and reach the workshop.
 *
 * A workshop without a cover photo gets the frame all the same: a strip of
 * hazard tape and its initial, large and quiet, behind its words.
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
  const [t, g, locale] = await Promise.all([
    getTranslations('portal.signIn'),
    getTranslations('portal.themes.garage'),
    getLocale(),
  ])
  const week = workshop.hours ? portalWeekLines(workshop.hours, locale, t) : []
  const hasHours = week.length > 0 || Boolean(hoursText)
  const hasContact = Boolean(workshop.address || workshop.phone || workshop.email)

  // Today's turning point as a numeral: when it closes, or when it opens.
  const turn = workshop.openNow ? workshop.closesAt : workshop.opensAt
  const today =
    workshop.hours && turn
      ? {
          label: g(workshop.openNow ? 'openUntil' : 'opensAt'),
          time: formatClock(minutesOf(turn), workshop.hours.timeFormat),
        }
      : null

  // A sentence or two is set as a headline; anything longer as running text.
  const shortWords = description !== null && description.length <= 90 && !description.includes('\n')

  return (
    <div className="grid flex-1 min-[1100px]:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] min-[1100px]:grid-rows-[1fr_auto]">
      <header className="flex min-w-0 flex-col min-[1100px]:col-start-1 min-[1100px]:row-start-1">
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 px-5 py-4 sm:px-8 min-[1100px]:min-h-24 min-[1100px]:px-12">
          <div className="flex min-w-0 items-center gap-3.5">
            <PortalWorkshopMark name={workshop.name} logoUrl={workshop.logoUrl} size={44} />
            <h1 className="p-display min-w-0 text-[26px] leading-[1.05] tracking-[0.04em] sm:text-[32px]">
              {workshop.name}
            </h1>
          </div>
          <p className={`${LABEL} flex items-center gap-2.5 sm:text-[17px]`}>
            <SquareDot tone={workshop.openNow ? 'open' : 'muted'} large />
            {workshop.openLine}
          </p>
        </div>

        <div
          className={`@container relative mx-5 mb-5 flex flex-col overflow-hidden border border-[color:var(--p-line-strong)] bg-[var(--p-photo)] sm:mx-8 sm:mb-8 sm:min-h-[320px] sm:justify-end min-[1100px]:mx-12 min-[1100px]:flex-1 ${
            coverUrl ? '' : 'min-h-[150px] justify-end'
          }`}
        >
          {coverUrl ? (
            // The workshop's own photo: its size is unknown, so no next/image.
            <img
              src={coverUrl}
              alt=""
              className="h-44 w-full object-cover sm:absolute sm:inset-0 sm:h-full"
            />
          ) : (
            <>
              <div
                aria-hidden
                className="absolute inset-x-0 top-0 h-3"
                style={{ backgroundImage: HAZARD_TAPE }}
              />
              <span
                aria-hidden
                className="p-display pointer-events-none absolute -bottom-[0.1em] right-[0.08em] select-none text-[length:clamp(170px,46cqw,520px)] leading-[0.8] text-[color:var(--p-soft)]"
              >
                {workshop.name.trim().charAt(0).toUpperCase()}
              </span>
            </>
          )}
          {description && (
            <p
              className={`relative whitespace-pre-line ${
                coverUrl
                  ? 'border-t border-[color:var(--p-line-strong)] bg-[var(--p-bg)] px-5 py-4 sm:max-w-[min(440px,80%)] sm:border-r sm:px-7 sm:py-6'
                  : 'max-w-[640px] px-5 pb-5 pt-8 sm:px-7 sm:pb-7'
              } ${
                shortWords
                  ? 'p-display text-[length:clamp(26px,5cqw,40px)] leading-[1.05] tracking-[0.02em]'
                  : 'text-base leading-normal'
              }`}
            >
              {description}
            </p>
          )}
        </div>
      </header>

      <main className="flex items-center border-t bg-[var(--p-surface)] px-5 py-10 sm:px-8 sm:py-14 min-[1100px]:col-start-2 min-[1100px]:row-span-2 min-[1100px]:row-start-1 min-[1100px]:border-l min-[1100px]:border-t-0 min-[1100px]:px-[clamp(40px,5vw,72px)]">
        {/* On this panel a field is cut into the ground behind it, as on the board. */}
        <div className="mx-auto flex w-full max-w-[520px] flex-col [--p-surface:var(--p-bg)]">
          <p className={`${TAG} self-start bg-[var(--p-accent)] text-[color:var(--p-on-accent)]`}>
            {eyebrow}
          </p>
          <h2 className="p-display mt-6 text-[length:clamp(36px,4.2vw,56px)] leading-none">
            {heading}
          </h2>
          <div className="mt-8">{children}</div>
        </div>
      </main>

      {(hasHours || hasContact) && (
        <footer className="flex flex-wrap gap-px border-t bg-[var(--p-line)] min-[1100px]:col-start-1 min-[1100px]:row-start-2">
          {hasHours && (
            <div className={`${FOOT_CELL} flex-[1_1_260px] gap-3`}>
              {today ? (
                <p className="flex flex-col gap-3">
                  <span className={`${LABEL} p-muted`}>{today.label}</span>
                  <span
                    className={`p-display whitespace-nowrap leading-[0.85] ${
                      today.time.length > 5 ? 'text-[56px]' : 'text-[length:clamp(64px,7vw,88px)]'
                    }`}
                  >
                    {today.time}
                  </span>
                </p>
              ) : (
                <p className="p-display text-[32px] leading-[1.05]">{workshop.openLine}</p>
              )}
            </div>
          )}

          {hasHours && (
            <div className={`${FOOT_CELL} flex-[1_1_250px]`}>
              <h2 className={`${LABEL} p-muted mb-3`}>{t('hoursTitle')}</h2>
              {week.length > 0 ? (
                <dl className="border-b">
                  {week.map((line) => (
                    <div
                      key={line.days}
                      aria-current={line.today ? 'date' : undefined}
                      className={`flex min-h-8 items-baseline justify-between gap-4 border-t py-1 ${
                        line.today ? 'font-semibold' : 'p-muted'
                      }`}
                    >
                      <dt>{line.days}</dt>
                      <dd className="text-right">{line.hours}</dd>
                    </div>
                  ))}
                </dl>
              ) : (
                <p className="whitespace-pre-line leading-[1.6]">{hoursText}</p>
              )}
            </div>
          )}

          {hasContact && (
            <div className={`${FOOT_CELL} flex-[2_1_280px]`}>
              <h2 className={`${LABEL} p-muted mb-3`}>
                {t(workshop.address ? 'findUs' : 'callUs')}
              </h2>
              {workshop.address && (
                <p className="whitespace-pre-line text-lg font-semibold leading-snug">
                  {workshop.address}
                </p>
              )}
              <div className="mt-auto flex flex-wrap items-center gap-x-7 pt-2">
                {workshop.directionsUrl && (
                  <a
                    href={workshop.directionsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={ACTION}
                  >
                    <span className={ACTION_RULE}>{t('directions')}</span>
                    <ArrowUpRight className="h-4 w-4 shrink-0" strokeWidth={2.4} aria-hidden />
                  </a>
                )}
                {workshop.phone && workshop.phoneHref && (
                  <a href={workshop.phoneHref} className={ACTION}>
                    <Phone className="h-4 w-4 shrink-0" aria-hidden />
                    {workshop.phone}
                  </a>
                )}
                {workshop.email && (
                  <a
                    href={`mailto:${workshop.email}`}
                    className="inline-flex min-h-11 min-w-0 items-center gap-2 rounded-[2px] text-[15px] font-medium text-[color:var(--p-ink)] underline underline-offset-4"
                  >
                    <Mail className="h-4 w-4 shrink-0" aria-hidden />
                    <span className="break-all">{workshop.email}</span>
                  </a>
                )}
              </div>
            </div>
          )}
        </footer>
      )}
    </div>
  )
}
