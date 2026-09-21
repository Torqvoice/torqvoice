'use client'

import { useState, type ReactNode } from 'react'
import { useTranslations } from 'next-intl'
import { Paperclip } from 'lucide-react'
import { AppCard } from '@/components/app-card'
import { cn } from '@/lib/utils'
import { MediaGrid } from './MediaGrid'
import { PhotoHandoffButton } from '../PhotoHandoffButton'
import type { ServicePageClientProps } from '../service-page-types'

type FileTab = 'images' | 'dropoff' | 'documents' | 'diagnostics' | 'video' | 'statusReports'

/** A walk round a car is a handful of shots; this is the phone route's cap too. */
const MAX_DROPOFF = 30

/** A plan with no cap says so with a number nobody will reach. */
const capOf = (max: number) => (max >= 999999 ? undefined : max)

interface FilesMediaCardProps {
  serviceRecordId: string
  customerId?: string
  images: ServicePageClientProps['imageAttachmentsForManager']
  /** Photos of the car as it arrived. Absent on a page that does not load them. */
  dropoff?: ServicePageClientProps['imageAttachmentsForManager']
  videos: ServicePageClientProps['videoAttachments']
  documents: ServicePageClientProps['documentAttachments']
  maxImages: number
  maxDiagnostics: number
  maxDocuments: number
  initialTab?: FileTab
  /**
   * Status reports: the photos and video the workshop sends the customer
   * while the job is open. They are media about the job, so they live here
   * with the rest of it. The list is the same one the classic page gives a
   * tab of its own.
   */
  statusReports?: { count: number; list: ReactNode }
}

/**
 * Everything filed on the job in one card: photos, documents, diagnostic
 * reports, video, and the status reports sent to the customer. The classic
 * page gives most of these a tab of its own at the top of the page; here they
 * are tabs of one card, each a grid of tiles with the way to add one at the end.
 *
 * The card is drawn in the middle of the work order form without belonging to
 * it. A file is saved the moment it is chosen and a caption the moment it is
 * left, so neither may mark the job as having unsaved changes, Enter in a
 * caption must not save the job, and a status report's own form must not
 * submit this one; all three stop here. It also sits outside the form's
 * fieldset: a locked invoice still takes photos, as the classic tabs allowed.
 */
export function FilesMediaCard({
  serviceRecordId,
  customerId,
  images,
  dropoff = [],
  videos,
  documents,
  maxImages,
  maxDiagnostics,
  maxDocuments,
  initialTab = 'images',
  statusReports,
}: FilesMediaCardProps) {
  const t = useTranslations('service')
  const [tab, setTab] = useState<FileTab>(initialTab)

  // The page hands over diagnostics and documents as one list, as the classic
  // tab shows them; here each has a tab of its own.
  const diagnostics = documents.filter((file) => file.category === 'diagnostic')
  const otherDocuments = documents.filter((file) => file.category !== 'diagnostic')

  // A tab under a plan cap says how much of it is used, as the classic photo tab did.
  const tabs: { value: FileTab; label: string; count: number; max?: number }[] = [
    {
      value: 'images',
      label: t('modern.media.tabs.photos'),
      count: images.length,
      max: capOf(maxImages),
    },
    { value: 'dropoff', label: t('modern.media.tabs.dropoff'), count: dropoff.length },
    {
      value: 'documents',
      label: t('header.tabs.documents'),
      count: otherDocuments.length,
      max: capOf(maxDocuments),
    },
    {
      value: 'diagnostics',
      label: t('modern.media.tabs.diagnostics'),
      count: diagnostics.length,
      max: capOf(maxDiagnostics),
    },
    { value: 'video', label: t('header.tabs.video'), count: videos.length },
    ...(statusReports
      ? [
          {
            value: 'statusReports' as const,
            label: t('header.tabs.statusReports'),
            count: statusReports.count,
          },
        ]
      : []),
  ]
  const total = images.length + dropoff.length + videos.length + documents.length

  return (
    <div
      id="files-media"
      data-testid="files-media"
      className="scroll-mt-4"
      onInput={(e) => e.stopPropagation()}
      onSubmit={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && e.target instanceof HTMLInputElement) {
          e.preventDefault()
          e.target.blur()
        }
      }}
    >
      <AppCard
        icon={Paperclip}
        title={t('modern.filesTitle')}
        action={
          <div className="flex items-center gap-3">
            <span className="hidden text-xs text-muted-foreground sm:inline">
              {t('modern.media.summary', { count: total })}
            </span>
            {/* For the photo taken out at the car: a code the phone scans. */}
            {/* On the drop-off tab the same button hands over the walk round
                the car instead. */}
            <PhotoHandoffButton
              serviceRecordId={serviceRecordId}
              purpose={tab === 'dropoff' ? 'dropoff' : 'photos'}
            />
          </div>
        }
        contentClassName="p-0"
      >
        <div
          role="tablist"
          aria-label={t('modern.filesTitle')}
          className="flex gap-1 overflow-x-auto border-b border-card-edge px-5 scrollbar-none"
        >
          {tabs.map((item) => (
            <button
              key={item.value}
              type="button"
              role="tab"
              aria-selected={tab === item.value}
              onClick={() => setTab(item.value)}
              className={cn(
                '-mb-px flex h-10 shrink-0 cursor-pointer items-center gap-2 whitespace-nowrap border-b-2 px-3 text-sm transition-colors',
                tab === item.value
                  ? 'border-primary font-semibold text-foreground'
                  : 'border-transparent font-medium text-muted-foreground hover:text-foreground'
              )}
            >
              {item.label}
              <span className="rounded bg-muted px-1.5 text-[11px] tabular-nums text-foreground">
                {item.max !== undefined ? `${item.count} / ${item.max}` : item.count}
              </span>
            </button>
          ))}
        </div>

        {/* Each grid is keyed by its tab, so switching tabs starts it from the
            job's files rather than from the last tab's tiles. */}
        <div role="tabpanel" className="@container">
          {tab === 'images' && (
            <MediaGrid
              key="image"
              kind="image"
              serviceRecordId={serviceRecordId}
              files={images}
              max={capOf(maxImages)}
              customerId={customerId}
            />
          )}
          {tab === 'dropoff' && (
            <>
              <p className="px-5 pt-4 text-[13px] text-muted-foreground">
                {t('modern.media.dropoffHint')}
              </p>
              <MediaGrid
                key="dropoff"
                kind="dropoff"
                serviceRecordId={serviceRecordId}
                files={dropoff}
                max={MAX_DROPOFF}
              />
            </>
          )}
          {tab === 'documents' && (
            <MediaGrid
              key="document"
              kind="document"
              serviceRecordId={serviceRecordId}
              files={otherDocuments}
              max={capOf(maxDocuments)}
            />
          )}
          {tab === 'diagnostics' && (
            <MediaGrid
              key="diagnostic"
              kind="diagnostic"
              serviceRecordId={serviceRecordId}
              files={diagnostics}
              max={capOf(maxDiagnostics)}
            />
          )}
          {tab === 'video' && (
            <MediaGrid key="video" kind="video" serviceRecordId={serviceRecordId} files={videos} />
          )}
          {tab === 'statusReports' && statusReports && (
            <div className="p-5 pt-4" data-testid="status-reports-section">
              {statusReports.list}
            </div>
          )}
        </div>
      </AppCard>
    </div>
  )
}
