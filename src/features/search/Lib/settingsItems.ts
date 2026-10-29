'use client'

import { useMemo } from 'react'
import { useTranslations } from 'next-intl'
import type { LucideIcon } from 'lucide-react'
import type { PlanFeatures } from '@/lib/features'
import {
  type SettingsPage,
  type SettingsPageKey,
  type SettingsVisibility,
  visibleSettingsPages,
} from '@/features/settings/Lib/settingsPages'
import { SETTINGS_PAGE_ICONS } from '@/features/settings/Lib/settingsPageIcons'
import { SETTINGS_SEARCH_INDEX } from '@/features/settings/Lib/searchIndex'
import { type PreparedItem, prepareItem } from './matcher'

/** The separator between breadcrumb words, the same in every language. */
export const CRUMB = ' › '

export type SettingsSearchItem = {
  kind: 'settingsPage' | 'setting'
  /** Unique across the palette; a page is `page:<key>`, a setting its index id. */
  id: string
  page: SettingsPageKey
  /** Where to go, query and anchor included. */
  href: string
  title: string
  description?: string
  /** Category for a page; category and page for a setting. */
  breadcrumb: string
  keywords: string[]
  /** The plan does not include the page; it opens, but shows the upgrade note. */
  locked: boolean
  anchor?: string
  icon: LucideIcon
}

export type PreparedSettingsItem = { item: SettingsSearchItem; prepared: PreparedItem }

function hrefFor(page: SettingsPage, query?: string, anchor?: string): string {
  let href = page.href
  if (query) href += `?${query}`
  if (anchor) href += `#${anchor}`
  return href
}

/**
 * Every settings page and every indexed setting on this install, titled in
 * the workshop's language and prepared for the matcher. Memoised on the
 * install flags and the translator, so typing never rebuilds it.
 */
export function useSettingsSearchItems(
  v: SettingsVisibility & { features?: PlanFeatures }
): PreparedSettingsItem[] {
  const t = useTranslations('settings')
  const { isCloud, supportEnabled, features } = v

  return useMemo(() => {
    const pages = visibleSettingsPages({ isCloud, supportEnabled })
    const byKey = new Map(pages.map((p) => [p.key, p]))
    const out: PreparedSettingsItem[] = []

    for (const page of pages) {
      const title = t(`nav.items.${page.key}.title`)
      const description = t(`nav.items.${page.key}.description`)
      const item: SettingsSearchItem = {
        kind: 'settingsPage',
        id: `page:${page.key}`,
        page: page.key,
        href: page.href,
        title,
        description,
        breadcrumb: t(`nav.categories.${page.category}`),
        // The description's words double as aliases: "branding" finds Company.
        keywords: [page.key.toLowerCase(), ...description.toLowerCase().split(/[\s,&]+/)].filter(
          (w) => w.length > 2
        ),
        locked: !!(page.gate && features && !features[page.gate]),
        icon: SETTINGS_PAGE_ICONS[page.key],
      }
      out.push({
        item,
        prepared: prepareItem({
          title,
          keywords: item.keywords,
          description,
          context: item.breadcrumb,
        }),
      })
    }

    for (const entry of SETTINGS_SEARCH_INDEX) {
      const page = byKey.get(entry.page)
      if (!page) continue
      const pageTitle = t(`nav.items.${page.key}.title`)
      const title = t(entry.title, entry.values)
      const description = entry.description ? t(entry.description, entry.values) : undefined
      const breadcrumb = `${t(`nav.categories.${page.category}`)}${CRUMB}${pageTitle}`
      const item: SettingsSearchItem = {
        kind: 'setting',
        id: entry.id,
        page: page.key,
        href: hrefFor(page, entry.query, entry.anchor),
        title,
        description,
        breadcrumb,
        keywords: entry.keywords,
        locked: !!(page.gate && features && !features[page.gate]),
        anchor: entry.anchor,
        icon: SETTINGS_PAGE_ICONS[page.key],
      }
      out.push({
        item,
        prepared: prepareItem({
          title,
          keywords: entry.keywords,
          description,
          context: pageTitle,
        }),
      })
    }

    return out
  }, [t, isCloud, supportEnabled, features])
}
