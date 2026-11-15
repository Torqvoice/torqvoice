'use client'

import { MapPin, MessageSquare, Phone, Plus } from 'lucide-react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { PortalAccountMenu } from '../../PortalAccountMenu'
import { PortalWorkshopMark } from '../../PortalWorkshopMark'
import { usePortalNav } from '../../portalNav'
import { PortalCount, PortalIconButton, PortalLinkButton, PortalStatusDot } from '../../Ui'
import type { PortalChromeProps } from '../types'

/**
 * Daylight's frame around every signed-in page.
 *
 * On a desk (from 1024 px): one white bar with the workshop's mark and name,
 * the places as pills, whether the workshop is open, "Book a visit" and the
 * customer's button. Below that: a compact bar with the name and today's
 * hours, and five tabs along the bottom of the screen with Book as the
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
  const entry = (key: string) => nav.find((item) => item.key === key)
  const book = entry('book')
  const messages = entry('messages')
  // The bar's own links: the chat sits on the home there, and Book is a button.
  const barLinks = nav.filter((item) => item.key !== 'book' && item.key !== 'messages')

  return (
    <>
      <a
        href="#portal-main"
        className="p-btn p-btn--strong sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50"
      >
        {t('nav.skip')}
      </a>

      <header className="sticky top-0 z-30 border-b bg-[var(--p-surface)]">
        <div className="p-shell flex min-h-[60px] items-center gap-2.5 py-2 lg:min-h-[72px] lg:gap-6 xl:gap-9">
          <Link
            href={`/portal/${orgParam}/dashboard`}
            aria-label={t('header.homeLink', { name: workshop.name })}
            className="flex min-h-11 min-w-0 flex-1 items-center gap-2.5 rounded-lg lg:flex-[0_1_auto] lg:gap-3"
          >
            <PortalWorkshopMark name={workshop.name} logoUrl={workshop.logoUrl} size={38} />
            <span className="min-w-0">
              <span className="p-display line-clamp-2 text-[17px] leading-[1.15] tracking-[-0.01em] lg:text-xl">
                {workshop.name}
              </span>
              <span className="p-muted block text-xs leading-snug lg:hidden">
                {workshop.openLine}
              </span>
            </span>
          </Link>

          <nav aria-label={t('nav.label')} className="hidden shrink-0 gap-1 lg:flex">
            {barLinks.map((item) => (
              <Link
                key={item.key}
                href={item.href}
                aria-current={item.active ? 'page' : undefined}
                className={`flex min-h-11 items-center whitespace-nowrap rounded-[var(--p-radius-control)] px-4 text-[15px] ${
                  item.active
                    ? 'bg-[var(--p-soft)] font-semibold text-[color:var(--p-ink)]'
                    : 'font-medium text-[color:var(--p-muted)] hover:text-[color:var(--p-ink)]'
                }`}
              >
                {item.longLabel}
              </Link>
            ))}
          </nav>

          {/* Whatever width is left sits here, so a long name wraps before the links are squeezed. */}
          <div aria-hidden className="hidden flex-1 lg:block" />

          <p className="p-muted hidden items-center gap-2 whitespace-nowrap text-sm xl:flex">
            <PortalStatusDot tone={workshop.openNow ? 'open' : 'closed'} />
            {workshop.openLine}
          </p>

          {book && (
            <PortalLinkButton
              variant="accent"
              href={book.href}
              className="hidden min-h-11 whitespace-nowrap lg:inline-flex"
            >
              {book.longLabel}
            </PortalLinkButton>
          )}

          {messages && (
            <span className="relative hidden lg:block">
              <PortalIconButton href={messages.href} label={messages.label}>
                <MessageSquare className="h-[18px] w-[18px]" aria-hidden />
              </PortalIconButton>
              <PortalCount
                value={messages.badge}
                label={messages.badgeLabel}
                className="pointer-events-none absolute -right-1 -top-1"
              />
            </span>
          )}

          <PortalAccountMenu orgParam={orgParam} customerName={customerName} />
        </div>
      </header>

      <main id="portal-main" className="flex min-w-0 flex-1 flex-col">
        {children}
      </main>

      {/* The chat fills the screen; a footer under it would only add a scroll. */}
      {!messages?.active && (workshop.phone || workshop.address) && (
        <footer className="border-t">
          <div className="p-shell p-muted flex flex-col gap-x-6 py-3 text-sm sm:flex-row sm:flex-wrap sm:items-center">
            <span className="p-ink py-2 font-semibold sm:py-0">{workshop.name}</span>
            {workshop.phone && workshop.phoneHref && (
              <a
                href={workshop.phoneHref}
                aria-label={t('shell.callWorkshop', { phone: workshop.phone })}
                className="flex min-h-11 items-center gap-2 rounded hover:text-[color:var(--p-ink)]"
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
                className="flex min-h-11 items-center gap-2 rounded hover:text-[color:var(--p-ink)]"
              >
                <MapPin className="h-4 w-4 shrink-0" aria-hidden />
                <span>{workshop.address}</span>
              </a>
            )}
          </div>
        </footer>
      )}

      {/* Room for the tab bar, so the last of the page never sits under it. */}
      <div aria-hidden className="h-[calc(76px+env(safe-area-inset-bottom))] shrink-0 lg:hidden" />

      <nav
        aria-label={t('nav.label')}
        className="fixed inset-x-0 bottom-0 z-30 border-t bg-[var(--p-surface)] pb-[env(safe-area-inset-bottom)] lg:hidden"
      >
        <ul
          className="mx-auto grid h-[76px] max-w-[640px] items-center px-2"
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
                  className={
                    isBook
                      ? 'mx-1 flex h-14 flex-col items-center justify-center gap-0.5 rounded-[min(var(--p-radius-control),28px)] bg-[var(--p-accent)] px-1 text-[11px] font-semibold leading-tight text-[color:var(--p-on-accent)]'
                      : `relative flex h-14 flex-col items-center justify-center gap-1 rounded-lg px-1 text-[11px] leading-tight ${
                          item.active
                            ? 'font-semibold text-[color:var(--p-ink)]'
                            : 'font-medium text-[color:var(--p-muted)]'
                        }`
                  }
                >
                  <span className="relative">
                    <Icon
                      className={isBook ? 'h-5 w-5' : 'h-[22px] w-[22px]'}
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
