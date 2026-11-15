import { ArrowRight, Clock, MapPin, Phone } from 'lucide-react'
import { getLocale, getTranslations } from 'next-intl/server'
import { portalWeekLines } from '../../SignIn/weekLines'
import { PortalLinkButton, PortalStatusDot } from '../../Ui'
import type { PortalSignInProps } from '../types'
import { DEEP, FIELD, FieldMark, SOFT_ON_DEEP } from './parts'

/**
 * Colour's sign-in page: the whole page is the workshop's colour, with one
 * white panel that holds the sign-in.
 *
 * On a desk the workshop is on the left (its mark and name, its cover photo
 * with whether it is open, then its hours and where to find it as two cards
 * in the deeper tone) and the white panel fills the right, top to bottom.
 * On a phone the parts stack in the order a visitor needs them: who this is,
 * the sign-in, then the photo and how to find and reach the workshop.
 *
 * A workshop without a cover photo gets its initial, large and tone on
 * tone, in the photo's place, so the page is never a hole.
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
  const [t, locale] = await Promise.all([getTranslations('portal.signIn'), getLocale()])
  const week = workshop.hours ? portalWeekLines(workshop.hours, locale, t) : []
  const hasHours = week.length > 0 || Boolean(hoursText)
  const hasContact = Boolean(workshop.address || workshop.phone || workshop.email)

  return (
    <div
      className={`grid flex-1 content-start gap-4 px-4 py-5 sm:gap-6 sm:px-8 sm:py-8 lg:grid-cols-[minmax(0,11fr)_minmax(0,10fr)] lg:grid-rows-[auto_minmax(200px,1fr)_auto] lg:content-stretch lg:gap-x-12 lg:gap-y-6 lg:p-12 xl:gap-x-16 xl:px-16 xl:py-14 ${FIELD}`}
    >
      <header className="flex items-center gap-3.5 lg:col-start-1 lg:row-start-1 lg:gap-5">
        <FieldMark name={workshop.name} logoUrl={workshop.logoUrl} size={56} />
        <div className="min-w-0">
          <h1 className="p-display text-[length:clamp(28px,3.4vw,44px)] leading-[1.08] tracking-[-0.03em]">
            {workshop.name}
          </h1>
          {description && (
            <p className="mt-1 max-w-[560px] whitespace-pre-line text-[15px] font-semibold leading-snug sm:text-lg">
              {description}
            </p>
          )}
        </div>
      </header>

      <main className="flex flex-col rounded-[28px] bg-[var(--p-surface)] p-5 text-[color:var(--p-ink)] [--p-focus:var(--p-ink)] sm:p-8 lg:col-start-2 lg:row-span-3 lg:row-start-1 lg:justify-center lg:rounded-[36px] lg:p-12">
        <div className="mx-auto flex w-full max-w-[560px] flex-col gap-5">
          <p className="self-start rounded-full bg-[var(--p-soft)] px-3 py-1 text-[13px] font-extrabold leading-5">
            {eyebrow}
          </p>
          <h2 className="p-display text-[length:clamp(28px,3.4vw,46px)] leading-[1.12] tracking-[-0.03em]">
            {heading}
          </h2>
          {children}
        </div>
      </main>

      <div
        className={`relative min-h-[112px] overflow-hidden rounded-[24px] lg:col-start-1 lg:row-start-2 lg:min-h-[200px] lg:rounded-[28px] ${DEEP} ${
          coverUrl ? 'h-48 sm:h-72 lg:h-auto' : ''
        }`}
      >
        {coverUrl ? (
          <img
            src={coverUrl}
            alt=""
            className="absolute inset-0 h-full w-full object-cover"
            style={{ background: 'var(--p-photo)' }}
          />
        ) : (
          <span
            aria-hidden
            className="p-display -bottom-[0.2em] absolute right-[5%] select-none text-[length:clamp(180px,32vw,440px)] leading-none text-[color:var(--pc-deep-edge)]"
          >
            {workshop.name.trim().charAt(0).toUpperCase()}
          </span>
        )}
        <p className="absolute bottom-3 left-3 flex min-h-11 max-w-[calc(100%-24px)] items-center gap-2.5 rounded-[14px] bg-[var(--p-surface)] px-4 py-1.5 text-[15px] font-extrabold leading-snug text-[color:var(--p-ink)] lg:bottom-5 lg:left-5">
          <PortalStatusDot tone={workshop.openNow ? 'open' : 'closed'} />
          {workshop.openLine}
        </p>
      </div>

      {(hasHours || hasContact) && (
        // On the deeper tone a link and an outlined button are the field's ink.
        <footer className="grid gap-4 [--p-ink:var(--p-on-accent)] [--p-line-strong:var(--p-on-accent)] [--p-surface:transparent] sm:grid-cols-2 sm:[&>section:only-child]:col-span-2 lg:col-start-1 lg:row-start-3 lg:gap-6">
          {hasHours && (
            <section
              aria-labelledby="signin-hours"
              className={`${DEEP} flex min-w-0 flex-col rounded-[24px] p-5 lg:p-6`}
            >
              <h2
                id="signin-hours"
                className={`flex items-center gap-2 text-sm font-extrabold ${SOFT_ON_DEEP}`}
              >
                <Clock className="h-5 w-5 shrink-0" aria-hidden />
                {t('hoursTitle')}
              </h2>
              {week.length > 0 ? (
                <ul className="mt-3 flex flex-col text-[15px] lg:mt-auto lg:pt-4 lg:text-base">
                  {week.map((line) => (
                    <li
                      key={line.days}
                      aria-current={line.today ? 'date' : undefined}
                      className={`flex min-h-9 items-center justify-between gap-4 border-b border-[color:var(--pc-deep-line)] py-1 last:border-b-0 ${
                        line.today ? 'font-extrabold' : 'font-semibold'
                      }`}
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        {line.today && (
                          <span
                            aria-hidden
                            className="h-2 w-2 shrink-0 rounded-full bg-[var(--p-on-accent)]"
                          />
                        )}
                        {line.days}
                      </span>{' '}
                      <span className="text-right">{line.hours}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-3 whitespace-pre-line text-[15px] font-semibold leading-[1.6] lg:text-base">
                  {hoursText}
                </p>
              )}
            </section>
          )}

          {hasContact && (
            <section
              aria-labelledby="signin-find"
              className={`${DEEP} flex min-w-0 flex-col rounded-[24px] p-5 lg:p-6`}
            >
              <h2
                id="signin-find"
                className={`flex items-center gap-2 text-sm font-extrabold ${SOFT_ON_DEEP}`}
              >
                {workshop.address ? (
                  <MapPin className="h-5 w-5 shrink-0" aria-hidden />
                ) : (
                  <Phone className="h-5 w-5 shrink-0" aria-hidden />
                )}
                {workshop.address ? t('findUs') : t('callUs')}
              </h2>
              {workshop.address && (
                <p className="p-display mt-3 whitespace-pre-line text-xl leading-7 tracking-[-0.01em] lg:text-[22px]">
                  {workshop.address}
                </p>
              )}
              {((workshop.address && workshop.directionsUrl) ||
                (workshop.phone && workshop.phoneHref)) && (
                <div className="mt-auto flex flex-wrap gap-2 pt-4 [&_.p-btn]:flex-1">
                  {workshop.address && workshop.directionsUrl && (
                    <PortalLinkButton variant="hero" href={workshop.directionsUrl} external>
                      {t('directions')}
                      <ArrowRight className="h-[18px] w-[18px] shrink-0" aria-hidden />
                    </PortalLinkButton>
                  )}
                  {workshop.phone && workshop.phoneHref && (
                    <PortalLinkButton
                      variant="outline"
                      href={workshop.phoneHref}
                      className="whitespace-nowrap"
                    >
                      <Phone className="h-[18px] w-[18px] shrink-0" aria-hidden />
                      {workshop.phone}
                    </PortalLinkButton>
                  )}
                </div>
              )}
              {workshop.email && (
                <a
                  href={`mailto:${workshop.email}`}
                  className="p-link p-link--block mt-1 self-start break-all text-[15px]"
                >
                  {workshop.email}
                </a>
              )}
            </section>
          )}
        </footer>
      )}
    </div>
  )
}
