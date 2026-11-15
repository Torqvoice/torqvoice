'use client'

import { MapPin, MessageSquare, Phone } from 'lucide-react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { PortalAccountMenu } from '../../PortalAccountMenu'
import { usePortalNav } from '../../portalNav'
import { PortalCount, PortalIconButton, PortalLinkButton } from '../../Ui'
import type { PortalChromeProps } from '../types'
import { DEEP, FIELD, FIELD_ICON_BUTTON, FieldMark, FieldOpenDot, HIGHLIGHT_MARK } from './parts'

/**
 * Colour's frame around every signed-in page: the header is part of the
 * colour field.
 *
 * On a desk (from 1024 px): a bar in the workshop's colour with its mark and
 * name, the places with the current one in the deeper tone, whether the
 * workshop is open, "Book a visit" cut out in the field's ink, and the
 * customer's button. Below that: a compact bar in the same colour, and a
 * white tab bar with round shoulders along the bottom of the screen, Book as
 * the filled tile in the middle.
 *
 * The home continues the field under the bar, so the two read as one.
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

      <header className={`sticky top-0 z-30 ${FIELD}`}>
        <div className="p-shell flex min-h-[60px] items-center gap-2.5 py-2 lg:min-h-[72px] lg:gap-5 xl:gap-8">
          <Link
            href={`/portal/${orgParam}/dashboard`}
            aria-label={t('header.homeLink', { name: workshop.name })}
            className="flex min-h-11 min-w-0 flex-1 items-center gap-2.5 rounded-[14px] lg:flex-[0_1_auto] lg:gap-3"
          >
            <FieldMark name={workshop.name} logoUrl={workshop.logoUrl} size={40} />
            <span className="min-w-0">
              <span className="p-display line-clamp-2 text-[17px] leading-[1.15] tracking-[-0.01em] lg:text-xl">
                {workshop.name}
              </span>
              <span className="block text-xs font-semibold leading-snug lg:hidden">
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
                className={`flex min-h-11 items-center whitespace-nowrap rounded-[14px] border px-[18px] text-[15px] ${
                  item.active
                    ? `${DEEP} font-extrabold`
                    : 'border-transparent font-semibold hover:bg-[var(--pc-deep)]'
                }`}
              >
                {item.longLabel}
              </Link>
            ))}
          </nav>

          {/* Whatever width is left sits here, so a long name wraps before the links are squeezed. */}
          <div aria-hidden className="hidden flex-1 lg:block" />

          <p className="hidden items-center gap-2 whitespace-nowrap text-sm font-semibold xl:flex">
            <FieldOpenDot open={workshop.openNow} />
            {workshop.openLine}
          </p>

          {book && (
            <PortalLinkButton
              variant="hero"
              href={book.href}
              className="hidden min-h-11 whitespace-nowrap rounded-[14px] px-[18px] lg:inline-flex"
            >
              <book.icon className="h-5 w-5 shrink-0" aria-hidden />
              {book.longLabel}
            </PortalLinkButton>
          )}

          {messages && (
            <span className="relative hidden lg:block">
              <PortalIconButton
                href={messages.href}
                label={messages.label}
                className={FIELD_ICON_BUTTON}
              >
                <MessageSquare className="h-5 w-5" aria-hidden />
              </PortalIconButton>
              <PortalCount
                value={messages.badge}
                label={messages.badgeLabel}
                className={`pointer-events-none absolute -right-1 -top-1 ${HIGHLIGHT_MARK}`}
              />
            </span>
          )}

          {/* The button stands on the field; the menu it opens is a white sheet. */}
          <PortalAccountMenu
            orgParam={orgParam}
            customerName={customerName}
            className="text-[color:var(--p-ink)] [--p-focus:var(--p-ink)] [&>button]:rounded-[14px] [&>button]:font-extrabold [&>button]:[--p-focus:var(--p-on-accent)] [&>button]:[--p-ink:var(--p-on-accent)] [&>button]:[--p-line:var(--pc-deep-edge)] [&>button]:[--p-soft:var(--pc-deep)] [&>button]:[--p-surface:var(--pc-deep)]"
          />
        </div>
      </header>

      <main id="portal-main" className="flex min-w-0 flex-1 flex-col">
        {children}
      </main>

      {/* The chat fills the screen; a footer under it would only add a scroll. */}
      {!messages?.active && (workshop.phone || workshop.address) && (
        <footer>
          <div className="p-shell p-muted flex flex-col gap-x-6 pb-3 text-sm font-semibold sm:flex-row sm:flex-wrap sm:items-center lg:pb-5">
            <span className="p-ink py-2 font-extrabold sm:py-0">{workshop.name}</span>
            {workshop.phone && workshop.phoneHref && (
              <a
                href={workshop.phoneHref}
                aria-label={t('shell.callWorkshop', { phone: workshop.phone })}
                className="flex min-h-11 items-center gap-2 rounded-lg hover:text-[color:var(--p-ink)]"
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
                className="flex min-h-11 items-center gap-2 rounded-lg hover:text-[color:var(--p-ink)]"
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
        className="fixed inset-x-0 bottom-0 z-30 rounded-t-[24px] border border-b-0 bg-[var(--p-surface)] pb-[env(safe-area-inset-bottom)] lg:hidden"
      >
        <ul
          className="mx-auto grid h-[76px] max-w-[640px] items-center px-2"
          style={{ gridTemplateColumns: `repeat(${nav.length}, minmax(0, 1fr))` }}
        >
          {nav.map((item) => {
            const isBook = item.key === 'book'
            return (
              <li key={item.key} className="min-w-0">
                <Link
                  href={item.href}
                  aria-current={item.active ? 'page' : undefined}
                  className={`flex h-[68px] flex-col items-center justify-center rounded-[16px] px-0.5 text-[11px] leading-[14px] ${
                    isBook ? 'gap-0.5' : 'gap-1'
                  } ${
                    isBook || item.active
                      ? 'font-extrabold text-[color:var(--p-ink)]'
                      : 'font-bold text-[color:var(--p-muted)]'
                  }`}
                >
                  {isBook ? (
                    <span className="flex h-11 w-11 items-center justify-center rounded-[16px] bg-[var(--p-accent)] text-[color:var(--p-on-accent)]">
                      <item.icon className="h-6 w-6" aria-hidden />
                    </span>
                  ) : (
                    <span
                      className={`relative flex h-8 w-12 items-center justify-center rounded-[12px] ${
                        item.active ? 'bg-[var(--pc-tint)]' : ''
                      }`}
                    >
                      <item.icon
                        className="h-6 w-6"
                        strokeWidth={item.active ? 2.3 : 2}
                        aria-hidden
                      />
                      <PortalCount
                        value={item.badge}
                        label={item.badgeLabel}
                        className={`absolute -top-1 right-0 ${HIGHLIGHT_MARK}`}
                      />
                    </span>
                  )}
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
