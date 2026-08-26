'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { formatQuantity } from '@/lib/format-quantity'
import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from '@/components/ui/command'
import {
  Bell,
  Car,
  ClipboardCheck,
  Disc3,
  FileText,
  Package,
  Settings,
  Users,
  Wrench,
} from 'lucide-react'
import { globalSearch, getRecentCustomers } from '@/features/search/Actions/searchActions'

interface SearchResult {
  vehicles: {
    id: string
    make: string
    model: string
    year: number
    licensePlate: string | null
  }[]
  customers: {
    id: string
    name: string
    email: string | null
    phone: string | null
    company: string | null
    vehicles: {
      id: string
      make: string
      model: string
      year: number
      licensePlate: string | null
    }[]
  }[]
  services: {
    id: string
    title: string
    invoiceNumber: string | null
    vehicle: {
      id: string
      make: string
      model: string
      year: number
      licensePlate: string | null
    } | null
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
    vehicle: {
      id: string
      make: string
      model: string
      year: number
      licensePlate: string | null
    } | null
  }[]
  inspections: {
    id: string
    status: string
    createdAt: Date
    template: { name: string }
    vehicle: {
      id: string
      make: string
      model: string
      year: number
      licensePlate: string | null
    }
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
    vehicle: {
      id: string
      make: string
      model: string
      year: number
      licensePlate: string | null
    } | null
  }[]
}

/**
 * The settings pages worth reaching from search.
 *
 * Named by key rather than by label, because the settings sidebar already
 * names every one of these in twelve languages. Two lists of the same page
 * names would drift, and the one nobody edits is the one that goes stale.
 *
 * The keywords stay in English on purpose: they are aliases, so that someone
 * typing "vat" or "smtp" still lands on the right page whatever language the
 * app is in. The translated title and description are matched as well.
 */
const SEARCHABLE_SETTINGS = [
  {
    key: 'company',
    href: '/settings/company',
    keywords: ['company', 'business', 'branding', 'logo', 'name', 'address'],
  },
  {
    key: 'account',
    href: '/settings/account',
    keywords: ['account', 'profile', 'password', 'email', '2fa'],
  },
  { key: 'team', href: '/settings/team', keywords: ['team', 'members', 'roles', 'invite'] },
  {
    key: 'invoice',
    href: '/settings/invoice',
    keywords: ['invoice', 'layout', 'prefix', 'footer', 'due'],
  },
  {
    key: 'templates',
    href: '/settings/templates',
    keywords: ['template', 'styling', 'colors', 'font', 'header', 'quote'],
  },
  {
    key: 'payment',
    href: '/settings/payment',
    keywords: ['payment', 'bank', 'vipps', 'stripe', 'terms'],
  },
  { key: 'tax', href: '/settings/tax', keywords: ['tax', 'vat', 'rate'] },
  {
    key: 'localization',
    href: '/settings/localization',
    keywords: [
      'localization',
      'language',
      'currency',
      'locale',
      'timezone',
      'date',
      'time',
      'unit',
    ],
  },
  { key: 'customFields', href: '/settings/custom-fields', keywords: ['custom fields', 'fields'] },
  { key: 'email', href: '/settings/email', keywords: ['email', 'mail', 'smtp', 'sending'] },
  {
    key: 'workshop',
    href: '/settings/workshop',
    keywords: ['workshop', 'technician', 'labor', 'hours'],
  },
  {
    key: 'appearance',
    href: '/settings/appearance',
    keywords: ['appearance', 'theme', 'dark', 'light', 'date', 'timezone'],
  },
  { key: 'data', href: '/settings/data', keywords: ['data', 'export', 'import', 'backup'] },
  { key: 'about', href: '/settings/about', keywords: ['about', 'version', 'info'] },
] as const

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])
  return debounced
}

type RecentCustomer = {
  id: string
  name: string
  email: string | null
  phone: string | null
  company: string | null
}

export function SearchCommand() {
  const router = useRouter()
  const t = useTranslations('search')
  const tNav = useTranslations('navigation.sidebar')
  const tSettings = useTranslations('settings')
  const tTire = useTranslations('tireHotel')
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult>({
    vehicles: [],
    customers: [],
    services: [],
    parts: [],
    quotes: [],
    reminders: [],
    inspections: [],
    tireSets: [],
  })
  const [loading, setLoading] = useState(false)
  const [recentCustomers, setRecentCustomers] = useState<RecentCustomer[]>([])
  const recentFetchedRef = useRef(false)
  const debouncedQuery = useDebounce(query, 300)

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

  // Fetch recent customers when dialog opens
  useEffect(() => {
    if (open && !recentFetchedRef.current) {
      recentFetchedRef.current = true
      getRecentCustomers().then((res) => {
        if (res.success && res.data) {
          setRecentCustomers(res.data)
        }
      })
    }
    if (!open) {
      recentFetchedRef.current = false
    }
  }, [open])

  useEffect(() => {
    if (!debouncedQuery || debouncedQuery.length < 2) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- clearing results on query change is intentional
      setResults({
        vehicles: [],
        customers: [],
        services: [],
        parts: [],
        quotes: [],
        reminders: [],
        inspections: [],
        tireSets: [],
      })
      setLoading(false)
      return
    }

    let cancelled = false
    setLoading(true)

    globalSearch(debouncedQuery).then((res) => {
      if (cancelled) return
      if (res.success && res.data) {
        setResults(res.data)
      }
      setLoading(false)
    })

    return () => {
      cancelled = true
    }
  }, [debouncedQuery])

  const handleSelect = useCallback(
    (path: string) => {
      setOpen(false)
      setQuery('')
      router.push(path)
    },
    [router]
  )

  const hasQuery = debouncedQuery.length >= 2
  const hasResults =
    results.vehicles.length > 0 ||
    results.customers.length > 0 ||
    results.services.length > 0 ||
    results.parts.length > 0 ||
    results.quotes.length > 0 ||
    results.reminders.length > 0 ||
    results.inspections.length > 0 ||
    results.tireSets.length > 0
  // Matched on what the user can actually read, plus the English aliases, so
  // "vat" finds the tax page in every language and "mva" finds it in Norwegian.
  const settingsEntries = useMemo(
    () =>
      SEARCHABLE_SETTINGS.map((entry) => ({
        ...entry,
        label: tSettings(`nav.items.${entry.key}.title`),
        description: tSettings(`nav.items.${entry.key}.description`),
      })),
    [tSettings]
  )

  const matchedSettings = useMemo(() => {
    if (!hasQuery) return settingsEntries
    const q = debouncedQuery.toLowerCase()
    return settingsEntries.filter(
      (entry) =>
        entry.label.toLowerCase().includes(q) ||
        entry.description.toLowerCase().includes(q) ||
        entry.keywords.some((k) => k.toLowerCase().includes(q))
    )
  }, [hasQuery, debouncedQuery, settingsEntries])
  const showDefault = !hasQuery

  return (
    <CommandDialog
      open={open}
      onOpenChange={setOpen}
      title={t('title')}
      description={t('description')}
      className="sm:max-w-2xl"
      shouldFilter={!hasQuery}
    >
      <CommandInput placeholder={t('placeholder')} value={query} onValueChange={setQuery} />
      <CommandList className="min-h-[300px]">
        {!loading && hasQuery && !hasResults && matchedSettings.length === 0 && (
          <CommandEmpty>{t('noResults')}</CommandEmpty>
        )}

        {/* Default view: recent customers + all settings */}
        {showDefault && recentCustomers.length > 0 && (
          <CommandGroup heading={t('recentCustomers')}>
            {recentCustomers.map((c) => (
              <CommandItem
                key={c.id}
                value={`${c.name} ${c.email || ''} ${c.phone || ''} ${c.company || ''}`}
                onSelect={() => handleSelect(`/customers/${c.id}`)}
              >
                <Users className="mr-2 h-4 w-4 text-muted-foreground" />
                <div className="flex flex-col">
                  <span>{c.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {[c.company, c.email, c.phone].filter(Boolean).join(' · ')}
                  </span>
                </div>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {/* Search results: grouped by entity type — kept visible while loading to avoid flicker */}
        {hasQuery && (
          <>
            {results.customers.length > 0 && (
              <CommandGroup heading={tNav('customers')}>
                {results.customers.map((c) => (
                  <div key={c.id}>
                    <CommandItem
                      value={`${c.name} ${c.email || ''} ${c.phone || ''} ${c.company || ''}`}
                      onSelect={() => handleSelect(`/customers/${c.id}`)}
                    >
                      <Users className="mr-2 h-4 w-4 text-muted-foreground" />
                      <div className="flex flex-col">
                        <span>{c.name}</span>
                        <span className="text-xs text-muted-foreground">
                          {[c.company, c.email, c.phone].filter(Boolean).join(' · ')}
                        </span>
                      </div>
                    </CommandItem>
                    {c.vehicles.map((v) => (
                      <CommandItem
                        key={v.id}
                        value={`${c.name} ${v.year} ${v.make} ${v.model} ${v.licensePlate || ''}`}
                        onSelect={() => handleSelect(`/vehicles/${v.id}`)}
                        className="pl-10"
                      >
                        <Car className="mr-2 h-3.5 w-3.5 text-muted-foreground" />
                        <span className="text-sm">
                          {v.year} {v.make} {v.model}
                        </span>
                        {v.licensePlate && (
                          <span className="ml-2 font-mono text-xs text-muted-foreground">
                            {v.licensePlate}
                          </span>
                        )}
                      </CommandItem>
                    ))}
                  </div>
                ))}
              </CommandGroup>
            )}
            {results.vehicles.length > 0 && (
              <CommandGroup heading={tNav('vehicles')}>
                {results.vehicles.map((v) => (
                  <CommandItem
                    key={v.id}
                    value={`${v.year} ${v.make} ${v.model} ${v.licensePlate || ''}`}
                    onSelect={() => handleSelect(`/vehicles/${v.id}`)}
                  >
                    <Car className="mr-2 h-4 w-4 text-muted-foreground" />
                    <span>
                      {v.year} {v.make} {v.model}
                    </span>
                    {v.licensePlate && (
                      <span className="ml-2 font-mono text-xs text-muted-foreground">
                        {v.licensePlate}
                      </span>
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            {results.services.length > 0 && (
              <CommandGroup heading={t('services')}>
                {results.services.map((s) => (
                  <CommandItem
                    key={s.id}
                    value={`${s.title} ${s.invoiceNumber || ''} ${s.vehicle ? `${s.vehicle.make} ${s.vehicle.model}` : ''}`}
                    onSelect={() =>
                      handleSelect(
                        s.vehicle ? `/vehicles/${s.vehicle.id}/service/${s.id}` : `/sales/${s.id}`
                      )
                    }
                  >
                    <Wrench className="mr-2 h-4 w-4 text-muted-foreground" />
                    <div className="flex flex-col">
                      <span>{s.title}</span>
                      <span className="text-xs text-muted-foreground">
                        {[
                          s.invoiceNumber,
                          s.vehicle
                            ? `${s.vehicle.year} ${s.vehicle.make} ${s.vehicle.model}`
                            : null,
                          s.vehicle?.licensePlate,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </span>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            {results.quotes.length > 0 && (
              <CommandGroup heading={tNav('quotes')}>
                {results.quotes.map((q) => (
                  <CommandItem
                    key={q.id}
                    value={`${q.title} ${q.quoteNumber || ''}`}
                    onSelect={() => handleSelect(`/quotes/${q.id}`)}
                  >
                    <FileText className="mr-2 h-4 w-4 text-muted-foreground" />
                    <div className="flex flex-col">
                      <span>{q.title}</span>
                      <span className="text-xs text-muted-foreground">
                        {[q.quoteNumber, q.status].filter(Boolean).join(' · ')}
                      </span>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            {results.parts.length > 0 && (
              <CommandGroup heading={tNav('inventory')}>
                {results.parts.map((p) => (
                  <CommandItem
                    key={p.id}
                    value={`${p.name} ${p.partNumber || ''}`}
                    onSelect={() => handleSelect('/inventory')}
                  >
                    <Package className="mr-2 h-4 w-4 text-muted-foreground" />
                    <div className="flex flex-col">
                      <span>{p.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {[p.partNumber, `${formatQuantity(p.quantity, p.unit)} in stock`]
                          .filter(Boolean)
                          .join(' · ')}
                      </span>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            {results.reminders.length > 0 && (
              <CommandGroup heading={tNav('reminders')}>
                {results.reminders.map((r) => (
                  <CommandItem
                    key={r.id}
                    value={`${r.title} ${r.vehicle ? `${r.vehicle.make} ${r.vehicle.model} ${r.vehicle.licensePlate || ''}` : r.customer?.name || ''}`}
                    onSelect={() =>
                      handleSelect(
                        r.vehicle ? `/vehicles/${r.vehicle.id}?tab=reminders` : '/reminders'
                      )
                    }
                  >
                    <Bell className="mr-2 h-4 w-4 text-muted-foreground" />
                    <div className="flex flex-col">
                      <span>
                        {r.title}
                        {r.isCompleted && (
                          <span className="ml-1.5 text-muted-foreground line-through">(done)</span>
                        )}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {r.vehicle
                          ? `${r.vehicle.year} ${r.vehicle.make} ${r.vehicle.model}${r.vehicle.licensePlate ? ` · ${r.vehicle.licensePlate}` : ''}`
                          : r.customer?.name || ''}
                      </span>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            {/* Shelf code leads: the desk asks "where are these tires", and
                the code is the answer they are about to read out loud. */}
            {results.tireSets.length > 0 && (
              <CommandGroup heading={tNav('tireHotel')}>
                {results.tireSets.map((set) => (
                  <CommandItem
                    key={set.id}
                    value={`tire ${set.reference || ''} ${set.location?.code || ''} ${set.customer?.name || ''} ${set.vehicle?.make || ''} ${set.vehicle?.model || ''} ${set.vehicle?.licensePlate || ''} ${set.size || ''}`}
                    onSelect={() => handleSelect(`/tire-hotel/${set.id}`)}
                  >
                    <Disc3 className="mr-2 h-4 w-4 text-muted-foreground" />
                    <div className="flex min-w-0 flex-col">
                      <span className="truncate">
                        {set.location?.code ? (
                          <span className="font-mono">{set.location.code}</span>
                        ) : (
                          <span className="text-muted-foreground">
                            {tTire(`statuses.${set.status}`)}
                          </span>
                        )}
                        {set.vehicle?.licensePlate && ` · ${set.vehicle.licensePlate}`}
                      </span>
                      <span className="truncate text-xs text-muted-foreground">
                        {set.customer?.name ?? ''}
                        {set.vehicle
                          ? `${set.customer ? ' · ' : ''}${set.vehicle.make} ${set.vehicle.model}`
                          : ''}
                        {set.size ? ` · ${set.size}` : ''}
                        {` · ${tTire('list.tireCount', { count: set.quantity })}`}
                      </span>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            {results.inspections.length > 0 && (
              <CommandGroup heading={tNav('inspections')}>
                {results.inspections.map((insp) => (
                  <CommandItem
                    key={insp.id}
                    value={`${insp.template.name} ${insp.vehicle.make} ${insp.vehicle.model} ${insp.vehicle.licensePlate || ''}`}
                    onSelect={() => handleSelect(`/inspections/${insp.id}`)}
                  >
                    <ClipboardCheck className="mr-2 h-4 w-4 text-muted-foreground" />
                    <div className="flex flex-col">
                      <span>{insp.template.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {`${insp.vehicle.year} ${insp.vehicle.make} ${insp.vehicle.model}`}
                        {insp.vehicle.licensePlate && ` · ${insp.vehicle.licensePlate}`}
                        {` · ${insp.status}`}
                      </span>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </>
        )}

        {/* Settings group: shown in both default and search views */}
        {matchedSettings.length > 0 && (
          <CommandGroup heading={tNav('settings')}>
            {matchedSettings.map((s) => (
              <CommandItem
                key={s.href}
                value={`${s.label} ${s.keywords.join(' ')}`}
                onSelect={() => handleSelect(s.href)}
              >
                <Settings className="mr-2 h-4 w-4 text-muted-foreground" />
                <div className="flex flex-col">
                  <span>{s.label}</span>
                  <span className="text-xs text-muted-foreground">{s.description}</span>
                </div>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
      </CommandList>
      <div className="border-t px-3 py-2">
        <span className="text-xs text-muted-foreground">
          <kbd className="pointer-events-none inline-flex h-5 items-center rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground">
            ESC
          </kbd>
          <span className="ml-1.5">{t('toClose')}</span>
        </span>
      </div>
    </CommandDialog>
  )
}
