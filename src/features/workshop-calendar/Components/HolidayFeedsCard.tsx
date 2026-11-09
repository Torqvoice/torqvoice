'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useFormatter, useLocale, useTranslations } from 'next-intl'
import { toast } from 'sonner'
import {
  CalendarRange,
  ChevronDown,
  ChevronUp,
  Link2,
  Loader2,
  RefreshCw,
  Trash2,
  Upload,
} from 'lucide-react'
import { AppCard } from '@/components/app-card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { useConfirm } from '@/components/confirm-dialog'
import {
  addHolidayFeed,
  refreshHolidayFeed,
  removeHolidayFeed,
  setHolidayFeedChoice,
} from '../Actions/holidayActions'
import type { FeedRow } from '../Lib/holidays'
import { formatDay } from '../Lib/format'
import { MAX_FEED_BYTES } from '../Schema/calendarSchema'

export interface FeedSummary {
  id: string
  name: string
  url: string | null
  fileName: string | null
  fetchedAt: string | null
  error: string | null
  eventCount: number
  rows: FeedRow[]
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname
  } catch {
    return url
  }
}

/** Holiday calendars added by link or file, and which of their days close the workshop. */
export function HolidayFeedsCard({
  feeds,
  year,
  canEdit,
}: {
  feeds: FeedSummary[]
  year: number
  canEdit: boolean
}) {
  const t = useTranslations('workshopCalendar.feeds')
  const tc = useTranslations('common')
  const locale = useLocale()
  const format = useFormatter()
  const router = useRouter()
  const confirm = useConfirm()
  const fileRef = useRef<HTMLInputElement>(null)
  const [url, setUrl] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [openFeed, setOpenFeed] = useState<string | null>(null)

  const add = async (input: { url: string } | { fileName: string; text: string }) => {
    setBusy('add')
    const res = await addHolidayFeed(input)
    setBusy(null)
    if (!res.success) {
      toast.error(res.error ?? t('addFailed'))
      return
    }
    toast.success(t('added'))
    setUrl('')
    if (res.data) setOpenFeed(res.data.id)
    router.refresh()
  }

  const onFile = async (file: File | undefined) => {
    if (!file) return
    if (file.size > MAX_FEED_BYTES) {
      toast.error(t('tooLarge'))
      return
    }
    await add({ fileName: file.name, text: await file.text() })
  }

  const refresh = async (id: string) => {
    setBusy(id)
    const res = await refreshHolidayFeed(id)
    setBusy(null)
    if (!res.success || res.data?.error) toast.error(res.data?.error ?? res.error ?? t('addFailed'))
    else toast.success(t('refreshed'))
    router.refresh()
  }

  const remove = async (feed: FeedSummary) => {
    const ok = await confirm({
      title: t('removeTitle', { name: feed.name }),
      description: t('removeDescription'),
      confirmLabel: t('remove'),
      destructive: true,
    })
    if (!ok) return
    const res = await removeHolidayFeed(feed.id)
    if (!res.success) toast.error(res.error ?? tc('errors.unexpected'))
    router.refresh()
  }

  const choose = async (feedId: string, closed: boolean, name?: string) => {
    setBusy(`${feedId}:${name ?? '*'}`)
    const res = await setHolidayFeedChoice({ feedId, name, closed })
    setBusy(null)
    if (!res.success) toast.error(res.error ?? tc('errors.unexpected'))
    router.refresh()
  }

  return (
    <AppCard
      id="holiday-calendars"
      icon={CalendarRange}
      title={t('title')}
      description={t('description')}
      contentClassName="space-y-4"
    >
      {canEdit && (
        <div className="flex flex-col gap-2 sm:flex-row">
          <form
            className="flex flex-1 gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              if (url.trim()) add({ url: url.trim() })
            }}
          >
            <Input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder={t('linkPlaceholder')}
              aria-label={t('linkPlaceholder')}
              inputMode="url"
            />
            <Button type="submit" variant="outline" disabled={!url.trim() || busy === 'add'}>
              {busy === 'add' ? (
                <Loader2 className="mr-1 h-4 w-4 animate-spin" />
              ) : (
                <Link2 className="mr-1 h-4 w-4" />
              )}
              {t('addLink')}
            </Button>
          </form>
          <Button
            variant="outline"
            onClick={() => fileRef.current?.click()}
            disabled={busy === 'add'}
          >
            <Upload className="mr-1 h-4 w-4" />
            {t('uploadFile')}
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept=".ics,text/calendar"
            className="hidden"
            onChange={(e) => {
              onFile(e.target.files?.[0])
              e.target.value = ''
            }}
          />
        </div>
      )}

      {feeds.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('empty')}</p>
      ) : (
        <ul className="space-y-3">
          {feeds.map((feed) => {
            const expanded = openFeed === feed.id
            return (
              <li key={feed.id} className="rounded-md border" data-testid="holiday-feed">
                <div className="flex flex-wrap items-start gap-2 px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{feed.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {feed.url
                        ? t('fromLink', { host: hostOf(feed.url) })
                        : t('fromFile', { file: feed.fileName ?? '' })}
                      {feed.fetchedAt &&
                        ` · ${t('updated', { when: format.relativeTime(new Date(feed.fetchedAt)) })}`}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {t('days', { count: feed.rows.length, first: year, second: year + 1 })}
                    </p>
                    {feed.error && (
                      <p role="alert" className="text-xs text-destructive">
                        {t('error', { error: feed.error })}
                      </p>
                    )}
                  </div>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setOpenFeed(expanded ? null : feed.id)}
                      aria-expanded={expanded}
                    >
                      {expanded ? (
                        <ChevronUp className="mr-1 h-4 w-4" />
                      ) : (
                        <ChevronDown className="mr-1 h-4 w-4" />
                      )}
                      {expanded ? t('hide') : t('show')}
                    </Button>
                    {canEdit && feed.url && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        aria-label={t('refresh')}
                        title={t('refresh')}
                        disabled={busy === feed.id}
                        onClick={() => refresh(feed.id)}
                      >
                        <RefreshCw
                          className={busy === feed.id ? 'h-4 w-4 animate-spin' : 'h-4 w-4'}
                        />
                      </Button>
                    )}
                    {canEdit && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive"
                        aria-label={t('remove')}
                        title={t('remove')}
                        onClick={() => remove(feed)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
                {expanded && (
                  <div className="space-y-2 border-t px-3 py-2">
                    <p className="text-xs text-muted-foreground">{t('choose')}</p>
                    {canEdit && (
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline" onClick={() => choose(feed.id, true)}>
                          {t('closeAll')}
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => choose(feed.id, false)}>
                          {t('openAll')}
                        </Button>
                      </div>
                    )}
                    <ul className="divide-y">
                      {feed.rows.map((row) => (
                        <li key={row.name} className="flex items-center gap-3 py-1.5 text-sm">
                          <Switch
                            checked={row.closed}
                            disabled={!canEdit || busy === `${feed.id}:${row.name}`}
                            onCheckedChange={(closed) => choose(feed.id, closed, row.name)}
                            aria-label={row.name}
                          />
                          <span className="min-w-0 flex-1 truncate">{row.name}</span>
                          <span className="shrink-0 text-xs text-muted-foreground">
                            {row.dates.map((d) => formatDay(d, locale)).join(', ')}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </AppCard>
  )
}
