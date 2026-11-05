'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import {
  ChevronRight,
  CloudOff,
  History,
  LifeBuoy,
  Loader2,
  ScanSearch,
  Search,
  Wrench,
} from 'lucide-react'
import { AppCard } from '@/components/app-card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { openSupport } from '@/features/support/Lib/supportVisibility'
import { useFormatDate } from '@/lib/use-format-date'
import { cn } from '@/lib/utils'
import { suggestFaultCodes } from '../Actions/suggestFaultCodes'
import { normalizeFaultCode } from '../Lib/codes'
import {
  clearRecentLookups,
  pushRecentLookup,
  readRecentLookups,
  type RecentLookup,
} from '../Lib/lookups'
import { FaultCodeChip } from './FaultCodeChip'
import { FaultCodesNotice } from './FaultCodesNotice'

export interface FaultCodeOverview {
  connected: boolean
  connectable: boolean
  query: string
  available: boolean
  hits: { code: string; title: string }[]
  recent: { code: string; meaning: string | null; at: string; count: number }[]
}

type Results = { query: string; available: boolean; hits: { code: string; title: string }[] }

/** Codes to try that every workshop knows. */
const EXAMPLE_CODES = ['P0420', 'P0300', 'P0171']
/** How long typing rests before the service is asked. */
const DEBOUNCE_MS = 250

/**
 * The fault code page. A code goes straight to its page; words ("lean bank
 * 1") or the start of a code ("P04") list the matching meanings as they are
 * typed. Under it, this person's recent lookups (kept in this browser) and
 * the codes this workshop read lately.
 */
export function FaultCodeLookup({
  overview,
  supportEnabled = false,
}: {
  overview: FaultCodeOverview
  /** Whether the support widget is there to receive a question (cloud, switched on). */
  supportEnabled?: boolean
}) {
  const t = useTranslations('faultCodes.page')
  const tc = useTranslations('faultCodes')
  const router = useRouter()
  const locale = useLocale()
  const { formatDate } = useFormatDate()
  const [value, setValue] = useState(overview.query)
  const [results, setResults] = useState<Results | null>(
    overview.query
      ? { query: overview.query, available: overview.available, hits: overview.hits }
      : null
  )
  const [loading, setLoading] = useState(false)
  const latest = useRef(overview.query)
  const [recent, setRecent] = useState<RecentLookup[]>([])
  const [now, setNow] = useState(0)

  // Recent lookups live in this browser, so they appear after the first paint.
  // A search that arrived in the address bar counts as one.
  useEffect(() => {
    setNow(Date.now())
    setRecent(
      overview.query
        ? pushRecentLookup({ kind: 'words', query: overview.query })
        : readRecentLookups()
    )
  }, [overview.query])

  // Matches while typing, once typing rests; a slower answer to an older
  // query never replaces a newer one.
  useEffect(() => {
    const text = value.trim()
    latest.current = text
    if (text.length < 2 || !overview.connected) {
      setResults(null)
      setLoading(false)
      return
    }
    if (text === overview.query) {
      setResults({ query: overview.query, available: overview.available, hits: overview.hits })
      setLoading(false)
      return
    }
    setLoading(true)
    const timer = setTimeout(async () => {
      const reply = await suggestFaultCodes(text)
      if (latest.current !== text) return
      setLoading(false)
      if (reply.success && reply.data) setResults(reply.data)
    }, DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [value, overview.connected, overview.query, overview.available, overview.hits])

  const go = (raw: string) => {
    const text = raw.trim()
    if (!text) return
    const code = normalizeFaultCode(text)
    if (code) {
      router.push(`/fault-codes/${code}`)
      return
    }
    setRecent(pushRecentLookup({ kind: 'words', query: text }))
    router.push(`/fault-codes?q=${encodeURIComponent(text)}`)
  }

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    go(value)
  }

  const examples = [...EXAMPLE_CODES, t('exampleWords')]

  return (
    <div className="mx-auto w-full max-w-[100rem] space-y-4">
      <section className="relative overflow-hidden rounded-lg border border-card-edge bg-card shadow-[0_1px_2px_rgb(0_0_0/0.05),0_12px_32px_-16px_rgb(0_0_0/0.18)] before:pointer-events-none before:absolute before:inset-0 before:bg-[radial-gradient(32rem_12rem_at_0%_0%,color-mix(in_oklab,var(--primary)_10%,transparent),transparent_70%)]">
        <div className="relative space-y-5 p-5 sm:p-8">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-start gap-3">
              <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-linear-to-b from-primary/15 to-primary/5 text-primary ring-1 ring-inset ring-primary/20">
                <ScanSearch className="size-5" />
              </div>
              <div className="space-y-1">
                <h1 className="font-display text-xl font-semibold tracking-tight sm:text-2xl">
                  {t('title')}
                </h1>
                <p className="text-sm text-muted-foreground">{t('intro')}</p>
              </div>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              {supportEnabled && (
                <Button
                  type="button"
                  variant="outline"
                  size="xs"
                  className="gap-1.5"
                  onClick={() => openSupport({ subject: tc('support.subjectGeneral') })}
                >
                  <LifeBuoy className="size-3.5" />
                  {tc('support.button')}
                </Button>
              )}
            </div>
          </div>

          <FaultCodesNotice className="bg-background/60" />

          <form onSubmit={submit} className="flex flex-col gap-2 sm:flex-row" role="search">
            <label htmlFor="fault-code-lookup" className="sr-only">
              {t('lookupLabel')}
            </label>
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="fault-code-lookup"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder={t('lookupPlaceholder')}
                autoFocus
                autoComplete="off"
                spellCheck={false}
                className="h-12 bg-background/60 pl-11 pr-10 font-mono text-base"
              />
              {loading && (
                <Loader2
                  className="absolute right-3.5 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground"
                  aria-label={t('searching')}
                />
              )}
            </div>
            <Button type="submit" className="h-12 px-6">
              {t('lookup')}
            </Button>
          </form>

          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span>{t('tryExamples')}</span>
            {examples.map((example) => (
              <button
                key={example}
                type="button"
                onClick={() => {
                  setValue(example)
                  go(example)
                }}
                className={cn(
                  'rounded-md border bg-background/60 px-2 py-1 text-foreground transition-colors hover:border-primary/40 hover:bg-primary/10',
                  normalizeFaultCode(example) && 'font-mono font-semibold'
                )}
              >
                {example}
              </button>
            ))}
          </div>
        </div>
      </section>

      {!overview.connected && overview.connectable && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
          <CloudOff className="size-4 shrink-0" />
          <span>{tc('detail.notConnected')}</span>
          <Button asChild size="xs" variant="outline">
            <Link href="/settings/integrations/torqvoice-codes">{tc('detail.connect')}</Link>
          </Button>
        </div>
      )}
      {!overview.connectable && <p className="text-sm text-muted-foreground">{t('cloudOnly')}</p>}

      {results && (
        <AppCard
          icon={Search}
          title={t('results', { query: results.query })}
          badge={results.available && results.hits.length > 0 ? results.hits.length : undefined}
          contentClassName={results.available && results.hits.length > 0 ? 'p-0' : undefined}
          className={cn('transition-opacity', loading && 'opacity-60')}
        >
          {!results.available ? (
            <p className="text-sm text-muted-foreground">{tc('notAvailable')}</p>
          ) : results.hits.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {t('noResults', { query: results.query })}
            </p>
          ) : (
            <ul className="grid md:grid-cols-2">
              {results.hits.map((hit, i) => (
                <li
                  key={hit.code}
                  className={cn(
                    'border-card-edge/60',
                    i > 0 && 'border-t',
                    i === 1 && 'md:border-t-0',
                    i % 2 === 0 && 'md:border-r'
                  )}
                >
                  <CodeRow code={hit.code} title={hit.title} />
                </li>
              ))}
            </ul>
          )}
        </AppCard>
      )}

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <AppCard
          icon={History}
          title={t('recentLookups')}
          action={
            recent.length > 0 ? (
              <Button
                type="button"
                variant="ghost"
                size="xs"
                className="text-muted-foreground"
                onClick={() => {
                  clearRecentLookups()
                  setRecent([])
                }}
              >
                {t('clearRecent')}
              </Button>
            ) : undefined
          }
          contentClassName={recent.length > 0 ? 'p-0 py-1' : undefined}
        >
          {recent.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('recentLookupsEmpty')}</p>
          ) : (
            <ul className="divide-y divide-card-edge/60">
              {recent.map((r) => (
                <li key={r.kind === 'code' ? `c:${r.code}` : `w:${r.query}`}>
                  {r.kind === 'code' ? (
                    <CodeRow
                      code={r.code}
                      title={r.title}
                      meta={now ? timeAgo(r.at, now, locale) : undefined}
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setValue(r.query)
                        go(r.query)
                      }}
                      className="group flex w-full items-center gap-3 px-5 py-2.5 text-left transition-colors hover:bg-muted/50"
                    >
                      <span className="flex size-6 shrink-0 items-center justify-center rounded-md border bg-muted">
                        <Search className="size-3.5 text-muted-foreground" />
                      </span>
                      <span className="min-w-0 flex-1 truncate text-sm">“{r.query}”</span>
                      {now > 0 && (
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {timeAgo(r.at, now, locale)}
                        </span>
                      )}
                      <ChevronRight className="size-4 shrink-0 text-muted-foreground/60" />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </AppCard>

        <AppCard
          icon={Wrench}
          title={t('recent')}
          badge={overview.recent.length || undefined}
          contentClassName={overview.recent.length > 0 ? 'p-0 py-1' : undefined}
        >
          {overview.recent.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('noRecent')}</p>
          ) : (
            <ul className="divide-y divide-card-edge/60">
              {overview.recent.map((r) => (
                <li key={r.code}>
                  <CodeRow
                    code={r.code}
                    title={r.meaning}
                    meta={t('readTimes', { count: r.count, date: formatDate(r.at) })}
                  />
                </li>
              ))}
            </ul>
          )}
        </AppCard>
      </div>
    </div>
  )
}

/** "2 minutes ago", "yesterday", in the reader's language. */
function timeAgo(at: number, now: number, locale: string): string {
  const seconds = Math.round((at - now) / 1000)
  const abs = Math.abs(seconds)
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' })
  if (abs < 60) return rtf.format(seconds, 'second')
  if (abs < 3600) return rtf.format(Math.round(seconds / 60), 'minute')
  if (abs < 86_400) return rtf.format(Math.round(seconds / 3600), 'hour')
  if (abs < 604_800) return rtf.format(Math.round(seconds / 86_400), 'day')
  if (abs < 2_629_800) return rtf.format(Math.round(seconds / 604_800), 'week')
  return rtf.format(Math.round(seconds / 2_629_800), 'month')
}

/** A code, its meaning and a quiet note on the right, opening the code's page. */
function CodeRow({ code, title, meta }: { code: string; title: string | null; meta?: string }) {
  return (
    <Link
      href={`/fault-codes/${code}`}
      className="group flex items-center gap-3 px-5 py-2.5 transition-colors hover:bg-muted/50"
    >
      <FaultCodeChip code={code} />
      <span className="min-w-0 flex-1 truncate text-sm">
        {title ?? <span className="text-muted-foreground">{code}</span>}
      </span>
      {meta && (
        <span className="hidden shrink-0 text-xs text-muted-foreground sm:inline">{meta}</span>
      )}
      <ChevronRight className="size-4 shrink-0 text-muted-foreground/60" />
    </Link>
  )
}
