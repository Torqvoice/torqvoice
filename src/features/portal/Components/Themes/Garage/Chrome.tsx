'use client'

import { MapPin, Phone, Plus } from 'lucide-react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { PortalAccountMenu } from '../../PortalAccountMenu'
import { PortalWorkshopMark } from '../../PortalWorkshopMark'
import { usePortalNav } from '../../portalNav'
import { PortalCount } from '../../Ui'
import type { PortalChromeProps } from '../types'
import { SquareDot } from './parts'

/**
 * Garage's frame around every signed-in page: a board's top rail.
 *
 * From 1100 px: one bar ruled off from the page, with the workshop's mark
 * and name, the places as capitals with a rule in the workshop's colour
 * under the current one, whether the workshop is open, "Book a visit" as a
 * block that fills the bar's height, and the customer's button in its own
 * cell. Below that: a compact bar with the name and today's hours, and five
 * square tabs along the bottom of the screen with Book as the filled one in
 * the middle.
 */
export function Chrome({
  orgParam,
  workshop,
  customerName,
  marine,
  messagesEnabled,
  unreadMessages,
  children,
}: PortalChromeProps) {
  const t = useTranslations('portal')
  const nav = usePortalNav(orgParam, { marine, messagesEnabled, unreadMessages })
  const book = nav.find((item) => item.key === 'book')
  const onMessages = nav.some((item) => item.key === 'messages' && item.active)
  // The bar's own links: Book is the block at its right end.
  const barLinks = nav.filter((item) => item.key !== 'book')

  return (
    <>
      <a
        href="#portal-main"
        className="p-btn p-btn--strong sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50"
      >
        {t('nav.skip')}
      </a>

      <header className="sticky top-0 z-30 border-b bg-[var(--p-bg)]">
        <div className="p-shell flex min-h-14 items-stretch gap-2 min-[1100px]:min-h-16 min-[1100px]:gap-5 xl:gap-8">
          <Link
            href={`/portal/${orgParam}/dashboard`}
            aria-label={t('header.homeLink', { name: workshop.name })}
            className="flex min-w-0 flex-1 items-center gap-2.5 rounded-[2px] py-1.5 text-[color:var(--p-ink)] no-underline min-[1100px]:min-w-[180px] min-[1100px]:flex-[0_1_auto] min-[1100px]:gap-3"
          >
            <PortalWorkshopMark name={workshop.name} logoUrl={workshop.logoUrl} size={34} />
            <span className="min-w-0">
              <span className="p-display block text-[21px] leading-[1.05] tracking-[0.04em] min-[1100px]:text-2xl">
                {workshop.name}
              </span>
              <span className="p-muted block text-xs leading-tight min-[1100px]:hidden">
                {workshop.openLine}
              </span>
            </span>
          </Link>

          <nav
            aria-label={t('nav.label')}
            className="hidden shrink-0 items-stretch min-[1100px]:flex"
          >
            {barLinks.map((item) => (
              <Link
                key={item.key}
                href={item.href}
                aria-current={item.active ? 'page' : undefined}
                className={`p-display flex items-center gap-2 whitespace-nowrap border-b-[3px] px-3 pt-[3px] text-[17px] font-semibold tracking-[0.08em] no-underline -outline-offset-2 xl:px-4 ${
                  item.active
                    ? 'border-[color:var(--p-accent)] text-[color:var(--p-ink)]'
                    : 'border-transparent text-[color:var(--p-muted)] hover:text-[color:var(--p-ink)]'
                }`}
              >
                {item.longLabel}
                <PortalCount value={item.badge} label={item.badgeLabel} />
              </Link>
            ))}
          </nav>

          {/* Whatever width is left sits here, so a long name wraps before the links are squeezed. */}
          <div aria-hidden className="hidden flex-1 min-[1100px]:block" />

          <p className="p-muted hidden items-center gap-2.5 whitespace-nowrap text-[15px] min-[1360px]:flex">
            <SquareDot tone={workshop.openNow ? 'open' : 'muted'} />
            {workshop.openLine}
          </p>

          <div className="flex shrink-0 items-stretch">
            {book && (
              <Link
                href={book.href}
                aria-current={book.active ? 'page' : undefined}
                className="p-display hidden items-center whitespace-nowrap bg-[var(--p-accent)] px-7 text-lg tracking-[0.08em] text-[color:var(--p-on-accent)] no-underline -outline-offset-4 hover:brightness-95 focus-visible:outline-[color:var(--p-on-accent)] min-[1100px]:flex"
              >
                {book.longLabel}
              </Link>
            )}
            <div className="flex items-center pl-1.5 min-[1100px]:border-l min-[1100px]:pl-3.5">
              <PortalAccountMenu orgParam={orgParam} customerName={customerName} />
            </div>
          </div>
        </div>
      </header>

      <main id="portal-main" className="flex min-w-0 flex-1 flex-col">
        {children}
      </main>

      {/* The chat fills the screen; a footer under it would only add a scroll. */}
      {!onMessages && (workshop.phone || workshop.address) && (
        <footer className="border-t">
          <div className="p-shell p-muted flex flex-col gap-x-7 py-2 text-sm sm:flex-row sm:flex-wrap sm:items-center">
            <span className="p-display py-2 text-base tracking-[0.06em] text-[color:var(--p-ink)] sm:py-0">
              {workshop.name}
            </span>
            {workshop.phone && workshop.phoneHref && (
              <a
                href={workshop.phoneHref}
                aria-label={t('shell.callWorkshop', { phone: workshop.phone })}
                className="flex min-h-11 items-center gap-2 rounded-[2px] text-[color:var(--p-muted)] no-underline hover:text-[color:var(--p-ink)]"
              >
                <Phone className="h-4 w-4 shrink-0" aria-hidden />
                {workshop.phone}
              </a>
            )}
            {workshop.address && workshop.directionsUrl && (
              <a
                href={workshop.directionsUrl}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={t('shell.openMap', { address: workshop.address })}
                className="flex min-h-11 items-center gap-2 rounded-[2px] text-[color:var(--p-muted)] no-underline hover:text-[color:var(--p-ink)]"
              >
                <MapPin className="h-4 w-4 shrink-0" aria-hidden />
                <span>{workshop.address}</span>
              </a>
            )}
          </div>
        </footer>
      )}

      {/* Room for the tab bar, so the last of the page never sits under it. */}
      <div
        aria-hidden
        className="h-[calc(72px_+_env(safe-area-inset-bottom))] shrink-0 min-[1100px]:hidden"
      />

      <nav
        aria-label={t('nav.label')}
        className="fixed inset-x-0 bottom-0 z-30 border-t bg-[var(--p-surface)] pb-[env(safe-area-inset-bottom)] min-[1100px]:hidden"
      >
        <ul
          className="grid h-[72px]"
          style={{ gridTemplateColumns: `repeat(${nav.length}, minmax(0, 1fr))` }}
        >
          {nav.map((item) => {
            const isBook = item.key === 'book'
            const Icon = isBook ? Plus : item.icon
            return (
              <li key={item.key} className="min-w-0">
                <Link
                  href={item.href}
                  aria-current={item.active ? 'page' : undefined}
                  className={`p-display flex h-full flex-col items-center justify-center gap-1.5 border-t-[3px] px-1 pb-[3px] text-sm leading-none tracking-[0.08em] no-underline ${
                    isBook
                      ? 'border-transparent bg-[var(--p-accent)] text-[color:var(--p-on-accent)] -outline-offset-4 focus-visible:outline-[color:var(--p-on-accent)]'
                      : item.active
                        ? 'border-[color:var(--p-accent)] font-semibold text-[color:var(--p-ink)] -outline-offset-2'
                        : 'border-transparent font-semibold text-[color:var(--p-muted)] -outline-offset-2'
                  }`}
                >
                  <span className="relative">
                    <Icon
                      className="h-[22px] w-[22px]"
                      strokeWidth={isBook ? 2.4 : 2}
                      aria-hidden
                    />
                    <PortalCount
                      value={item.badge}
                      label={item.badgeLabel}
                      className="absolute -right-3 -top-1.5"
                    />
                  </span>
                  <span className="max-w-full text-center">{item.label}</span>
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>
    </>
  )
}
