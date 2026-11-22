'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Search, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
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
import { useShortcuts } from '@/features/shortcuts/Components/ShortcutsProvider'
import { claimsPlainKeys } from '@/features/shortcuts/Lib/keys'
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
 *
 * Beside the content it is given the menu as `children`: the box stays put
 * while the menu scrolls, a bare slash puts the cursor in it, and what is
 * found takes the menu's place. Above the content, on a narrow window, the
 * results open under the box instead.
 */
function SettingsSearch({
  features,
  isCloud,
  supportEnabled,
  children,
}: Pick<NavProps, 'features' | 'isCloud' | 'supportEnabled'> & { children?: React.ReactNode }) {
  const inMenu = children !== undefined
  // Somebody who switched shortcuts off, or the ones made of a single key,
  // gets no slash key and no hint of one.
  const { prefs } = useShortcuts()
  const slashKey = inMenu && prefs.enabled && prefs.singleKeys
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

  // A bare slash from anywhere that is not being typed into. Only the box
  // beside the content listens, and only while it can be seen.
  useEffect(() => {
    if (!slashKey) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey || claimsPlainKeys(e)) return
      if (document.querySelector('[role="dialog"], [role="alertdialog"]')) return
      const input = inputRef.current
      if (!input || input.checkVisibility?.() === false) return
      e.preventDefault()
      input.focus()
      input.select()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [slashKey])

  const searching = query.trim().length > 0

  return (
    <div className={cn('relative', inMenu && 'flex flex-col')}>
      <div className={cn('relative', inMenu && 'sticky top-0 z-10 bg-background pb-2')}>
        <Search
          className={cn(
            'pointer-events-none absolute left-3 h-4 w-4 text-muted-foreground',
            inMenu ? 'top-2.5' : 'top-1/2 -translate-y-1/2'
          )}
        />
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
          className={cn(
            'peer h-9 w-full rounded-lg border pr-8 pl-9 text-sm outline-none transition-[background-color,border-color,box-shadow] placeholder:text-muted-foreground focus:border-primary/50 focus:ring-2 focus:ring-primary/15 [&::-webkit-search-cancel-button]:hidden',
            inMenu
              ? 'border-transparent bg-muted focus:bg-background focus:ring-inset'
              : 'bg-background shadow-xs'
          )}
        />
        {slashKey && !searching && (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute top-2 right-2 flex h-5 min-w-5 peer-focus:hidden items-center justify-center rounded border bg-background px-1 font-sans text-[11px] font-medium text-muted-foreground"
          >
            /
          </span>
        )}
        {searching && (
          <button
            type="button"
            onClick={() => {
              setQuery('')
              inputRef.current?.focus()
            }}
            className={cn(
              'absolute right-2 flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground',
              inMenu ? 'top-2' : 'top-1/2 -translate-y-1/2'
            )}
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
          className={cn(!inMenu && 'mt-2 overflow-hidden rounded-lg border bg-popover shadow-md')}
        >
          {results.length === 0 ? (
            <p className="px-3 py-4 text-center text-xs text-muted-foreground" role="status">
              {t('empty', { query: query.trim() })}
            </p>
          ) : (
            <ul
              className={cn(inMenu ? 'flex flex-col gap-0.5' : 'max-h-[60vh] overflow-y-auto py-1')}
            >
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
                        inMenu && 'rounded-lg',
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
                      {inMenu && i === active && (
                        <span
                          aria-hidden="true"
                          className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded border bg-background px-1 text-[11px] font-medium text-muted-foreground"
                        >
                          ↵
                        </span>
                      )}
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
          {inMenu && results.length > 0 && (
            <p className="px-3 pt-3 text-[11px] text-muted-foreground" role="status">
              {t('resultsHint', { count: results.length })}
            </p>
          )}
        </div>
      )}
      {/* Kept in the page while results show, so it is found again as it was. */}
      {inMenu && <div hidden={searching}>{children}</div>}
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

  // The list is longer than the window: after a link or the search lands on a
  // page further down, bring that page's row into view so the person can see
  // where they are. "nearest" moves nothing when the row is already visible.
  const navRef = useRef<HTMLElement>(null)
  const showCurrent = useCallback(() => {
    navRef.current
      ?.querySelector<HTMLElement>('[aria-current="page"]')
      ?.scrollIntoView?.({ block: 'nearest' })
  }, [])
  useEffect(showCurrent, [pathname, showCurrent])
  // On a narrow window this list is hidden and cannot scroll; when the window
  // widens and it appears, the page has not changed, so look again then.
  useEffect(() => {
    const nav = navRef.current
    if (!nav || typeof ResizeObserver === 'undefined') return
    let shown = nav.offsetHeight > 0
    const observer = new ResizeObserver(() => {
      const now = nav.offsetHeight > 0
      if (now && !shown) showCurrent()
      shown = now
    })
    observer.observe(nav)
    return () => observer.disconnect()
  }, [showCurrent])

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
    <SettingsSearch features={features} isCloud={isCloud} supportEnabled={supportEnabled}>
      <TooltipProvider delayDuration={500}>
        <nav ref={navRef} className="flex flex-col gap-4 pt-1">
          {SETTINGS_CATEGORIES.map((category) => {
            const visibleItems = pages.filter((p) => p.category === category)
            if (visibleItems.length === 0) return null
            return (
              <div key={category}>
                <p className="mb-1 px-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {t(`nav.categories.${category}`)}
                </p>
                <div className="flex flex-col gap-0.5">
                  {visibleItems.map((item) => {
                    const isActive = pathname === item.href
                    const isLocked = !!(item.gate && features && !features[item.gate])
                    const Icon = SETTINGS_PAGE_ICONS[item.key]
                    return (
                      // What the page is for, on hover and on keyboard focus.
                      <Tooltip key={item.href}>
                        <TooltipTrigger asChild>
                          <Link
                            href={item.href}
                            aria-current={isActive ? 'page' : undefined}
                            className={cn(
                              // Room above for the search box that stays on top.
                              'group flex min-h-8 scroll-mt-12 items-center gap-2.5 rounded-lg px-3 py-1.5 text-sm transition-colors',
                              isActive
                                ? 'bg-primary/10 font-semibold text-primary'
                                : isLocked
                                  ? 'text-muted-foreground/70 hover:bg-muted/50 hover:text-muted-foreground'
                                  : 'text-foreground hover:bg-muted'
                            )}
                          >
                            <Icon
                              className={cn(
                                'h-4 w-4 shrink-0',
                                !isActive && 'text-muted-foreground group-hover:text-foreground'
                              )}
                            />
                            {/* Two lines at most: a long title wraps instead of being cut. */}
                            <span className="line-clamp-2 min-w-0 flex-1">
                              {t(`nav.items.${item.key}.title`)}
                            </span>
                            {isLocked && (
                              <span className="shrink-0 rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-amber-600">
                                {t('nav.pro')}
                              </span>
                            )}
                            {newPill(item)}
                          </Link>
                        </TooltipTrigger>
                        <TooltipContent side="right">
                          {t(`nav.items.${item.key}.description`)}
                        </TooltipContent>
                      </Tooltip>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </nav>
      </TooltipProvider>
    </SettingsSearch>
  )
}
