'use client'

import { useEffect, useRef } from 'react'
import Link from 'next/link'
import { ArrowRight, Loader2 } from 'lucide-react'
import { useFormatter, useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { MARKETING_URL } from '@/lib/marketing-urls'
import { safeRedirectPath } from '@/lib/safe-redirect'
import { cn } from '@/lib/utils'
import type { WhatsNewEntry } from '../Schema/whatsNewSchema'
import { WhatsNewFeedback } from './WhatsNewFeedback'

/** A path inside this app, and nothing that could leave it. */
function appPath(href: string | null): string | null {
  return safeRedirectPath(href, '') || null
}

function docsUrl(href: string | null): string | null {
  return href?.startsWith('/docs/') ? `${MARKETING_URL}${href}` : null
}

const BODY_STYLES = cn(
  'text-sm leading-relaxed text-foreground/80',
  '[&_p+p]:mt-2 [&_p]:m-0',
  '[&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5',
  '[&_h3]:mb-1 [&_h3]:mt-3 [&_h3]:text-sm [&_h3]:font-semibold [&_h3]:text-foreground',
  '[&_h4]:mb-1 [&_h4]:mt-3 [&_h4]:text-sm [&_h4]:font-medium [&_h4]:text-foreground',
  '[&_a]:font-medium [&_a]:text-foreground [&_a]:underline [&_a]:underline-offset-2',
  '[&_blockquote]:my-2 [&_blockquote]:border-l-2 [&_blockquote]:pl-3',
  '[&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-[0.85em]'
)

function Entry({
  entry,
  marked,
  timeZone,
  feedback,
  onNavigate,
}: {
  entry: WhatsNewEntry
  marked: boolean
  timeZone: string
  feedback: 'identified' | 'anonymous' | null
  onNavigate: () => void
}) {
  const t = useTranslations('common.whatsNew')
  const format = useFormatter()
  const cta = appPath(entry.ctaHref)
  const guide = docsUrl(entry.docsHref)

  return (
    <li className="group relative pb-7 pl-7 last:pb-0">
      {/* The line that runs from this entry down to the next one. */}
      <span
        aria-hidden
        className="absolute bottom-0 left-[5px] top-4 w-px bg-primary/25 group-last:hidden"
      />
      {/* Its point on the line: filled while the entry is news to the reader. */}
      <span
        role={marked ? 'img' : undefined}
        aria-label={marked ? t('unread') : undefined}
        aria-hidden={marked ? undefined : true}
        className={cn(
          'absolute left-0 top-[3px] size-[11px] rounded-full border-2 border-primary',
          marked ? 'bg-primary ring-4 ring-primary/20' : 'bg-background'
        )}
      />
      <div className="flex items-center gap-2">
        <time
          dateTime={entry.publishedAt}
          className="text-xs font-medium uppercase tracking-wide text-muted-foreground"
        >
          {/* The workshop's calendar day, like every other date in the app. */}
          {format.dateTime(new Date(entry.publishedAt), {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
            timeZone,
          })}
        </time>
        <span
          className={cn(
            'rounded-full px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-wider',
            entry.kind === 'new'
              ? 'bg-primary text-primary-foreground'
              : 'border border-primary/40 text-foreground'
          )}
        >
          {entry.kind === 'new' ? t('kindNew') : t('kindImproved')}
        </span>
      </div>
      <article className="mt-2.5 overflow-hidden rounded-xl border bg-card shadow-xs">
        {/* The card hairline the rest of the app uses: primary, gone by the far edge. */}
        <div
          aria-hidden
          className="h-0.5 bg-linear-to-r from-primary via-primary/40 to-transparent"
        />
        <div className="flex flex-col gap-2.5 p-4">
          <h3 className="text-base font-semibold leading-snug">{entry.title}</h3>
          {entry.imageUrl && (
            <img
              src={entry.imageUrl}
              alt=""
              loading="lazy"
              className="w-full rounded-lg border bg-muted object-cover"
            />
          )}
          {/* Sanitized on the server by Lib/sanitizeBody before it reaches here. */}
          <div className={BODY_STYLES} dangerouslySetInnerHTML={{ __html: entry.body }} />
          {(cta || guide) && (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pt-1">
              {cta && (
                <Button
                  asChild
                  variant="outline"
                  size="sm"
                  className="border-primary/35 bg-primary/10 hover:bg-primary/15"
                >
                  <Link href={cta} onClick={onNavigate}>
                    {entry.ctaLabel || t('open')}
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </Button>
              )}
              {guide && (
                <a
                  href={guide}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded text-sm font-medium text-muted-foreground underline-offset-2 transition-colors hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {t('guide')}
                </a>
              )}
            </div>
          )}
        </div>
        {feedback && (
          <div className="border-t bg-muted/40 px-4 py-2">
            <WhatsNewFeedback entryId={entry.id} identified={feedback === 'identified'} />
          </div>
        )}
      </article>
    </li>
  )
}

/**
 * The highlights, in a sheet from the right.
 *
 * Opened by the person, never by the app: news is something to go and read
 * when there is a quiet minute, not something to be handed in the middle of
 * writing a work order.
 */
export function WhatsNewPanel({
  open,
  onOpenChange,
  entries,
  hasMore,
  loadingMore,
  onLoadMore,
  markedIds,
  timeZone,
  appVersion,
  releaseNotesUrl,
  feedback,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  entries: WhatsNewEntry[]
  /** Whether older entries exist beyond the ones given. */
  hasMore: boolean
  loadingMore: boolean
  onLoadMore: () => void
  markedIds: ReadonlySet<string>
  /** The workshop's time zone, for the day an entry was published. */
  timeZone: string
  appVersion: string
  releaseNotesUrl: string
  feedback: 'identified' | 'anonymous' | null
}) {
  const t = useTranslations('common.whatsNew')

  // Older entries load as the end of the list scrolls into view. The button
  // under the list does the same thing, for a keyboard and for a browser
  // without the observer.
  const scroller = useRef<HTMLDivElement>(null)
  const sentinel = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const target = sentinel.current
    if (!open || !hasMore || !target || typeof IntersectionObserver === 'undefined') return
    const observer = new IntersectionObserver(
      (hits) => {
        if (hits.some((hit) => hit.isIntersecting)) onLoadMore()
      },
      { root: scroller.current, rootMargin: '200px' }
    )
    observer.observe(target)
    return () => observer.disconnect()
  }, [open, hasMore, onLoadMore])

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full gap-0 p-0 sm:max-w-md">
        <SheetHeader className="relative gap-1 bg-linear-to-b from-primary/15 to-transparent px-6 pb-5 pt-6">
          <div className="flex items-center gap-2.5">
            <SheetTitle className="text-xl">{t('title')}</SheetTitle>
            {markedIds.size > 0 && (
              <span className="rounded-full bg-primary px-2 py-0.5 text-xs font-semibold text-primary-foreground">
                {t('newCount', { count: markedIds.size })}
              </span>
            )}
          </div>
          <SheetDescription>{t('description')}</SheetDescription>
          <span
            aria-hidden
            className="absolute inset-x-0 bottom-0 h-px bg-linear-to-r from-primary via-primary/35 to-transparent"
          />
        </SheetHeader>
        <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto bg-muted/30">
          <ol className="px-6 py-6">
            {entries.map((entry) => (
              <Entry
                key={entry.id}
                entry={entry}
                marked={markedIds.has(entry.id)}
                timeZone={timeZone}
                feedback={feedback}
                onNavigate={() => onOpenChange(false)}
              />
            ))}
          </ol>
          {hasMore && (
            <div ref={sentinel} className="flex justify-center px-6 pb-6">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={onLoadMore}
                disabled={loadingMore}
                className="text-muted-foreground"
              >
                {loadingMore && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                {t('showOlder')}
              </Button>
            </div>
          )}
        </div>
        <div className="flex items-center justify-between gap-4 border-t px-6 py-3 text-sm">
          <span className="text-muted-foreground">
            {appVersion === 'development' ? appVersion : t('version', { version: appVersion })}
          </span>
          <a
            href={releaseNotesUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded font-medium underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {t('allReleaseNotes')}
          </a>
        </div>
      </SheetContent>
    </Sheet>
  )
}
