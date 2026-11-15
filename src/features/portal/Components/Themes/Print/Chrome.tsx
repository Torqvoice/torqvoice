'use client'

import { MapPin, Phone } from 'lucide-react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { PortalAccountMenu } from '../../PortalAccountMenu'
import { PortalWorkshopMark } from '../../PortalWorkshopMark'
import { usePortalNav } from '../../portalNav'
import { PortalCount, PortalLinkButton } from '../../Ui'
import type { PortalChromeProps } from '../types'
import { PRINT_GUTTER, PrintOpenLine } from './parts'

/**
 * Print's frame around every signed-in page: a masthead.
 *
 * On a desk (from 1024 px): the workshop's mark and name in the serif, the
 * places as small capitals with a bar under the one being read, today's
 * hours, "Book a visit" and the customer's button, all standing on one heavy
 * rule. Below that: the name and the customer's button over the same rule,
 * and five squared tabs along the bottom of the screen with Book as the
 * filled one in the middle.
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
  const messages = nav.find((item) => item.key === 'messages')
  // Book is a button on the masthead, not one of its places.
  const mastLinks = nav.filter((item) => item.key !== 'book')

  return (
    <>
      <a
        href="#portal-main"
        className="p-btn p-btn--strong sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50"
      >
        {t('nav.skip')}
      </a>

      <header className="sticky top-0 z-30 bg-[var(--p-surface)]">
        <div className={PRINT_GUTTER}>
          <div className="flex min-h-14 items-center gap-3 border-b-2 border-[color:var(--p-ink)] lg:min-h-[72px] lg:gap-6 xl:gap-8">
            <Link
              href={`/portal/${orgParam}/dashboard`}
              aria-label={t('header.homeLink', { name: workshop.name })}
              className="flex min-h-11 min-w-0 flex-1 items-center gap-2.5 rounded-sm py-1.5 lg:flex-[0_1_auto] lg:gap-3.5"
            >
              <PortalWorkshopMark
                name={workshop.name}
                logoUrl={workshop.logoUrl}
                size={32}
                className="italic"
              />
              <span className="p-display line-clamp-2 min-w-0 text-[21px] leading-[1.15] lg:text-[26px]">
                {workshop.name}
              </span>
            </Link>

            <nav
              aria-label={t('nav.label')}
              className="hidden shrink-0 gap-6 self-stretch lg:flex xl:gap-8"
            >
              {mastLinks.map((item) => (
                <Link
                  key={item.key}
                  href={item.href}
                  aria-current={item.active ? 'page' : undefined}
                  className={`flex items-center gap-2 whitespace-nowrap border-b-[3px] pt-[3px] text-xs font-semibold uppercase tracking-[0.1em] ${
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

            {/* Whatever width is left sits here, so a long name wraps before the places are squeezed. */}
            <div aria-hidden className="hidden flex-1 lg:block" />

            <PrintOpenLine
              open={workshop.openNow}
              className="hidden whitespace-nowrap text-sm xl:flex"
            >
              {workshop.openLine}
            </PrintOpenLine>

            {book && (
              <PortalLinkButton
                variant="accent"
                href={book.href}
                className="hidden min-h-11 whitespace-nowrap lg:inline-flex"
              >
                {book.longLabel}
              </PortalLinkButton>
            )}

            <PortalAccountMenu orgParam={orgParam} customerName={customerName} />
          </div>
        </div>
      </header>

      <main id="portal-main" className="flex min-w-0 flex-1 flex-col">
        {children}
      </main>

      {/* The chat fills the screen; a footer under it would only add a scroll. */}
      {!messages?.active && (workshop.phone || workshop.address) && (
        <footer className={PRINT_GUTTER}>
          <div className="p-muted flex flex-col gap-x-8 border-t py-2 text-sm sm:flex-row sm:flex-wrap sm:items-center">
            <span className="p-display p-ink py-2 text-[17px] sm:py-0">{workshop.name}</span>
            {workshop.phone && workshop.phoneHref && (
              <a
                href={workshop.phoneHref}
                aria-label={t('shell.callWorkshop', { phone: workshop.phone })}
                className="flex min-h-11 items-center gap-2 rounded-sm hover:text-[color:var(--p-ink)]"
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
                className="flex min-h-11 items-center gap-2 rounded-sm hover:text-[color:var(--p-ink)]"
              >
                <MapPin className="h-4 w-4 shrink-0" aria-hidden />
                <span className="min-w-0">{workshop.address}</span>
              </a>
            )}
          </div>
        </footer>
      )}

      {/* Room for the tabs, so the last of the page never sits under them. */}
      <div aria-hidden className="h-[calc(72px+env(safe-area-inset-bottom))] shrink-0 lg:hidden" />

      <nav
        aria-label={t('nav.label')}
        className="fixed inset-x-0 bottom-0 z-30 border-t-2 border-[color:var(--p-ink)] bg-[var(--p-surface)] pb-[env(safe-area-inset-bottom)] lg:hidden"
      >
        <ul
          className="mx-auto grid h-[70px] max-w-[640px]"
          style={{ gridTemplateColumns: `repeat(${nav.length}, minmax(0, 1fr))` }}
        >
          {nav.map((item) => {
            const isBook = item.key === 'book'
            const Icon = item.icon
            return (
              <li key={item.key} className="min-w-0">
                <Link
                  href={item.href}
                  aria-current={item.active ? 'page' : undefined}
                  className={`flex h-full flex-col items-center justify-center gap-1.5 px-1 text-[11px] leading-[14px] ${
                    isBook
                      ? 'bg-[var(--p-accent)] font-semibold text-[color:var(--p-on-accent)] -outline-offset-4'
                      : item.active
                        ? 'font-semibold text-[color:var(--p-ink)] -outline-offset-2'
                        : 'font-medium text-[color:var(--p-muted)] -outline-offset-2'
                  }`}
                  style={isBook ? { outlineColor: 'var(--p-on-accent)' } : undefined}
                >
                  <span className="relative flex">
                    <Icon className="h-[22px] w-[22px]" strokeWidth={1.6} aria-hidden />
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
