'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Search, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { PlanFeatures } from '@/lib/features'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  SETTINGS_CATEGORIES,
  type SettingsPage,
  visibleSettingsPages,
} from '@/features/settings/Lib/settingsPages'
import { SETTINGS_PAGE_ICONS } from '@/features/settings/Lib/settingsPageIcons'
import { requestSpotlight } from '@/features/settings/Components/SettingsSpotlight'
import { useSettingsSearchItems } from '@/features/search/Lib/settingsItems'
import { prepareQuery, rank, splitByRanges } from '@/features/search/Lib/matcher'

type NavProps = {
  features?: PlanFeatures
  isCloud?: boolean
  supportEnabled?: boolean
  /**
   * Paths that wear a "New" pill, decided on the server. Recently shipped and
   * older than this workshop, so the pill is news to whoever reads it.
   */
  newItems?: string[]
  mobile?: boolean
}

const RESULT_LIMIT = 12

/**
 * The box above the settings menu. Typing narrows the whole of settings,
 * fields included, to a short list that opens the page and lands on the
 * thing, so nobody has to guess which page "logo" or "due days" is under.
 * Arrow keys move, Enter opens, Escape clears.
 */
function SettingsSearch({
  features,
  isCloud,
  supportEnabled,
}: Pick<NavProps, 'features' | 'isCloud' | 'supportEnabled'>) {
  const t = useTranslations('search.settingsSearch')
  const tSettings = useTranslations('settings')
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const items = useSettingsSearchItems({ features, isCloud, supportEnabled })

  const results = useMemo(() => {
    const q = prepareQuery(query)
    if (q.tokens.length === 0) return []
    return rank(q, items, RESULT_LIMIT)
  }, [query, items])

  // A fresh list starts at the top; the arrow keys walk it from there.
  useEffect(() => setActive(0), [results])

  const open = (href: string, anchor?: string) => {
    setQuery('')
    router.push(href)
    if (anchor) requestSpotlight(anchor)
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((i) => Math.min(i + 1, results.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      const hit = results[active]
      if (hit) {
        e.preventDefault()
        open(hit.item.href, hit.item.anchor)
      }
    } else if (e.key === 'Escape') {
      setQuery('')
      inputRef.current?.blur()
    }
  }

  const searching = query.trim().length > 0

  return (
    <div className="relative">
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          ref={inputRef}
          type="search"
          role="combobox"
          aria-label={t('label')}
          aria-expanded={searching}
          aria-controls="settings-search-results"
          aria-autocomplete="list"
          autoComplete="off"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={t('placeholder')}
          data-testid="settings-search"
          className="h-9 w-full rounded-lg border bg-background pr-8 pl-9 text-sm shadow-xs outline-none transition-[border-color,box-shadow] placeholder:text-muted-foreground focus:border-primary/50 focus:ring-2 focus:ring-primary/15 [&::-webkit-search-cancel-button]:hidden"
        />
        {searching && (
          <button
            type="button"
            onClick={() => {
              setQuery('')
              inputRef.current?.focus()
            }}
            className="absolute top-1/2 right-2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label={t('label')}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {searching && (
        <div
          id="settings-search-results"
          role="listbox"
          className="mt-2 overflow-hidden rounded-lg border bg-popover shadow-md"
        >
          {results.length === 0 ? (
            <p className="px-3 py-4 text-center text-xs text-muted-foreground">
              {t('empty', { query: query.trim() })}
            </p>
          ) : (
            <ul className="max-h-[60vh] overflow-y-auto py-1">
              {results.map(({ item, match }, i) => {
                const Icon = item.icon
                return (
                  <li key={item.id} role="presentation">
                    <button
                      type="button"
                      role="option"
                      aria-selected={i === active}
                      onMouseEnter={() => setActive(i)}
                      onClick={() => open(item.href, item.anchor)}
                      className={cn(
                        'flex w-full cursor-pointer items-center gap-3 px-3 py-2 text-left text-sm transition-colors',
                        i === active ? 'bg-primary/10 text-foreground' : 'hover:bg-muted'
                      )}
                    >
                      <Icon
                        className={cn(
                          'h-4 w-4 shrink-0',
                          i === active ? 'text-primary' : 'text-muted-foreground'
                        )}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate">
                          {splitByRanges(item.title, match.ranges).map((part, k) =>
                            part.hit ? (
                              <mark key={k} className="bg-transparent font-semibold text-primary">
                                {part.text}
                              </mark>
                            ) : (
                              <span key={k}>{part.text}</span>
                            )
                          )}
                        </span>
                        <span className="block truncate text-[11px] text-muted-foreground">
                          {item.breadcrumb}
                          {item.locked ? ` · ${tSettings('nav.pro')}` : ''}
                        </span>
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

export function SettingsNav({
  features,
  isCloud,
  supportEnabled,
  newItems = [],
  mobile,
}: NavProps) {
  const pathname = usePathname()
  const router = useRouter()
  const t = useTranslations('settings')

  const pages = visibleSettingsPages({ isCloud, supportEnabled })

  const newPill = (item: SettingsPage) =>
    newItems.includes(item.href) ? (
      <span className="shrink-0 rounded bg-primary/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-primary">
        {t('nav.new')}
      </span>
    ) : null

  if (mobile) {
    const activeItem = pages.find((item) => pathname === item.href)

    return (
      <div className="space-y-3">
        <SettingsSearch features={features} isCloud={isCloud} supportEnabled={supportEnabled} />
        <Select value={activeItem?.href ?? pathname} onValueChange={(value) => router.push(value)}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder={t('title')} />
          </SelectTrigger>
          <SelectContent>
            {pages.map((item) => (
              <SelectItem key={item.href} value={item.href}>
                <span className="flex items-center gap-2">
                  {t(`nav.items.${item.key}.title`)}
                  {newPill(item)}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    )
  }

  return (
    <nav className="flex flex-col gap-4">
      <SettingsSearch features={features} isCloud={isCloud} supportEnabled={supportEnabled} />
      {SETTINGS_CATEGORIES.map((category) => {
        const visibleItems = pages.filter((p) => p.category === category)
        if (visibleItems.length === 0) return null
        return (
          <div key={category}>
            <p className="mb-1 px-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground/60">
              {t(`nav.categories.${category}`)}
            </p>
            <div className="flex flex-col gap-0.5">
              {visibleItems.map((item) => {
                const isActive = pathname === item.href
                const isLocked = !!(item.gate && features && !features[item.gate])
                const Icon = SETTINGS_PAGE_ICONS[item.key]
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors',
                      isActive
                        ? 'bg-primary/10 text-primary font-medium'
                        : isLocked
                          ? 'text-muted-foreground/50 hover:bg-muted/50 hover:text-muted-foreground'
                          : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className={cn('truncate', isActive && 'font-medium')}>
                          {t(`nav.items.${item.key}.title`)}
                        </p>
                        {isLocked && (
                          <span className="shrink-0 rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-amber-600">
                            {t('nav.pro')}
                          </span>
                        )}
                        {newPill(item)}
                      </div>
                      <p className="hidden truncate text-xs text-muted-foreground lg:block">
                        {t(`nav.items.${item.key}.description`)}
                      </p>
                    </div>
                  </Link>
                )
              })}
            </div>
          </div>
        )
      })}
    </nav>
  )
}
