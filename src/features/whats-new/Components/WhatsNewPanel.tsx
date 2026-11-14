'use client'

import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { useDayFormatter } from '@/features/calendar/Components/useDayFormatter'
import { MARKETING_URL } from '@/lib/marketing-urls'
import { cn } from '@/lib/utils'
import type { WhatsNewEntry } from '../Schema/whatsNewSchema'
import { WhatsNewFeedback } from './WhatsNewFeedback'

/** A path inside this app, and nothing that could leave it. */
function appPath(href: string | null): string | null {
  return href?.startsWith('/') && !href.startsWith('//') ? href : null
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
  feedback,
  onNavigate,
}: {
  entry: WhatsNewEntry
  marked: boolean
  feedback: 'identified' | 'anonymous' | null
  onNavigate: () => void
}) {
  const t = useTranslations('common.whatsNew')
  const day = useDayFormatter()
  const cta = appPath(entry.ctaHref)
  const guide = docsUrl(entry.docsHref)

  return (
    <article className="flex flex-col gap-2.5 border-b px-6 py-5 last:border-b-0">
      <div className="flex items-center gap-2">
        {marked && (
          <span className="size-1.5 rounded-full bg-primary" role="img" aria-label={t('unread')} />
        )}
        <span
          className={cn(
            'rounded px-1.5 py-0.5 text-[10.5px] font-semibold uppercase tracking-wider',
            entry.kind === 'new'
              ? 'bg-primary/15 text-foreground'
              : 'bg-muted text-muted-foreground'
          )}
        >
          {entry.kind === 'new' ? t('kindNew') : t('kindImproved')}
        </span>
        <time dateTime={entry.publishedAt} className="text-xs text-muted-foreground">
          {day.dateTime(new Date(entry.publishedAt), {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
          })}
        </time>
      </div>
      <h3 className="text-[15px] font-semibold leading-snug">{entry.title}</h3>
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
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pt-0.5">
          {cta && (
            <Button asChild variant="outline" size="sm">
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
      {feedback && <WhatsNewFeedback entryId={entry.id} identified={feedback === 'identified'} />}
    </article>
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
  markedIds,
  appVersion,
  releaseNotesUrl,
  feedback,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  entries: WhatsNewEntry[]
  markedIds: ReadonlySet<string>
  appVersion: string
  releaseNotesUrl: string
  feedback: 'identified' | 'anonymous' | null
}) {
  const t = useTranslations('common.whatsNew')

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full gap-0 p-0 sm:max-w-md">
        <SheetHeader className="border-b px-6 py-5">
          <SheetTitle className="text-lg">{t('title')}</SheetTitle>
          <SheetDescription>{t('description')}</SheetDescription>
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {entries.map((entry) => (
            <Entry
              key={entry.id}
              entry={entry}
              marked={markedIds.has(entry.id)}
              feedback={feedback}
              onNavigate={() => onOpenChange(false)}
            />
          ))}
        </div>
        <div className="flex items-center justify-between gap-4 border-t bg-muted/40 px-6 py-3 text-sm">
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
