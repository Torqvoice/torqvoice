'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useFormatter, useLocale, useNow, useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { Flag, Loader2, RefreshCw, RotateCcw } from 'lucide-react'
import { AppCard } from '@/components/app-card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { SearchableSelect } from '@/components/ui/searchable-select'
import { Switch } from '@/components/ui/switch'
import {
  listHolidayCountries,
  refreshPublicHolidays,
  saveHolidayCountry,
  setHolidayChoice,
} from '../Actions/holidayActions'
import type { HolidayRow } from '../Lib/holidays'
import { countryName, formatDay, regionLabel } from '../Lib/format'

const NONE = '__none__'

/**
 * The country (and regions) whose public holidays close the workshop, and
 * every holiday in this year and next with a switch to close or stay open.
 */
export function PublicHolidaysCard({
  country,
  regions,
  availableRegions,
  holidays,
  fetchedAt,
  fetchError,
  year,
  canEdit,
}: {
  country: string
  regions: string[]
  availableRegions: string[]
  holidays: HolidayRow[]
  fetchedAt: string | null
  fetchError: string | null
  year: number
  canEdit: boolean
}) {
  const t = useTranslations('workshopCalendar.holidays')
  const locale = useLocale()
  const format = useFormatter()
  const now = useNow({ updateInterval: 60_000 })
  // A fetch made after the page's clock last ticked reads "just now", not "in 42 seconds".
  const since = (iso: string) => {
    const at = new Date(iso)
    return format.relativeTime(at, at > now ? at : now)
  }
  const router = useRouter()
  const [codes, setCodes] = useState<string[] | null>(null)
  const [codesError, setCodesError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [rows, setRows] = useState(holidays)

  useEffect(() => setRows(holidays), [holidays])

  useEffect(() => {
    let alive = true
    listHolidayCountries().then((res) => {
      if (!alive) return
      if (res.success && res.data) {
        setCodes(res.data.countries)
        setCodesError(res.data.error)
      } else {
        setCodes([])
        setCodesError(res.error ?? null)
      }
    })
    return () => {
      alive = false
    }
  }, [])

  const options = useMemo(() => {
    // The chosen country stays listed even when the list could not load.
    const all = new Set([...(codes ?? []), ...(country ? [country] : [])])
    return [
      { value: NONE, label: t('noCountry') },
      ...[...all]
        .map((code) => ({ value: code, label: countryName(code, locale), keywords: code }))
        .sort((a, b) => a.label.localeCompare(b.label, locale)),
    ]
  }, [codes, country, locale, t])

  const save = async (next: { country: string; regions: string[] }) => {
    setBusy(true)
    const res = await saveHolidayCountry(next)
    setBusy(false)
    if (!res.success) {
      toast.error(res.error ?? t('fetchError', { error: '' }))
      return
    }
    if (res.data?.error) toast.error(t('fetchError', { error: res.data.error }))
    else toast.success(t('saved'))
    router.refresh()
  }

  const refresh = async () => {
    setBusy(true)
    const res = await refreshPublicHolidays()
    setBusy(false)
    if (!res.success || res.data?.error) {
      toast.error(t('fetchError', { error: res.data?.error ?? res.error ?? '' }))
    } else {
      toast.success(t('saved'))
    }
    router.refresh()
  }

  const choose = async (row: HolidayRow, closed: boolean) => {
    // Back at its default, the choice is forgotten rather than stored.
    const value = closed === row.closedByDefault ? null : closed
    setRows((prev) => prev.map((r) => (r.key === row.key ? { ...r, closed } : r)))
    const res = await setHolidayChoice({ key: row.key, closed: value })
    if (!res.success) {
      setRows((prev) => prev.map((r) => (r.key === row.key ? { ...r, closed: !closed } : r)))
      toast.error(res.error ?? '')
    }
  }

  const toggleRegion = (code: string) => {
    const next = regions.includes(code) ? regions.filter((r) => r !== code) : [...regions, code]
    save({ country, regions: next })
  }

  return (
    <AppCard
      id="public-holidays"
      icon={Flag}
      title={t('title')}
      description={t('description')}
      contentClassName="space-y-5"
    >
      <div className="grid gap-4 sm:grid-cols-[minmax(0,20rem)_auto] sm:items-end">
        <div className="space-y-2">
          <Label htmlFor="holiday-country">{t('country')}</Label>
          <SearchableSelect
            id="holiday-country"
            value={country || NONE}
            disabled={!canEdit || busy}
            searchPlaceholder={t('searchCountry')}
            onValueChange={(value) => save({ country: value === NONE ? '' : value, regions: [] })}
            options={options}
          />
        </div>
        {country && (
          <div className="flex items-center gap-2">
            {canEdit && (
              <Button variant="outline" size="sm" onClick={refresh} disabled={busy}>
                {busy ? (
                  <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="mr-1 h-4 w-4" />
                )}
                {t('refresh')}
              </Button>
            )}
            <span className="text-xs text-muted-foreground">
              {fetchedAt ? t('updated', { when: since(fetchedAt) }) : t('neverUpdated')}
            </span>
          </div>
        )}
      </div>

      {codesError && (
        <p className="text-sm text-muted-foreground">
          {t('countriesFailed', { error: codesError })}
        </p>
      )}
      {fetchError && (
        <p
          role="alert"
          className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm"
        >
          {t('fetchError', { error: fetchError })}
        </p>
      )}

      {country && availableRegions.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium">{t('regions')}</p>
          <div className="flex flex-wrap gap-1.5">
            {availableRegions.map((code) => {
              const on = regions.includes(code)
              return (
                <button
                  key={code}
                  type="button"
                  disabled={!canEdit || busy}
                  aria-pressed={on}
                  title={code}
                  onClick={() => toggleRegion(code)}
                  className={
                    on
                      ? 'rounded-md border border-primary bg-primary px-2 py-1 text-xs font-medium text-primary-foreground'
                      : 'rounded-md border px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-accent'
                  }
                >
                  {regionLabel(code)}
                </button>
              )
            })}
          </div>
          <p className="text-xs text-muted-foreground">{t('regionsHint')}</p>
        </div>
      )}

      {!country ? (
        <p className="text-sm text-muted-foreground">{t('pickCountry')}</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{fetchError ? null : t('none')}</p>
      ) : (
        <div className="space-y-2">
          <p className="text-sm font-medium">{t('list', { first: year, second: year + 1 })}</p>
          <ul className="divide-y rounded-md border">
            {rows.map((row) => (
              <li
                key={row.key}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-sm"
                data-testid="holiday-row"
              >
                <Switch
                  checked={row.closed}
                  disabled={!canEdit}
                  onCheckedChange={(closed) => choose(row, closed)}
                  aria-label={`${row.localName}: ${row.closed ? t('closed') : t('open')}`}
                />
                <span className="min-w-0 flex-1">
                  <span className="font-medium">{row.localName}</span>
                  {row.name !== row.localName && (
                    <span className="ml-2 text-muted-foreground">{row.name}</span>
                  )}
                  <span className="block text-xs text-muted-foreground">
                    {row.dates.map((d) => formatDay(d, locale, { weekday: true })).join(', ')}
                  </span>
                </span>
                <span className="flex flex-wrap items-center gap-1">
                  {row.regional && (
                    <Badge variant="outline">
                      {t('regional', { regions: row.counties.map(regionLabel).join(', ') })}
                    </Badge>
                  )}
                  {!row.closedByDefault && (
                    <span className="text-xs text-muted-foreground">{t('notPublic')}</span>
                  )}
                  {row.closed !== row.closedByDefault && canEdit && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-xs"
                      onClick={() => choose(row, row.closedByDefault)}
                    >
                      <RotateCcw className="mr-1 h-3 w-3" />
                      {t('reset')}
                    </Button>
                  )}
                </span>
                <span className="w-14 text-right text-xs font-medium text-muted-foreground">
                  {row.closed ? t('closed') : t('open')}
                </span>
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted-foreground">
            <a
              href="https://date.nager.at"
              target="_blank"
              rel="noopener noreferrer"
              className="underline"
            >
              {t('source')}
            </a>
          </p>
        </div>
      )}
    </AppCard>
  )
}
