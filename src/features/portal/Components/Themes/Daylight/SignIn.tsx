import { getLocale, getTranslations } from 'next-intl/server'
import { PortalWorkshopMark } from '../../PortalWorkshopMark'
import { portalWeekLines } from '../../SignIn/weekLines'
import { PortalSectionLabel, PortalStatusDot } from '../../Ui'
import type { PortalSignInProps } from '../types'

/**
 * Daylight's sign-in page: the workshop's own front door.
 *
 * On a desk, the workshop fills the dark left side from top to bottom (its
 * cover photo, mark, name and own words, then its hours, address and phone
 * along the foot) and the sign-in sits in the light right side, centred.
 * On a phone the same three parts stack in the order a visitor needs them:
 * who this is, the sign-in, then how to find and reach the workshop.
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
  const hasDetails =
    hasHours || Boolean(workshop.address) || Boolean(workshop.phone || workshop.email)

  return (
    <div className="grid flex-1 lg:grid-cols-[minmax(0,11fr)_minmax(0,9fr)] lg:grid-rows-[auto_1fr]">
      <header className="p-panel--hero flex flex-col lg:col-start-1 lg:row-start-1">
        {coverUrl && (
          <img
            src={coverUrl}
            alt=""
            className="h-40 w-full object-cover sm:h-56 lg:h-[min(380px,42svh)]"
            style={{ background: 'var(--p-photo)' }}
          />
        )}
        <div className="flex flex-col gap-4 px-5 pb-7 pt-6 sm:px-10 sm:pb-9 sm:pt-8 lg:px-14 lg:pt-10">
          <div className="flex flex-wrap items-center gap-x-3.5 gap-y-2">
            <PortalWorkshopMark name={workshop.name} logoUrl={workshop.logoUrl} size={52} />
            <p className="p-muted flex items-center gap-2 text-sm">
              <PortalStatusDot tone={workshop.openNow ? 'open' : 'closed'} />
              {workshop.openLine}
            </p>
          </div>
          <h1 className="p-display text-[40px] leading-none tracking-[-0.03em] sm:text-[52px] xl:text-[64px]">
            {workshop.name}
          </h1>
          {description && (
            <p className="p-muted max-w-[520px] whitespace-pre-line text-base leading-[1.45] sm:text-lg">
              {description}
            </p>
          )}
        </div>
      </header>

      <main className="flex items-center justify-center px-5 py-10 sm:px-10 sm:py-14 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:px-14 xl:px-[88px]">
        <div className="flex w-full max-w-[520px] flex-col gap-5">
          <PortalSectionLabel as="p">{eyebrow}</PortalSectionLabel>
          <h2 className="p-display text-[30px] sm:text-[40px]">{heading}</h2>
          {children}
        </div>
      </main>

      {hasDetails ? (
        <footer className="p-panel--hero flex flex-col justify-end px-5 pb-9 sm:px-10 lg:col-start-1 lg:row-start-2 lg:px-14 lg:pb-11">
          <div className="grid gap-x-8 gap-y-6 border-t pt-6 sm:grid-cols-3">
            {hasHours && (
              <div className="flex flex-col gap-1.5">
                <PortalSectionLabel className="text-xs">{t('hoursTitle')}</PortalSectionLabel>
                {week.length > 0 ? (
                  <ul className="text-[15px] leading-[1.6]">
                    {week.map((line) => (
                      <li
                        key={line.days}
                        className={line.today ? 'font-semibold' : undefined}
                        aria-current={line.today ? 'date' : undefined}
                      >
                        {line.days} {line.hours}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="whitespace-pre-line text-[15px] leading-[1.6]">{hoursText}</p>
                )}
              </div>
            )}
            {workshop.address && (
              <div className="flex flex-col gap-1.5">
                <PortalSectionLabel className="text-xs">{t('findUs')}</PortalSectionLabel>
                <p className="whitespace-pre-line text-[15px] leading-[1.6]">{workshop.address}</p>
                {workshop.directionsUrl && (
                  <a
                    href={workshop.directionsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-link p-link--block self-start text-[15px]"
                  >
                    {t('directions')}
                  </a>
                )}
              </div>
            )}
            {(workshop.phone || workshop.email) && (
              <div className="flex flex-col gap-1.5">
                <PortalSectionLabel className="text-xs">{t('callUs')}</PortalSectionLabel>
                {workshop.phone && workshop.phoneHref && (
                  <a
                    href={workshop.phoneHref}
                    className="p-link p-link--block self-start text-[15px]"
                  >
                    {workshop.phone}
                  </a>
                )}
                {workshop.email && (
                  <a
                    href={`mailto:${workshop.email}`}
                    className="p-link p-link--block self-start break-all text-[15px]"
                  >
                    {workshop.email}
                  </a>
                )}
              </div>
            )}
          </div>
        </footer>
      ) : (
        // The dark side still runs to the foot of the page on a desk.
        <div aria-hidden className="p-panel--hero hidden lg:col-start-1 lg:row-start-2 lg:block" />
      )}
    </div>
  )
}
