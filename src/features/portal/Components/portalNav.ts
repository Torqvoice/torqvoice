'use client'

import {
  CalendarPlus,
  Car,
  FileText,
  Home,
  type LucideIcon,
  MessageSquare,
  Sailboat,
} from 'lucide-react'
import { usePathname } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { usePortalUnread } from './Chat/usePortalUnread'

export type PortalNavKey = 'home' | 'messages' | 'book' | 'cars' | 'papers'

export interface PortalNavEntry {
  key: PortalNavKey
  href: string
  /** The short word, for a tab: "Book", "Papers". */
  label: string
  /** The fuller wording where there is room: "Book a visit", "Invoices and quotes". */
  longLabel: string
  icon: LucideIcon
  /** This is the page being shown: mark it with `aria-current="page"`. */
  active: boolean
  /** Unread messages on the Messages entry; zero everywhere else. */
  badge: number
  /** The badge in words, for a screen reader; empty when there is none. */
  badgeLabel: string
}

const ROUTES: { key: PortalNavKey; path: string; matches: string[] }[] = [
  { key: 'home', path: 'dashboard', matches: ['dashboard'] },
  { key: 'messages', path: 'messages', matches: ['messages'] },
  { key: 'book', path: 'request-service', matches: ['request-service'] },
  { key: 'cars', path: 'vehicles', matches: ['vehicles'] },
  { key: 'papers', path: 'documents', matches: ['documents', 'invoices', 'quotes', 'inspections'] },
]

/**
 * The five places a signed-in customer can go, in the order the phone's
 * bottom navigation shows them: Home, Messages, Book, My cars, Papers.
 * Messages is left out when the workshop turned the chat off.
 *
 * Every theme's Chrome draws its navigation from this, so the routes, the
 * current page and the unread badge are decided in one place.
 */
export function usePortalNav(
  orgParam: string,
  options: { marine?: boolean; messagesEnabled?: boolean; unreadMessages?: number } = {}
): PortalNavEntry[] {
  const { marine = false, messagesEnabled = true, unreadMessages = 0 } = options
  const t = useTranslations('portal.nav')
  const pathname = usePathname() ?? ''
  const unread = usePortalUnread(orgParam, unreadMessages)
  const base = `/portal/${orgParam}/`
  const segment = pathname.startsWith(base) ? pathname.slice(base.length).split('/')[0] : ''

  const words: Record<PortalNavKey, { label: string; longLabel: string; icon: LucideIcon }> = {
    home: { label: t('home'), longLabel: t('home'), icon: Home },
    messages: { label: t('messages'), longLabel: t('messages'), icon: MessageSquare },
    book: { label: t('book'), longLabel: t('bookLong'), icon: CalendarPlus },
    cars: marine
      ? { label: t('carsMarine'), longLabel: t('carsMarine'), icon: Sailboat }
      : { label: t('cars'), longLabel: t('cars'), icon: Car },
    papers: { label: t('papers'), longLabel: t('papersLong'), icon: FileText },
  }

  return ROUTES.filter((route) => messagesEnabled || route.key !== 'messages').map((route) => {
    const badge = route.key === 'messages' ? unread : 0
    return {
      key: route.key,
      href: `${base}${route.path}`,
      ...words[route.key],
      active: route.matches.includes(segment),
      badge,
      badgeLabel: badge > 0 ? t('unread', { count: badge }) : '',
    }
  })
}
