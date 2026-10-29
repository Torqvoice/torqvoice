'use client'

import { Fragment, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import {
  Bell,
  Car,
  ClipboardCheck,
  CornerDownLeft,
  Disc3,
  FileText,
  type LucideIcon,
  Package,
  Plug,
  ScanLine,
  Search,
  Users,
  Wrench,
} from 'lucide-react'
import {
  CommandDialog,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { formatQuantity } from '@/lib/format-quantity'
import { cn } from '@/lib/utils'
import { globalSearch, getRecentCustomers } from '@/features/search/Actions/searchActions'
import { formatTypeKey } from '@/features/vehicles/Lib/typeKey'
import { useTypeKeyEnabled } from '@/components/type-key-context'
import { openPlateLookup, usePlateLookupAccess } from '@/components/plate-lookup-context'
import { requestSpotlight } from '@/features/settings/Components/SettingsSpotlight'
import { CRUMB, useSettingsSearchItems } from '@/features/search/Lib/settingsItems'
import {
  type CommandContext,
  visibleActionCommands,
  visiblePageCommands,
} from '@/features/search/Lib/commands'
import {
  type PreparedItem,
  type Range,
  prepareItem,
  prepareQuery,
  rank,
  splitByRanges,
} from '@/features/search/Lib/matcher'
import { pushRecent, readRecent, type RecentPick } from '@/features/search/Lib/recent'

type Vehicle = {
  id: string
  make: string
  model: string
  year: number
  licensePlate: string | null
  hsn?: string | null
  tsn?: string | null
}

interface SearchResult {
  vehicles: Vehicle[]
  customers: {
    id: string
    name: string
    email: string | null
    phone: string | null
    company: string | null
    vehicles: Vehicle[]
  }[]
  services: {
    id: string
    title: string
    invoiceNumber: string | null
    vehicle: Vehicle | null
  }[]
  parts: {
    id: string
    name: string
    partNumber: string | null
    quantity: number
    unit: string | null
  }[]
  quotes: {
    id: string
    title: string
    quoteNumber: string | null
    status: string
  }[]
  reminders: {
    id: string
    title: string
    dueDate: Date | null
    isCompleted: boolean
    customer: { id: string; name: string } | null
    vehicle: Vehicle | null
  }[]
  inspections: {
    id: string
    status: string
    createdAt: Date
    template: { name: string }
    vehicle: Vehicle
  }[]
  tireSets: {
    id: string
    reference: string | null
    season: string
    size: string | null
    quantity: number
    status: string
    location: { code: string } | null
    customer: { id: string; name: string } | null
    vehicle: Vehicle | null
  }[]
}

const EMPTY: SearchResult = {
  vehicles: [],
  customers: [],
  services: [],
  parts: [],
  quotes: [],
  reminders: [],
  inspections: [],
  tireSets: [],
}

type RecentCustomer = {
  id: string
  name: string
  email: string | null
  phone: string | null
  company: string | null
}

/** A connector the catalog offers, trimmed to what the palette shows. */
export type SearchConnector = { id: string; name: string; category: string; logo: string }

export type SearchCommandProps = CommandContext & {
  isCloud?: boolean
  supportEnabled?: boolean
  isMarine?: boolean
  connectors?: SearchConnector[]
}

/**
 * Anything the palette knows without asking the server: a settings page or
 * a setting on it, a connector, a page of the app, or something to start.
 */
type LocalItem = {
  kind: 'setting' | 'settingsPage' | 'connector' | 'page' | 'action'
  id: string
  href: string
  title: string
  subtitle?: string
  icon?: LucideIcon
  logo?: string
  locked?: boolean
  anchor?: string
  run?: () => void
}

type PreparedLocal = { item: LocalItem; prepared: PreparedItem }

/** How many to show per group when searching. Everything else is a scroll away in the app itself. */
const LIMITS: Record<LocalItem['kind'], number> = {
  setting: 8,
  settingsPage: 8,
  connector: 4,
  page: 5,
  action: 4,
}

/** Enough recent customers to be useful before typing, few enough that the actions stay in view. */
const RECENT_CUSTOMERS_SHOWN = 8

/** Wait this long after the last keystroke before asking the server. Local matches never wait. */
const REMOTE_DEBOUNCE_MS = 150

function Highlight({ text, ranges }: { text: string; ranges: Range[] }) {
  return (
    <>
      {splitByRanges(text, ranges).map((part, i) =>
        part.hit ? (
          <mark key={i} className="bg-transparent font-semibold text-primary">
            {part.text}
          </mark>
        ) : (
          <Fragment key={i}>{part.text}</Fragment>
        )
      )}
    </>
  )
}

function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="pointer-events-none inline-flex h-5 min-w-5 items-center justify-center rounded border bg-muted px-1 font-mono text-[10px] font-medium text-muted-foreground">
      {children}
    </kbd>
  )
}

function Chip({ icon: Icon, logo }: { icon?: LucideIcon; logo?: string }) {
  return (
    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground ring-1 ring-inset ring-foreground/5 group-data-[selected=true]/row:bg-primary/10 group-data-[selected=true]/row:text-primary group-data-[selected=true]/row:ring-primary/20">
      {logo ? (
        <img src={logo} alt="" className="h-4 w-4 object-contain" />
      ) : Icon ? (
        <Icon className="h-4! w-4!" />
      ) : null}
    </span>
  )
}

/**
 * One row. The chip lights up in the theme colour on the selected row, and
 * the return-key hint appears there and nowhere else, so the eye always
 * knows which row Enter will open.
 */
function Row({
  value,
  onSelect,
  icon,
  logo,
  title,
  subtitle,
  trailing,
  locked,
  className,
  proLabel,
}: {
  value: string
  onSelect: () => void
  icon?: LucideIcon
  logo?: string
  title: ReactNode
  subtitle?: ReactNode
  /** A mono tag on the right: a plate, a shelf code, an invoice number. */
  trailing?: ReactNode
  locked?: boolean
  className?: string
  proLabel?: string
}) {
  return (
    <CommandItem
      value={value}
      onSelect={onSelect}
      className={cn('group/row cursor-pointer gap-3 rounded-lg', className)}
    >
      <Chip icon={icon} logo={logo} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm">{title}</span>
          {locked && proLabel && (
            <span className="shrink-0 rounded bg-amber-500/15 px-1.5 py-px text-[10px] font-semibold text-amber-600">
              {proLabel}
            </span>
          )}
        </div>
        {subtitle && <div className="truncate text-xs text-muted-foreground">{subtitle}</div>}
      </div>
      {trailing && (
        <span className="hidden shrink-0 font-mono text-xs text-muted-foreground sm:inline">
          {trailing}
        </span>
      )}
      <span className="hidden shrink-0 items-center gap-1 text-[11px] text-muted-foreground opacity-0 transition-opacity group-data-[selected=true]/row:opacity-100 sm:flex">
        <CornerDownLeft className="h-3! w-3!" />
      </span>
    </CommandItem>
  )
}

function vehicleLine(v: Vehicle) {
  return `${v.year} ${v.make} ${v.model}`
}

function iconForHref(href: string): LucideIcon {
  if (href.startsWith('/customers')) return Users
  if (href.startsWith('/vehicles')) return Car
  if (href.startsWith('/quotes')) return FileText
  if (href.startsWith('/inventory')) return Package
  if (href.startsWith('/tire-hotel')) return Disc3
  if (href.startsWith('/inspections')) return ClipboardCheck
  if (href.startsWith('/reminders')) return Bell
  if (href.startsWith('/settings')) return Search
  return Wrench
}

export function SearchCommand({
  visibleSubjects,
  features,
  tireHotelEnabled,
  aiEnabled,
  isAdminOrOwner,
  isCloud,
  supportEnabled,
  isMarine,
  connectors = [],
}: SearchCommandProps) {
  const router = useRouter()
  const t = useTranslations('search')
  const tNav = useTranslations('navigation.sidebar')
  const tSettings = useTranslations('settings')
  const tIntegrations = useTranslations('integrations')
  const tTire = useTranslations('tireHotel')
  const tPlate = useTranslations('vehicles.plateLookup')
  const typeKeyEnabled = useTypeKeyEnabled()
  const plateLookup = usePlateLookupAccess()

  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult>(EMPTY)
  const [loading, setLoading] = useState(false)
  const [recentCustomers, setRecentCustomers] = useState<RecentCustomer[]>([])
  const [recent, setRecent] = useState<RecentPick[]>([])
  const cacheRef = useRef(new Map<string, SearchResult>())
  const seqRef = useRef(0)

  const canSettings = !visibleSubjects || visibleSubjects.includes('settings')
  const ctx: CommandContext = useMemo(
    () => ({ visibleSubjects, features, tireHotelEnabled, aiEnabled, isAdminOrOwner }),
    [visibleSubjects, features, tireHotelEnabled, aiEnabled, isAdminOrOwner]
  )

  const settingsItems = useSettingsSearchItems({ isCloud, supportEnabled, features })

  // Everything searchable without the server, titled in the workshop's
  // language and prepared once; typing only ranks it.
  const localItems = useMemo<PreparedLocal[]>(() => {
    const out: PreparedLocal[] = []
    const settingsWord = tNav('settings')

    for (const page of visiblePageCommands(ctx)) {
      const title = tNav(isMarine && page.marineTitleKey ? page.marineTitleKey : page.titleKey)
      const item: LocalItem = {
        kind: 'page',
        id: page.id,
        href: page.href,
        title,
        icon: isMarine && page.marineIcon ? page.marineIcon : page.icon,
      }
      out.push({ item, prepared: prepareItem({ title, keywords: page.keywords }) })
    }

    for (const action of visibleActionCommands(ctx)) {
      const title = t(`actions.${action.titleKey}`)
      const item: LocalItem = {
        kind: 'action',
        id: action.id,
        href: action.href,
        title,
        icon: action.icon,
      }
      out.push({ item, prepared: prepareItem({ title, keywords: action.keywords }) })
    }
    if (plateLookup.available) {
      const title = tPlate('open')
      out.push({
        item: {
          kind: 'action',
          id: 'action:plate-lookup',
          href: '#',
          title,
          subtitle: plateLookup.registryName ?? undefined,
          icon: ScanLine,
          run: () => openPlateLookup(),
        },
        prepared: prepareItem({
          title,
          keywords: ['plate', 'registry', 'lookup', 'license plate', 'vin', 'registration'],
        }),
      })
    }

    if (canSettings) {
      for (const { item, prepared } of settingsItems) {
        const subtitle = item.description
          ? `${item.breadcrumb} · ${item.description}`
          : item.breadcrumb
        out.push({
          item: {
            kind: item.kind,
            id: item.id,
            href: item.href,
            title: item.title,
            subtitle: `${settingsWord}${CRUMB}${subtitle}`,
            icon: item.icon,
            locked: item.locked,
            anchor: item.anchor,
          },
          prepared,
        })
      }
      const integrationsWord = tSettings('nav.items.integrations.title')
      for (const c of connectors) {
        const category = tIntegrations(`categories.${c.category}`)
        out.push({
          item: {
            kind: 'connector',
            id: `connector:${c.id}`,
            href: `/settings/integrations/${c.id}`,
            title: c.name,
            subtitle: `${settingsWord}${CRUMB}${integrationsWord}${CRUMB}${category}`,
            icon: Plug,
            logo: c.logo,
          },
          prepared: prepareItem({
            title: c.name,
            keywords: [c.id, c.category, 'integration', 'connect', 'connector'],
            context: category,
          }),
        })
      }
    }
    return out
  }, [
    ctx,
    isMarine,
    canSettings,
    settingsItems,
    connectors,
    plateLookup.available,
    plateLookup.registryName,
    t,
    tNav,
    tSettings,
    tIntegrations,
    tPlate,
  ])

  const preparedQuery = useMemo(() => prepareQuery(query), [query])
  const hasQuery = preparedQuery.tokens.length > 0
  const ranked = useMemo(
    () => (hasQuery ? rank(preparedQuery, localItems) : []),
    [hasQuery, preparedQuery, localItems]
  )

  // Direct hits go above the workshop's records; loose ones only show when
  // nothing else does, so "ola" never buries a customer under Localization.
  const { strongGroups, weakGroups } = useMemo(() => {
    type Group = { kind: LocalItem['kind']; rows: typeof ranked; best: number }
    const build = (rows: typeof ranked) => {
      const byKind = new Map<LocalItem['kind'], Group>()
      for (const row of rows) {
        const kind = row.item.kind
        let group = byKind.get(kind)
        if (!group) {
          group = { kind, rows: [], best: row.match.score }
          byKind.set(kind, group)
        }
        if (group.rows.length < LIMITS[kind]) group.rows.push(row)
      }
      return [...byKind.values()].sort((a, b) => b.best - a.best)
    }
    return {
      strongGroups: build(ranked.filter((r) => r.match.strong)),
      weakGroups: build(ranked.filter((r) => !r.match.strong)),
    }
  }, [ranked])

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setOpen((prev) => !prev)
      }
    }
    document.addEventListener('keydown', down)
    return () => document.removeEventListener('keydown', down)
  }, [])

  // On opening: forget what the server said last time (records change), read
  // what this person opened lately, and fetch the customers worked on last.
  useEffect(() => {
    if (!open) return
    cacheRef.current.clear()
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reading the store on open is the point
    setRecent(readRecent())
    let cancelled = false
    getRecentCustomers().then((res) => {
      if (!cancelled && res.success && res.data) setRecentCustomers(res.data)
    })
    return () => {
      cancelled = true
    }
  }, [open])

  // The server search: debounced a little, cached for the life of the
  // dialog, and never allowed to overwrite a newer answer with an older one.
  // Previous results stay on screen while the next ones load, so the list
  // never blinks empty between keystrokes.
  useEffect(() => {
    const term = query.trim()
    if (term.length < 2) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- clearing results on a short query is intentional
      setResults(EMPTY)
      setLoading(false)
      return
    }
    const key = term.toLowerCase()
    const cached = cacheRef.current.get(key)
    if (cached) {
      setResults(cached)
      setLoading(false)
      return
    }
    const seq = ++seqRef.current
    setLoading(true)
    const timer = setTimeout(() => {
      globalSearch(term).then((res) => {
        if (seq !== seqRef.current) return
        if (res.success && res.data) {
          cacheRef.current.set(key, res.data)
          setResults(res.data)
        }
        setLoading(false)
      })
    }, REMOTE_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [query])

  const close = useCallback(() => {
    setOpen(false)
    setQuery('')
  }, [])

  const pickLocal = useCallback(
    (item: LocalItem) => {
      close()
      pushRecent({
        id: item.id,
        href: item.href,
        title: item.title,
        subtitle: item.subtitle,
        kind: 'local',
      })
      if (item.run) {
        item.run()
        return
      }
      router.push(item.href)
      if (item.anchor) requestSpotlight(item.anchor)
    },
    [close, router]
  )

  const pickRecord = useCallback(
    (href: string, title: string, subtitle?: string) => {
      close()
      pushRecent({ id: href, href, title, subtitle, kind: 'record' })
      router.push(href)
    },
    [close, router]
  )

  const hasRecords =
    results.vehicles.length > 0 ||
    results.customers.length > 0 ||
    results.services.length > 0 ||
    results.parts.length > 0 ||
    results.quotes.length > 0 ||
    results.reminders.length > 0 ||
    results.inspections.length > 0 ||
    results.tireSets.length > 0
  const showWeak = !hasRecords && strongGroups.length === 0
  const nothing =
    hasQuery && !loading && !hasRecords && strongGroups.length === 0 && weakGroups.length === 0

  const groupHeading = (kind: LocalItem['kind']) => {
    switch (kind) {
      case 'setting':
      case 'settingsPage':
        return t('groups.settings')
      case 'connector':
        return t('groups.integrations')
      case 'page':
        return t('groups.pages')
      case 'action':
        return t('groups.actions')
    }
  }

  // Settings pages and settings share a heading; cmdk needs one group per
  // heading or it draws it twice, so the two kinds are merged here.
  const mergeSettings = (groups: typeof strongGroups) => {
    const merged: typeof strongGroups = []
    for (const g of groups) {
      const heading = groupHeading(g.kind)
      const existing = merged.find((m) => groupHeading(m.kind) === heading)
      if (existing) {
        existing.rows = [...existing.rows, ...g.rows]
          .sort((a, b) => b.match.score - a.match.score)
          .slice(0, LIMITS.setting)
        existing.best = Math.max(existing.best, g.best)
      } else merged.push({ ...g, rows: [...g.rows] })
    }
    return merged.sort((a, b) => b.best - a.best)
  }

  const renderLocalGroups = (groups: typeof strongGroups) =>
    mergeSettings(groups).map((group) => (
      <CommandGroup key={group.kind} heading={groupHeading(group.kind)}>
        {group.rows.map(({ item, match }) => (
          <Row
            key={item.id}
            value={item.id}
            onSelect={() => pickLocal(item)}
            icon={item.icon}
            logo={item.logo}
            title={<Highlight text={item.title} ranges={match.ranges} />}
            subtitle={item.subtitle}
            locked={item.locked}
            proLabel={t('pro')}
          />
        ))}
      </CommandGroup>
    ))

  // Recent picks: local ones are looked up again so a renamed page reads
  // right and a vanished one drops out; records keep the words they had.
  const recentRows = useMemo(() => {
    const byId = new Map(localItems.map(({ item }) => [item.id, item]))
    return recent
      .map((pick) => {
        if (pick.kind === 'local') {
          const item = byId.get(pick.id)
          return item ? { pick, item } : null
        }
        return { pick, item: null }
      })
      .filter((r): r is { pick: RecentPick; item: LocalItem | null } => r !== null)
      .slice(0, 6)
  }, [recent, localItems])

  return (
    <CommandDialog
      open={open}
      onOpenChange={(next) => (next ? setOpen(true) : close())}
      title={t('title')}
      description={t('description')}
      className="top-[6vh] translate-y-0 gap-0 rounded-xl border-border/60 shadow-2xl sm:top-[12vh] sm:max-w-2xl"
      showCloseButton={false}
      shouldFilter={false}
    >
      <div className="relative">
        <CommandInput
          placeholder={t('placeholder')}
          value={query}
          onValueChange={setQuery}
          autoFocus
        />
        {loading && <div className="search-progress" aria-hidden />}
      </div>
      <CommandList className="max-h-[min(62vh,560px)] min-h-[220px] scroll-py-2">
        {nothing && (
          <div className="flex flex-col items-center gap-1 px-6 py-12 text-center">
            <Search className="mb-2 h-5 w-5 text-muted-foreground/60" />
            <p className="text-sm font-medium">{t('noResultsFor', { query: query.trim() })}</p>
            <p className="text-xs text-muted-foreground">{t('noResultsHint')}</p>
          </div>
        )}

        {!hasQuery && recentRows.length > 0 && (
          <CommandGroup heading={t('groups.recent')}>
            {recentRows.map(({ pick, item }) =>
              item ? (
                <Row
                  key={pick.id}
                  value={`recent:${pick.id}`}
                  onSelect={() => pickLocal(item)}
                  icon={item.icon}
                  logo={item.logo}
                  title={item.title}
                  subtitle={item.subtitle}
                  locked={item.locked}
                  proLabel={t('pro')}
                />
              ) : (
                <Row
                  key={pick.id}
                  value={`recent:${pick.id}`}
                  onSelect={() => pickRecord(pick.href, pick.title, pick.subtitle)}
                  icon={iconForHref(pick.href)}
                  title={pick.title}
                  subtitle={pick.subtitle}
                />
              )
            )}
          </CommandGroup>
        )}

        {!hasQuery && recentCustomers.length > 0 && (
          <CommandGroup heading={t('recentCustomers')}>
            {recentCustomers.slice(0, RECENT_CUSTOMERS_SHOWN).map((c) => (
              <Row
                key={c.id}
                value={`recent-customer:${c.id}`}
                onSelect={() =>
                  pickRecord(
                    `/customers/${c.id}`,
                    c.name,
                    [c.company, c.email, c.phone].filter(Boolean).join(' · ') || undefined
                  )
                }
                icon={Users}
                title={c.name}
                subtitle={[c.company, c.email, c.phone].filter(Boolean).join(' · ')}
              />
            ))}
          </CommandGroup>
        )}

        {!hasQuery && (
          <CommandGroup heading={t('groups.actions')}>
            {localItems
              .filter(({ item }) => item.kind === 'action')
              .map(({ item }) => (
                <Row
                  key={item.id}
                  value={item.id}
                  onSelect={() => pickLocal(item)}
                  icon={item.icon}
                  title={item.title}
                  subtitle={item.subtitle}
                />
              ))}
          </CommandGroup>
        )}

        {hasQuery && renderLocalGroups(strongGroups)}

        {hasQuery && results.customers.length > 0 && (
          <CommandGroup heading={tNav('customers')}>
            {results.customers.map((c) => (
              <Fragment key={c.id}>
                <Row
                  value={`customer:${c.id}`}
                  onSelect={() =>
                    pickRecord(
                      `/customers/${c.id}`,
                      c.name,
                      [c.company, c.email, c.phone].filter(Boolean).join(' · ') || undefined
                    )
                  }
                  icon={Users}
                  title={c.name}
                  subtitle={[c.company, c.email, c.phone].filter(Boolean).join(' · ')}
                />
                {c.vehicles.map((v) => (
                  <Row
                    key={v.id}
                    value={`customer-vehicle:${v.id}`}
                    onSelect={() => pickRecord(`/vehicles/${v.id}`, vehicleLine(v), c.name)}
                    icon={Car}
                    title={vehicleLine(v)}
                    subtitle={c.name}
                    trailing={v.licensePlate}
                    className="ml-10"
                  />
                ))}
              </Fragment>
            ))}
          </CommandGroup>
        )}
        {hasQuery && results.vehicles.length > 0 && (
          <CommandGroup heading={tNav(isMarine ? 'vessels' : 'vehicles')}>
            {results.vehicles.map((v) => (
              <Row
                key={v.id}
                value={`vehicle:${v.id}`}
                onSelect={() =>
                  pickRecord(`/vehicles/${v.id}`, vehicleLine(v), v.licensePlate ?? undefined)
                }
                icon={Car}
                title={vehicleLine(v)}
                subtitle={
                  typeKeyEnabled && (v.hsn || v.tsn) ? formatTypeKey(v.hsn, v.tsn) : undefined
                }
                trailing={v.licensePlate}
              />
            ))}
          </CommandGroup>
        )}
        {hasQuery && results.services.length > 0 && (
          <CommandGroup heading={t('services')}>
            {results.services.map((s) => {
              const href = s.vehicle
                ? `/vehicles/${s.vehicle.id}/service/${s.id}`
                : `/sales/${s.id}`
              const subtitle = [s.vehicle ? vehicleLine(s.vehicle) : null, s.vehicle?.licensePlate]
                .filter(Boolean)
                .join(' · ')
              return (
                <Row
                  key={s.id}
                  value={`service:${s.id}`}
                  onSelect={() => pickRecord(href, s.title, subtitle || undefined)}
                  icon={Wrench}
                  title={s.title}
                  subtitle={subtitle}
                  trailing={s.invoiceNumber}
                />
              )
            })}
          </CommandGroup>
        )}
        {hasQuery && results.quotes.length > 0 && (
          <CommandGroup heading={tNav('quotes')}>
            {results.quotes.map((q) => (
              <Row
                key={q.id}
                value={`quote:${q.id}`}
                onSelect={() => pickRecord(`/quotes/${q.id}`, q.title, q.quoteNumber ?? undefined)}
                icon={FileText}
                title={q.title}
                subtitle={q.status}
                trailing={q.quoteNumber}
              />
            ))}
          </CommandGroup>
        )}
        {hasQuery && results.parts.length > 0 && (
          <CommandGroup heading={tNav('inventory')}>
            {results.parts.map((p) => (
              <Row
                key={p.id}
                value={`part:${p.id}`}
                onSelect={() => pickRecord('/inventory', p.name, p.partNumber ?? undefined)}
                icon={Package}
                title={p.name}
                subtitle={`${formatQuantity(p.quantity, p.unit)} in stock`}
                trailing={p.partNumber}
              />
            ))}
          </CommandGroup>
        )}
        {hasQuery && results.reminders.length > 0 && (
          <CommandGroup heading={tNav('reminders')}>
            {results.reminders.map((r) => {
              const href = r.vehicle ? `/vehicles/${r.vehicle.id}?tab=reminders` : '/reminders'
              const subtitle = r.vehicle
                ? `${vehicleLine(r.vehicle)}${r.vehicle.licensePlate ? ` · ${r.vehicle.licensePlate}` : ''}`
                : (r.customer?.name ?? '')
              return (
                <Row
                  key={r.id}
                  value={`reminder:${r.id}`}
                  onSelect={() => pickRecord(href, r.title, subtitle || undefined)}
                  icon={Bell}
                  title={
                    <span className={cn(r.isCompleted && 'text-muted-foreground line-through')}>
                      {r.title}
                    </span>
                  }
                  subtitle={subtitle}
                />
              )
            })}
          </CommandGroup>
        )}
        {/* Shelf code leads: the desk asks "where are these tires", and the
            code is the answer they are about to read out loud. */}
        {hasQuery && results.tireSets.length > 0 && (
          <CommandGroup heading={tNav('tireHotel')}>
            {results.tireSets.map((set) => {
              const title = set.location?.code ?? tTire(`statuses.${set.status}`)
              const subtitle = [
                set.customer?.name,
                set.vehicle ? `${set.vehicle.make} ${set.vehicle.model}` : null,
                set.size,
                tTire('list.tireCount', { count: set.quantity }),
              ]
                .filter(Boolean)
                .join(' · ')
              return (
                <Row
                  key={set.id}
                  value={`tire:${set.id}`}
                  onSelect={() => pickRecord(`/tire-hotel/${set.id}`, title, subtitle)}
                  icon={Disc3}
                  title={<span className={cn(set.location?.code && 'font-mono')}>{title}</span>}
                  subtitle={subtitle}
                  trailing={set.vehicle?.licensePlate}
                />
              )
            })}
          </CommandGroup>
        )}
        {hasQuery && results.inspections.length > 0 && (
          <CommandGroup heading={tNav('inspections')}>
            {results.inspections.map((insp) => (
              <Row
                key={insp.id}
                value={`inspection:${insp.id}`}
                onSelect={() =>
                  pickRecord(
                    `/inspections/${insp.id}`,
                    insp.template.name,
                    vehicleLine(insp.vehicle)
                  )
                }
                icon={ClipboardCheck}
                title={insp.template.name}
                subtitle={`${vehicleLine(insp.vehicle)} · ${insp.status}`}
                trailing={insp.vehicle.licensePlate}
              />
            ))}
          </CommandGroup>
        )}

        {hasQuery && showWeak && renderLocalGroups(weakGroups)}
      </CommandList>

      <div className="flex items-center justify-between gap-4 border-t px-3 py-2 text-[11px] text-muted-foreground">
        <div className="hidden items-center gap-3 sm:flex">
          <span className="flex items-center gap-1">
            <Kbd>↑</Kbd>
            <Kbd>↓</Kbd>
            <span className="ml-1">{t('hints.navigate')}</span>
          </span>
          <span className="flex items-center gap-1">
            <Kbd>↵</Kbd>
            <span className="ml-1">{t('hints.open')}</span>
          </span>
          <span className="flex items-center gap-1">
            <Kbd>esc</Kbd>
            <span className="ml-1">{t('hints.close')}</span>
          </span>
        </div>
        <div className="min-w-0 truncate">
          {loading ? t('hints.searching') : !hasQuery ? t('hints.start') : null}
        </div>
      </div>
    </CommandDialog>
  )
}
